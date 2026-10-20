import os
import glob
import pickle
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
from torchvision import models
from safetensors.torch import save_file

print("="*60)
print("  SYNTHGUARD: LOCAL FAST TRANSFER LEARNING (EFFICIENTNET-B0)")
print("="*60)

CHUNK_DIR = '/projects/Projects/ai-phishing-defense/colab_export'
OUT_WEIGHTS = '/projects/Projects/ai-phishing-defense/models/final/video_detector/model.safetensors_2'

# 1. Hardware Detection
device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f"[*] Training Device: {device}")
if device.type == 'cuda':
    print(f"[*] GPU Model: {torch.cuda.get_device_name(0)}")

# 2. Dataset Definition
class ChunkDataset(Dataset):
    def __init__(self, data_list):
        self.data = data_list
    def __len__(self):
        return len(self.data)
    def __getitem__(self, idx):
        item = self.data[idx]
        return item['tensor'], torch.tensor([item['label']], dtype=torch.float32)

# 3. Model Setup & Backbone Freezing
class VideoDeepfakeEfficientNet(nn.Module):
    def __init__(self):
        super(VideoDeepfakeEfficientNet, self).__init__()
        self.efficientnet = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.IMAGENET1K_V1)
        num_features = self.efficientnet.classifier[1].in_features
        self.efficientnet.classifier = nn.Sequential(
            nn.Dropout(p=0.5, inplace=True),
            nn.Linear(num_features, 256),
            nn.ReLU(),
            nn.Dropout(p=0.5),
            nn.Linear(256, 1)
        )

    def forward(self, x):
        return self.efficientnet(x)

model = VideoDeepfakeEfficientNet().to(device)

# FREEZE BACKBONE: Only train the classifier head for maximum laptop speed
for param in model.efficientnet.features.parameters():
    param.requires_grad = False

trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
total_params = sum(p.numel() for p in model.parameters())
print(f"[*] Total Parameters: {total_params:,} | Trainable Head: {trainable_params:,}")

criterion = nn.BCEWithLogitsLoss()
optimizer = optim.Adam(model.efficientnet.classifier.parameters(), lr=1e-3)

# 4. Training Loop
chunk_files = sorted(glob.glob(f"{CHUNK_DIR}/*.pkl"))
if not chunk_files:
    print(f"[!] No .pkl chunks found in {CHUNK_DIR}!")
    exit(1)

print(f"[*] Found {len(chunk_files)} chunk(s). Starting training...")

EPOCHS = 3
BATCH_SIZE = 64 if device.type == 'cuda' else 32

for epoch in range(EPOCHS):
    print(f"\n>>> Epoch {epoch + 1}/{EPOCHS}")
    model.train()
    
    for c_idx, chunk_file in enumerate(chunk_files):
        with open(chunk_file, 'rb') as f:
            chunk_data = pickle.load(f)
            
        loader = DataLoader(ChunkDataset(chunk_data), batch_size=BATCH_SIZE, shuffle=True)
        running_loss = 0.0
        
        for inputs, labels in loader:
            inputs, labels = inputs.to(device), labels.to(device)
            
            optimizer.zero_grad()
            outputs = model(inputs)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            
            running_loss += loss.item()
            
        avg_loss = running_loss / max(1, len(loader))
        print(f"  Chunk [{c_idx+1}/{len(chunk_files)}] ({os.path.basename(chunk_file)}) - Loss: {avg_loss:.4f}")

# 5. Export weights in SafeTensors format for the backend
print(f"\n[*] Exporting updated weights to {OUT_WEIGHTS}...")
save_file(model.state_dict(), OUT_WEIGHTS)
print("[+] Model saved successfully! Backend and ablation study are ready to use the new weights.")