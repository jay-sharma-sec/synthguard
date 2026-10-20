import cv2
import os
import torch
from facenet_pytorch import MTCNN

def extract_and_crop_faces(video_path, output_dir, frame_skip=10):
    """
    Extracts frames from a video, detects faces using PyTorch MTCNN, 
    and saves the cropped faces to a target directory.
    """
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    # Automatically route to GPU if available, matching your audio model setup
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    
    # Initialize PyTorch MTCNN
    detector = MTCNN(keep_all=True, device=device)
    
    cap = cv2.VideoCapture(video_path)
    frame_count = 0
    saved_count = 0

    print(f"[*] Initializing scan on: {video_path}")
    print(f"[*] Using hardware backend: {device}")

    while cap.isOpened():
        ret, frame = cap.read()
        if not ret:
            break  # End of video

        # Process every Nth frame
        if frame_count % frame_skip == 0:
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            
            # Detect faces (returns bounding boxes and probabilities)
            boxes, probs = detector.detect(rgb_frame)

            if boxes is not None:
                for box, prob in zip(boxes, probs):
                    if prob is not None and prob > 0.95:
                        # Convert float coordinates to integers
                        x1, y1, x2, y2 = [int(b) for b in box]
                        
                        # Ensure coordinates stay within frame boundaries
                        x1, y1 = max(0, x1), max(0, y1)
                        
                        face_crop = frame[y1:y2, x1:x2]
                        
                        if face_crop.size > 0:
                            face_filename = os.path.join(output_dir, f"frame_{frame_count}_face.jpg")
                            cv2.imwrite(face_filename, face_crop)
                            saved_count += 1

        frame_count += 1

    cap.release()
    print(f"[+] Extraction complete. Saved {saved_count} face crops to {output_dir}")

# --- Test the Pipeline ---
if __name__ == "__main__":
    # Point this to one of your newly downloaded c40 test videos
    test_video = "/projects/Datasets/video/FaceForensics/manipulated_sequences/Deepfakes/c40/videos/137_165.mp4"
    test_output = "./extracted_faces_test"
    
    if os.path.exists(test_video):
        extract_and_crop_faces(test_video, test_output, frame_skip=15)
    else:
        print("[!] Video not found. Please check the path!")