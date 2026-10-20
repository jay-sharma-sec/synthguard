"""Reconstruct and score the 500-row audio holdout from the supplied Colab recipe.

This is a sample-level split. The source feature batches contain no speaker or
recording IDs, so this script cannot establish source-disjoint evaluation.
"""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import pickle
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import torch
from sklearn.metrics import confusion_matrix, f1_score, precision_score, recall_score, roc_auc_score, roc_curve
from sklearn.model_selection import train_test_split
from torch import nn
from torch.utils.data import DataLoader, TensorDataset


ROOT = Path(__file__).resolve().parents[1]


class AudioDeepfakeCNN(nn.Module):
    def __init__(self) -> None:
        super().__init__()
        self.conv_block = nn.Sequential(
            nn.Conv2d(1, 32, kernel_size=3, padding=1), nn.BatchNorm2d(32), nn.ReLU(), nn.MaxPool2d(2, 2),
            nn.Conv2d(32, 64, kernel_size=3, padding=1), nn.BatchNorm2d(64), nn.ReLU(), nn.MaxPool2d(2, 2),
            nn.Conv2d(64, 128, kernel_size=3, padding=1), nn.BatchNorm2d(128), nn.ReLU(), nn.MaxPool2d(2, 2),
        )
        self.fc_block = nn.Sequential(
            nn.Flatten(), nn.Linear(128 * 5 * 37, 256), nn.ReLU(), nn.Dropout(0.5), nn.Linear(256, 1)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.fc_block(self.conv_block(x))


def digest(path: Path) -> str:
    sha = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            sha.update(block)
    return sha.hexdigest()


def read_labels(files: list[Path]) -> np.ndarray:
    chunks = []
    for path in files:
        with path.open("rb") as stream:
            batch = pickle.load(stream)
        chunks.append(np.asarray(batch["labels"], dtype=np.int64).copy())
        del batch
        gc.collect()
    return np.concatenate(chunks)


def summary(y_true: np.ndarray, y_score: np.ndarray, threshold: float) -> dict:
    y_pred = (y_score >= threshold).astype(np.int64)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred, labels=[0, 1]).ravel().tolist()
    precision = precision_score(y_true, y_pred, zero_division=0)
    recall = recall_score(y_true, y_pred, zero_division=0)
    fpr, tpr, _ = roc_curve(y_true, y_score)
    # Discrete ROC operating point nearest to equal false-positive and false-negative rates.
    eer_index = int(np.nanargmin(np.abs(fpr - (1 - tpr))))
    return {
        "threshold": threshold,
        "n": int(len(y_true)),
        "confusion_matrix": {"tp": tp, "tn": tn, "fp": fp, "fn": fn},
        "accuracy": float((tp + tn) / len(y_true)),
        "precision": float(precision),
        "recall": float(recall),
        "f1": float(f1_score(y_true, y_pred, zero_division=0)),
        "false_positive_rate": float(fp / (fp + tn)) if fp + tn else None,
        "false_negative_rate": float(fn / (fn + tp)) if fn + tp else None,
        "roc_auc": float(roc_auc_score(y_true, y_score)),
        "test_eer_estimate": float((fpr[eer_index] + (1 - tpr[eer_index])) / 2),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--features-dir", type=Path, default=ROOT / "data")
    parser.add_argument("--checkpoint", type=Path, default=ROOT / "models/final/audio_detector/audio_cnn_model.pth")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "outputs/reports")
    args = parser.parse_args()

    files = sorted(args.features_dir.glob("audio_features_part_*.pkl"))
    if not files:
        raise SystemExit(f"No audio_features_part_*.pkl files in {args.features_dir}")
    labels = read_labels(files)
    indices = np.arange(len(labels))
    train_val_idx, test_idx = train_test_split(
        indices, test_size=500, random_state=42, stratify=labels
    )
    # Reproduce the supplied training/validation split as a consistency check.
    train_test_split(train_val_idx, test_size=0.2, random_state=42, stratify=labels[train_val_idx])

    test_features = np.empty((len(test_idx), 40, 300), dtype=np.float32)
    positions_by_file: list[tuple[np.ndarray, np.ndarray]] = []
    offset = 0
    for path in files:
        with path.open("rb") as stream:
            batch = pickle.load(stream)
        end = offset + len(batch["labels"])
        positions = np.flatnonzero((test_idx >= offset) & (test_idx < end))
        local_rows = test_idx[positions] - offset
        if len(positions):
            test_features[positions] = np.asarray(batch["features"], dtype=np.float32)[local_rows]
        positions_by_file.append((positions, local_rows))
        print(f"Loaded holdout rows from {path.name}: {len(positions)}")
        offset = end
        del batch
        gc.collect()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = AudioDeepfakeCNN().to(device)
    checkpoint = torch.load(args.checkpoint, map_location=device, weights_only=False)
    state = checkpoint.get("state_dict", checkpoint) if isinstance(checkpoint, dict) else checkpoint.state_dict()
    model.load_state_dict(state)
    model.eval()

    dataset = TensorDataset(torch.from_numpy(test_features).unsqueeze(1), torch.from_numpy(labels[test_idx]))
    loader = DataLoader(dataset, batch_size=64, shuffle=False)
    scores: list[float] = []
    with torch.inference_mode():
        for features, _ in loader:
            logits = model(features.to(device)).squeeze(1)
            scores.extend(torch.sigmoid(logits).cpu().numpy().astype(float).tolist())
    y_true = labels[test_idx]
    y_score = np.asarray(scores, dtype=np.float64)
    args.output_dir.mkdir(parents=True, exist_ok=True)

    predictions_path = args.output_dir / "audio_reconstructed_test_predictions.csv"
    import csv
    with predictions_path.open("w", newline="", encoding="utf-8") as stream:
        writer = csv.writer(stream)
        writer.writerow(["sample_id", "global_row_index", "split", "true_label", "score", "predicted_label_at_0_50", "predicted_label_at_0_45"])
        for row_index, (actual, score) in enumerate(zip(y_true.tolist(), y_score.tolist())):
            writer.writerow([f"audio-row-{int(test_idx[row_index]):06d}", int(test_idx[row_index]), "test", "spoof" if actual else "genuine", f"{score:.10f}", "spoof" if score >= 0.50 else "genuine", "spoof" if score >= 0.45 else "genuine"])

    metrics = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "evaluation": "reconstructed sample-level 500-row audio holdout from supplied Colab split recipe",
        "qualification": "The split is random and sample-level. Feature batches contain no speaker/session/source IDs, so this is not source-disjoint evidence. Local checkpoint hash was not supplied by Colab and exact checkpoint identity is unverified. The supplied Colab excerpt computes test_idx but never creates a test loader or reports test metrics; these are a new local re-score of the reconstructed holdout.",
        "feature_files": [{"path": str(path), "sample_count": int(len(pickle.load(path.open('rb'))['labels']))} for path in files],
        "feature_rows": int(len(labels)),
        "feature_order": "lexicographic sorted(audio_features_part_*.pkl), matching the supplied Colab code",
        "split": {"method": "sklearn train_test_split over row indices, stratified by label", "random_state": 42, "test_size": 500, "test_label_counts": {"genuine": int(np.sum(y_true == 0)), "spoof": int(np.sum(y_true == 1))}, "source_group_ids_available": False},
        "checkpoint_path": str(args.checkpoint),
        "checkpoint_sha256": digest(args.checkpoint),
        "device": str(device),
        "metrics_threshold_0_50": summary(y_true, y_score, 0.50),
        "metrics_threshold_0_45_backend": summary(y_true, y_score, 0.45),
        "threshold_note": "0.50 matches the supplied Colab validation metric decision rule; 0.45 is the deployed backend audio threshold. Neither threshold was selected using this test holdout.",
        "predictions_file": str(predictions_path),
    }
    metrics_path = args.output_dir / "audio_reconstructed_test_metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"n": len(y_true), "metrics_at_0.50": metrics["metrics_threshold_0_50"], "metrics_at_0.45": metrics["metrics_threshold_0_45_backend"], "predictions": str(predictions_path), "metadata": str(metrics_path)}, indent=2))


if __name__ == "__main__":
    main()
