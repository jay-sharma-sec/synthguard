import os
import glob
import cv2
import torch
import pickle
import numpy as np
from PIL import Image
from facenet_pytorch import MTCNN
from torchvision import transforms

print("="*60)
print(" FF++ MULTI-ALGORITHM DATA EXTRACTION & CHUNKING FOR COLAB")
print("="*60)

# 1. SETUP PATHS
VIDEO_DIR = '/projects/Datasets/video/FaceForensics'
OUTPUT_DIR = '/projects/Projects/ai-phishing-defense/colab_export'
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Grab all c40 manipulated videos across ALL 5 algorithms
fake_videos = glob.glob(f"{VIDEO_DIR}/manipulated_sequences/*/c40/videos/*.mp4")
# Grab all c40 real videos
real_videos = glob.glob(f"{VIDEO_DIR}/original_sequences/*/c40/videos/*.mp4")

print(f"Found {len(fake_videos)} Fake videos across all algorithms.")
print(f"Found {len(real_videos)} Real videos.")

# 2. SETUP EXTRACTOR & TRANSFORMS
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
face_detector = MTCNN(keep_all=False, device=device)

# THE CRITICAL NORMALIZATION FIX
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
])

# 3. EXTRACTION PARAMETERS
FRAMES_PER_VIDEO = 3  # Low frame count to ensure we finish in time
CHUNK_SIZE = 1500     # Safe limit for Colab RAM
data_buffer = []
chunk_index = 0

all_tasks = [(v, 1) for v in fake_videos] + [(v, 0) for v in real_videos]
np.random.shuffle(all_tasks) 

def save_chunk():
    global data_buffer, chunk_index
    if not data_buffer: return
    
    out_path = os.path.join(OUTPUT_DIR, f"ffpp_chunk_{chunk_index:03d}.pkl")
    with open(out_path, 'wb') as f:
        pickle.dump(data_buffer, f)
    print(f"\n[+] Saved {out_path} ({len(data_buffer)} tensors)")
    
    data_buffer = []
    chunk_index += 1

print("\nStarting extraction loop...")
for idx, (vid_path, label) in enumerate(all_tasks):
    try:
        cap = cv2.VideoCapture(vid_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        if total_frames <= 0:
            cap.release()
            continue
            
        frame_indices = np.linspace(0, total_frames-1, FRAMES_PER_VIDEO, dtype=int)
        
        for f_idx in frame_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, f_idx)
            ret, frame = cap.read()
            if not ret: continue
            
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            boxes, probs = face_detector.detect(rgb_frame)
            
            if boxes is not None and probs[0] > 0.90:
                x1, y1, x2, y2 = [int(max(0, b)) for b in boxes[0]]
                face_crop = rgb_frame[y1:y2, x1:x2]
                
                if face_crop.size > 0:
                    pil_img = Image.fromarray(face_crop)
                    tensor_img = transform(pil_img)
                    
                    data_buffer.append({
                        'tensor': tensor_img.cpu(), 
                        'label': label
                    })
                    
                    if len(data_buffer) >= CHUNK_SIZE:
                        save_chunk()
        cap.release()
        
    except Exception as e:
        pass 
        
    if (idx + 1) % 50 == 0:
        print(f"Processed {idx + 1}/{len(all_tasks)} videos...")

save_chunk()
print(f"\nExtraction complete! All chunks saved to {OUTPUT_DIR}")