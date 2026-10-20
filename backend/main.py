from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse
from pydantic import BaseModel, Field
import torch
import librosa
import numpy as np
import cv2
import os
import sys
import tempfile
import uuid
import base64
import json
import traceback
from io import BytesIO
from datetime import datetime
from facenet_pytorch import MTCNN
from torchvision import models, transforms
from safetensors.torch import load_file
from PIL import Image
import torch.nn as nn
from transformers import DistilBertTokenizerFast, DistilBertForSequenceClassification

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from src.fusion import fuse_scores

app = FastAPI(title="SynthGuard API", version="1.0.0")
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
MODEL_ROOT = os.getenv("SYNTHGUARD_MODEL_DIR", os.path.join(PROJECT_ROOT, "models"))

class RequestBodyTooLarge(Exception):
    pass


class RequestBodyLimitMiddleware:
    """Bound request bodies before FastAPI parses and spools media uploads."""

    def __init__(self, application, max_bytes: int):
        self.application = application
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope.get("method") != "POST" or not scope.get("path", "").startswith("/api/analyze/"):
            await self.application(scope, receive, send)
            return

        content_length = next((value for key, value in scope.get("headers", []) if key.lower() == b"content-length"), None)
        if content_length is not None:
            try:
                if int(content_length) > self.max_bytes:
                    response = JSONResponse(status_code=413, content={"detail": "Request exceeds the total upload limit."})
                    await response(scope, receive, send)
                    return
            except ValueError:
                response = JSONResponse(status_code=400, content={"detail": "Invalid Content-Length header."})
                await response(scope, receive, send)
                return

        received = 0
        response_started = False

        async def send_tracking(message):
            nonlocal response_started
            if message["type"] == "http.response.start":
                response_started = True
            await send(message)

        async def receive_limited():
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    raise RequestBodyTooLarge
            return message

        try:
            await self.application(scope, receive_limited, send_tracking)
        except RequestBodyTooLarge:
            if not response_started:
                response = JSONResponse(status_code=413, content={"detail": "Request exceeds the total upload limit."})
                await response(scope, receive, send)


device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

MAX_EMAIL_CHARS = int(os.getenv("SYNTHGUARD_MAX_EMAIL_CHARS", "100000"))
MAX_AUDIO_BYTES = int(os.getenv("SYNTHGUARD_MAX_AUDIO_BYTES", str(25 * 1024 * 1024)))
MAX_VIDEO_BYTES = int(os.getenv("SYNTHGUARD_MAX_VIDEO_BYTES", str(100 * 1024 * 1024)))
MAX_AUDIO_SECONDS = float(os.getenv("SYNTHGUARD_MAX_AUDIO_SECONDS", "180"))
MAX_VIDEO_SECONDS = float(os.getenv("SYNTHGUARD_MAX_VIDEO_SECONDS", "120"))
UPLOAD_CHUNK_BYTES = 1024 * 1024
ALLOWED_AUDIO_EXTENSIONS = {".wav", ".flac", ".mp3", ".ogg", ".m4a"}
ALLOWED_VIDEO_EXTENSIONS = {".mp4", ".mov", ".m4v"}
VIDEO_CALIBRATION_PATH = os.getenv(
    "SYNTHGUARD_VIDEO_CALIBRATION",
    os.path.join(MODEL_ROOT, "final", "video_detector", "calibration.json"),
)
LEGACY_VIDEO_THRESHOLD = 0.7920


def load_video_calibration_threshold() -> float:
    try:
        with open(VIDEO_CALIBRATION_PATH, "r", encoding="utf-8") as calibration_file:
            value = json.load(calibration_file).get("threshold")
        threshold = float(value)
        if 0 < threshold < 1:
            return threshold
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        pass
    return LEGACY_VIDEO_THRESHOLD


VIDEO_CALIBRATION_THRESHOLD = load_video_calibration_threshold()

MAX_REQUEST_BODY_BYTES = MAX_AUDIO_BYTES + MAX_VIDEO_BYTES + MAX_EMAIL_CHARS * 4 + 2 * 1024 * 1024
app.add_middleware(RequestBodyLimitMiddleware, max_bytes=MAX_REQUEST_BODY_BYTES)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


async def save_upload_limited(upload: UploadFile, kind: str) -> str:
    """Stream an uploaded media file to disk while enforcing type and size limits."""
    extension = os.path.splitext(upload.filename or "")[1].lower()
    allowed_extensions = ALLOWED_AUDIO_EXTENSIONS if kind == "audio" else ALLOWED_VIDEO_EXTENSIONS
    max_bytes = MAX_AUDIO_BYTES if kind == "audio" else MAX_VIDEO_BYTES
    if extension not in allowed_extensions:
        await upload.close()
        raise HTTPException(status_code=415, detail=f"Unsupported {kind} file type.")

    temp_path = None
    total_bytes = 0
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as temporary_file:
            temp_path = temporary_file.name
            while True:
                chunk = await upload.read(UPLOAD_CHUNK_BYTES)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > max_bytes:
                    raise HTTPException(status_code=413, detail=f"{kind.capitalize()} file exceeds the {max_bytes // (1024 * 1024)} MB limit.")
                temporary_file.write(chunk)
        if total_bytes == 0:
            raise HTTPException(status_code=400, detail=f"The {kind} file is empty.")
        return temp_path
    except Exception:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
        raise
    finally:
        await upload.close()


def enforce_audio_duration(path: str) -> None:
    duration = librosa.get_duration(path=path)
    if duration > MAX_AUDIO_SECONDS:
        raise HTTPException(status_code=413, detail=f"Audio exceeds the {int(MAX_AUDIO_SECONDS)} second limit.")


def enforce_video_duration(capture: cv2.VideoCapture) -> None:
    fps = capture.get(cv2.CAP_PROP_FPS)
    frame_count = capture.get(cv2.CAP_PROP_FRAME_COUNT)
    if fps > 0 and frame_count > 0 and frame_count / fps > MAX_VIDEO_SECONDS:
        raise HTTPException(status_code=413, detail=f"Video exceeds the {int(MAX_VIDEO_SECONDS)} second limit.")

def calibrate_video_score(raw_score: float, tau: float | None = None) -> float:
    tau = VIDEO_CALIBRATION_THRESHOLD if tau is None else tau
    eps = 1e-6
    clipped = max(eps, min(1.0 - eps, raw_score))
    raw_logit = np.log(clipped / (1.0 - clipped))
    tau_logit = np.log(tau / (1.0 - tau))
    return float(1.0 / (1.0 + np.exp(-(raw_logit - tau_logit))))

# --- 1. SENSOR MODELS ---

# A. Email DistilBERT
print("Initializing Local DistilBERT Phishing Model...")
try:
    email_model_path = os.path.join(MODEL_ROOT, "final", "phishing_email")
    email_tokenizer = DistilBertTokenizerFast.from_pretrained(email_model_path, local_files_only=True)
    email_model = DistilBertForSequenceClassification.from_pretrained(email_model_path)
    email_model.to(device)
    email_model.eval()
    print("-> Successfully loaded DistilBERT.")
except Exception as e:
    print(f"Failed to load DistilBERT: {e}")
    email_model = None
    email_tokenizer = None

# B. Audio CNN Model
class AudioDeepfakeCNN(nn.Module):
    def __init__(self):
        super(AudioDeepfakeCNN, self).__init__()
        self.conv_block = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1),
            nn.BatchNorm2d(32),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1),
            nn.BatchNorm2d(64),
            nn.ReLU(),
            nn.MaxPool2d(2),
            nn.Conv2d(64, 128, kernel_size=3, padding=1),
            nn.BatchNorm2d(128),
            nn.ReLU(),
            nn.MaxPool2d(2)
        )
        self.fc_block = nn.Sequential(
            nn.Flatten(),
            nn.Linear(23680, 256),
            nn.ReLU(),
            nn.Dropout(0.5),
            nn.Linear(256, 1)
        )

    def forward(self, x):
        return self.fc_block(self.conv_block(x))

print("Initializing Local Audio CNN...")
audio_model = AudioDeepfakeCNN().to(device)
audio_path = os.path.join(MODEL_ROOT, "final", "audio_detector", "audio_cnn_model.pth")

try:
    audio_ckpt = torch.load(audio_path, map_location=device)
    audio_state = audio_ckpt.get('state_dict', audio_ckpt) if isinstance(audio_ckpt, dict) else audio_ckpt.state_dict()
    audio_model.load_state_dict(audio_state)
    audio_model.eval()
    print(f"-> Successfully loaded Audio CNN from {audio_path}")
except Exception as e:
    print(f"-> Failed to load Audio CNN: {e}")
    audio_model = None

def extract_mfcc_tensor(audio_path, n_mfcc=40, max_len=300):
    y, sr = librosa.load(audio_path, sr=16000)
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=n_mfcc, hop_length=512, n_fft=2048)
    if mfcc.shape[1] < max_len:
        mfcc = np.pad(mfcc, ((0, 0), (0, max_len - mfcc.shape[1])))
    else:
        mfcc = mfcc[:, :max_len]
    return torch.tensor(mfcc, dtype=torch.float32).unsqueeze(0).unsqueeze(0).to(device)

# C. Video EfficientNet Model
class VideoDeepfakeEfficientNet(nn.Module):
    def __init__(self):
        super(VideoDeepfakeEfficientNet, self).__init__()
        self.efficientnet = models.efficientnet_b0()
        num_features = self.efficientnet.classifier[1].in_features
        self.efficientnet.classifier = nn.Sequential(
            nn.Dropout(p=0.5, inplace=True), nn.Linear(num_features, 256), nn.ReLU(), nn.Dropout(p=0.5), nn.Linear(256, 1)
        )
    def forward(self, x):
        return self.efficientnet(x)

print("Initializing Local EfficientNet Video Model...")
video_model = VideoDeepfakeEfficientNet().to(device)
try:
    video_weights_path = os.path.join(MODEL_ROOT, "final", "video_detector", "model.safetensors_2")
    video_model.load_state_dict(load_file(video_weights_path))
    video_model.eval()
    print("-> Successfully loaded Video Model.")
except Exception as e: 
    print(f"Failed to load Video Model: {e}")
    video_model = None

face_detector = MTCNN(keep_all=True, device=device)
video_transform = transforms.Compose([
    transforms.Resize((224, 224)), 
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

# --- 2. API CONTRACT SCHEMAS ---
class EmailRequest(BaseModel):
    text: str

class PredictionSchema(BaseModel):
    label: str
    score: float
    score_type: str = "probability"
    model_name: str

class AnalysisResponse(BaseModel):
    analysis_id: str
    analysis_type: str
    status: str = "completed"
    prediction: PredictionSchema
    summary: str = ""
    indicators: list = []
    frames: list = []
    modality_status: dict[str, str] = Field(default_factory=dict)
    modality_errors: dict[str, str] = Field(default_factory=dict)
    created_at: str

# --- 3. ENDPOINTS ---
@app.get("/api/health")
async def health_check():
    return {
        "status": "ok",
        "models": {
            "email": {"available": email_model is not None, "model_name": "distilbert-base-uncased-finetuned"},
            "audio": {"available": audio_model is not None, "model_name": "custom-mfcc-cnn"},
            "video": {"available": video_model is not None, "model_name": "efficientnet-b0-mtcnn"},
            "multimodal": {"available": True}
        }
    }

@app.post("/api/analyze/email", response_model=AnalysisResponse)
async def analyze_email(req: EmailRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Email text cannot be empty")
    if len(req.text) > MAX_EMAIL_CHARS:
        raise HTTPException(status_code=413, detail=f"Email text exceeds the {MAX_EMAIL_CHARS:,} character limit.")
    if email_model is None or email_tokenizer is None:
        raise HTTPException(status_code=503, detail="Local DistilBERT model is not loaded.")

    try:
        inputs = email_tokenizer(req.text, return_tensors='pt', truncation=True, padding='max_length', max_length=256).to(device)
        with torch.no_grad():
            outputs = email_model(**inputs)
            probs = torch.softmax(outputs.logits, dim=1)
            phish_prob = float(probs[0][1].item())
        
        is_phish = phish_prob >= 0.50
        
        return AnalysisResponse(
            analysis_id=f"evt-{uuid.uuid4().hex[:8]}",
            analysis_type="email",
            prediction=PredictionSchema(
                label="phishing" if is_phish else "legitimate",
                score=round(phish_prob, 4),
                score_type="softmax_probability",
                model_name="distilbert-base-uncased-finetuned"
            ),
            summary="Analyzed locally using fine-tuned DistilBERT model.",
            indicators=["DistilBERT NLP Threat Signature"] if is_phish else [],
            created_at=datetime.utcnow().isoformat() + "Z"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model error: {str(e)}")

@app.post("/api/analyze/audio", response_model=AnalysisResponse)
async def analyze_audio(file: UploadFile = File(...)):
    if audio_model is None:
        raise HTTPException(status_code=503, detail="Audio CNN model is not currently available.")
    tmp_path = await save_upload_limited(file, "audio")

    try:
        enforce_audio_duration(tmp_path)
        mfcc_tensor = extract_mfcc_tensor(tmp_path)
        with torch.no_grad():
            output = audio_model(mfcc_tensor)
            fake_score = float(torch.sigmoid(output).item())
            
        is_synthetic = fake_score >= 0.45
        return AnalysisResponse(
            analysis_id=f"evt-{uuid.uuid4().hex[:8]}",
            analysis_type="audio",
            prediction=PredictionSchema(
                label="synthetic" if is_synthetic else "genuine",
                score=round(fake_score, 4),
                score_type="cnn_sigmoid",
                model_name="custom-mfcc-cnn"
            ),
            summary="Acoustic artifact scan completed via local PyTorch CNN.",
            created_at=datetime.utcnow().isoformat() + "Z"
        )
    except Exception as e:
        traceback.print_exc()
        if os.path.exists(tmp_path): 
            os.remove(tmp_path)
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Audio processing error: {str(e)}")
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.post("/api/analyze/video", response_model=AnalysisResponse)
async def analyze_video(file: UploadFile = File(...)):
    if video_model is None:
        raise HTTPException(status_code=503, detail="Video model is not currently available.")
    tmp_path = await save_upload_limited(file, "video")

    cap = None
    try:
        cap = cv2.VideoCapture(tmp_path)
        enforce_video_duration(cap)
        predictions, frame_count = [], 0
        extracted_b64_frames = [] 
        fps = cap.get(cv2.CAP_PROP_FPS)
        max_frames_to_scan = int(MAX_VIDEO_SECONDS * min(fps if fps > 0 else 30, 60))
        
        while cap.isOpened() and len(predictions) < 5 and frame_count < max_frames_to_scan:
            ret, frame = cap.read()
            if not ret: 
                break
            if frame_count % 15 == 0:
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                boxes, probs = face_detector.detect(rgb_frame)
                if boxes is not None:
                    for box, p in zip(boxes, probs):
                        if p is not None and p > 0.90:
                            x1, y1, x2, y2 = [int(max(0, b)) for b in box]
                            face_crop = rgb_frame[y1:y2, x1:x2]
                            if face_crop.size > 0:
                                pil_img = Image.fromarray(face_crop)
                                buffered = BytesIO()
                                pil_img.save(buffered, format="JPEG")
                                img_str = base64.b64encode(buffered.getvalue()).decode("utf-8")
                                extracted_b64_frames.append(f"data:image/jpeg;base64,{img_str}")
                                
                                tensor_img = video_transform(pil_img).unsqueeze(0).to(device)
                                with torch.no_grad(): 
                                    predictions.append(torch.sigmoid(video_model(tensor_img)).item())
                            break 
            frame_count += 1
        if not predictions:
            raise HTTPException(status_code=400, detail="No valid human faces detected in video.")
            
        raw_score = float(np.mean(predictions))
        calibrated_score = calibrate_video_score(raw_score)
        is_synthetic = calibrated_score >= 0.50
        
        return AnalysisResponse(
            analysis_id=f"evt-{uuid.uuid4().hex[:8]}",
            analysis_type="video",
            prediction=PredictionSchema(
                label="synthetic" if is_synthetic else "genuine",
                score=round(calibrated_score, 4),
                score_type="calibrated_sigmoid",
                model_name="efficientnet-b0-mtcnn"
            ),
            summary=f"Extracted and analyzed {len(predictions)} face regions.",
            indicators=["Spatial/Facial Anomalies"] if is_synthetic else [],
            frames=extracted_b64_frames,
            created_at=datetime.utcnow().isoformat() + "Z"
        )
    except HTTPException:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise
    except Exception as e:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cap is not None:
            cap.release()
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.post("/api/analyze/multimodal", response_model=AnalysisResponse)
async def analyze_multimodal(
    email_text: str = Form(None),
    audio_file: UploadFile = File(None),
    video_file: UploadFile = File(None)
):
    email_score, audio_score, video_score = None, None, None
    indicators = []
    modality_status = {
        "email": "not_provided" if not (email_text and email_text.strip()) else "pending",
        "audio": "not_provided" if audio_file is None else "pending",
        "video": "not_provided" if video_file is None else "pending",
    }
    modality_errors = {}
    
    # 1. Process Email
    if email_text and email_text.strip():
        if len(email_text) > MAX_EMAIL_CHARS:
            raise HTTPException(status_code=413, detail=f"Email text exceeds the {MAX_EMAIL_CHARS:,} character limit.")
        if email_model is None or email_tokenizer is None:
            modality_status["email"] = "unavailable"
            modality_errors["email"] = "Local DistilBERT model is not loaded."
        else:
            try:
                inputs = email_tokenizer(email_text, return_tensors='pt', truncation=True, padding='max_length', max_length=256).to(device)
                with torch.no_grad():
                    outputs = email_model(**inputs)
                    probs = torch.softmax(outputs.logits, dim=1)
                    email_score = float(probs[0][1].item())
                modality_status["email"] = "processed"
                if email_score >= 0.50:
                    indicators.append("DistilBERT Text Threat")
            except Exception as exc:
                modality_status["email"] = "failed"
                modality_errors["email"] = "Text inference failed. Check backend logs."
                print(f"Email fusion error: {exc}")

    # 2. Process Audio
    if audio_file is not None:
        if audio_model is None:
            modality_status["audio"] = "unavailable"
            modality_errors["audio"] = "Local audio model is not loaded."
            await audio_file.close()
        else:
            tmp_path = await save_upload_limited(audio_file, "audio")
            try:
                enforce_audio_duration(tmp_path)
                mfcc_tensor = extract_mfcc_tensor(tmp_path)
                with torch.no_grad():
                    audio_score = float(torch.sigmoid(audio_model(mfcc_tensor)).item())
                modality_status["audio"] = "processed"
                if audio_score >= 0.45:
                    indicators.append("Acoustic Artifacts Detected")
            except HTTPException:
                raise
            except Exception as exc:
                modality_status["audio"] = "failed"
                modality_errors["audio"] = "Audio inference failed. Check encoding and backend logs."
                print(f"Audio fusion error: {exc}")
                traceback.print_exc()
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)

    # 3. Process Video
    if video_file is not None:
        if video_model is None:
            modality_status["video"] = "unavailable"
            modality_errors["video"] = "Local video model is not loaded."
            await video_file.close()
        else:
            tmp_path = await save_upload_limited(video_file, "video")
            cap = None
            try:
                cap = cv2.VideoCapture(tmp_path)
                enforce_video_duration(cap)
                predictions, frame_count = [], 0
                fps = cap.get(cv2.CAP_PROP_FPS)
                max_frames_to_scan = int(MAX_VIDEO_SECONDS * min(fps if fps > 0 else 30, 60))
                while cap.isOpened() and len(predictions) < 5 and frame_count < max_frames_to_scan:
                    ret, frame = cap.read()
                    if not ret:
                        break
                    if frame_count % 15 == 0:
                        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        boxes, probs = face_detector.detect(rgb_frame)
                        if boxes is not None:
                            for box, probability in zip(boxes, probs):
                                if probability is not None and probability > 0.90:
                                    x1, y1, x2, y2 = [int(max(0, value)) for value in box]
                                    face_crop = rgb_frame[y1:y2, x1:x2]
                                    if face_crop.size > 0:
                                        image = Image.fromarray(face_crop)
                                        tensor_image = video_transform(image).unsqueeze(0).to(device)
                                        with torch.no_grad():
                                            predictions.append(torch.sigmoid(video_model(tensor_image)).item())
                                    break
                    frame_count += 1
                if predictions:
                    raw_score = float(np.mean(predictions))
                    video_score = calibrate_video_score(raw_score)
                    modality_status["video"] = "processed"
                    if video_score >= 0.50:
                        indicators.append("Spatial/Facial Anomalies")
                else:
                    modality_status["video"] = "failed"
                    modality_errors["video"] = "No face regions could be analyzed in the uploaded video."
            except HTTPException:
                raise
            except Exception as exc:
                modality_status["video"] = "failed"
                modality_errors["video"] = "Video inference failed. Check encoding and backend logs."
                print(f"Video fusion error: {exc}")
                traceback.print_exc()
            finally:
                if cap is not None:
                    cap.release()
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)

    # 4. Late Fusion
    fused_score = fuse_scores(email_score, audio_score, video_score)
    
    if fused_score is None:
        raise HTTPException(status_code=503, detail={
            "message": "No submitted evidence could be analyzed.",
            "modality_status": modality_status,
            "modality_errors": modality_errors,
        })

    partial = any(status in {"failed", "unavailable"} for status in modality_status.values())

    is_threat = fused_score >= 0.50
    processed_modalities = [name for name, status in modality_status.items() if status == "processed"]
    single_sensor_models = {
        "email": "distilbert-base-uncased-finetuned",
        "audio": "custom-mfcc-cnn",
        "video": "efficientnet-b0-mtcnn",
    }
    is_single_sensor = len(processed_modalities) == 1
    result_model_name = single_sensor_models[processed_modalities[0]] if is_single_sensor else "synthguard-late-fusion"
    result_score_type = "single_modality_score" if is_single_sensor else "weighted_fusion"
    
    return AnalysisResponse(
        analysis_id=f"evt-{uuid.uuid4().hex[:8]}",
        analysis_type="fusion",
        prediction=PredictionSchema(
            label="threat" if is_threat else "safe",
            score=round(fused_score, 4),
                score_type=result_score_type,
                model_name=result_model_name
        ),
            summary=f"Analyzed available evidence. Email Score: {email_score if email_score is not None else 'N/A'}, Audio Score: {audio_score if audio_score is not None else 'N/A'}, Video Score: {video_score if video_score is not None else 'N/A'}",
        indicators=indicators,
        status="partial" if partial else "completed",
        modality_status=modality_status,
        modality_errors=modality_errors,
        created_at=datetime.utcnow().isoformat() + "Z"
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
