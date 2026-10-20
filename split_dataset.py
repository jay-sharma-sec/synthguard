import os
import pickle

input_path = "/projects/Projects/ai-phishing-defense/data/video_dataset.pkl"
output_dir = "/projects/Projects/ai-phishing-defense/data/dataset_chunks"

print("[*] Loading large pickle locally...")
with open(input_path, "rb") as f:
    full_data = pickle.load(f)

os.makedirs(output_dir, exist_ok=True)

# Split into 10 smaller, manageable chunks
num_chunks = 10
chunk_size = len(full_data) // num_chunks

print("[*] Saving chunks...")
for i in range(num_chunks):
    start_idx = i * chunk_size
    # Ensure the last chunk grabs any remaining odd frames
    end_idx = (i + 1) * chunk_size if i < (num_chunks - 1) else len(full_data)
    
    chunk_data = full_data[start_idx:end_idx]
    chunk_filename = os.path.join(output_dir, f"chunk_{i+1:02d}.pkl")
    
    with open(chunk_filename, "wb") as f:
        pickle.dump(chunk_data, f)
        
    print(f"  -> Saved {chunk_filename}")

print(f"[+] Done! Zip the '{output_dir}' folder and upload to Drive.")
