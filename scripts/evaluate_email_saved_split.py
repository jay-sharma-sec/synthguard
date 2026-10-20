#!/usr/bin/env python3
"""Score the saved email split through the local SynthGuard API.

The script records per-sample scores and binary metrics. Metrics are a valid
held-out estimate only if the checkpoint's training provenance confirms that
the saved test split was never used for training or model selection.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import pickle
import time
from datetime import datetime, timezone
from pathlib import Path

import requests


ROOT = Path(__file__).resolve().parents[1]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ratio(numerator: int, denominator: int) -> float | None:
    return numerator / denominator if denominator else None


def summarize(scored_rows: list[dict[str, object]]) -> tuple[dict[str, int], dict[str, float | None]]:
    tp = sum(int(row["true_label_id"]) == 1 and int(row["predicted_label_id"]) == 1 for row in scored_rows)
    tn = sum(int(row["true_label_id"]) == 0 and int(row["predicted_label_id"]) == 0 for row in scored_rows)
    fp = sum(int(row["true_label_id"]) == 0 and int(row["predicted_label_id"]) == 1 for row in scored_rows)
    fn = sum(int(row["true_label_id"]) == 1 and int(row["predicted_label_id"]) == 0 for row in scored_rows)
    counts = {"tp": tp, "tn": tn, "fp": fp, "fn": fn}
    metrics = {
        "accuracy": ratio(tp + tn, tp + tn + fp + fn),
        "precision": ratio(tp, tp + fp),
        "recall": ratio(tp, tp + fn),
        "f1": ratio(2 * tp, 2 * tp + fp + fn),
        "false_positive_rate": ratio(fp, fp + tn),
        "false_negative_rate": ratio(fn, fn + tp),
    }
    return counts, metrics


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-base", default="http://127.0.0.1:8080/api")
    parser.add_argument("--test-split", type=Path, default=ROOT / "data/test_dataset.pkl")
    parser.add_argument("--checkpoint", type=Path, default=ROOT / "models/final/phishing_email/model.safetensors")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "outputs/reports")
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--timeout", type=float, default=120)
    args = parser.parse_args()

    split_path = args.test_split.resolve()
    checkpoint_path = args.checkpoint.resolve()
    with split_path.open("rb") as stream:
        split = pickle.load(stream)
    texts = split["texts"]
    labels = [int(value) for value in split["labels"]]
    if len(texts) != len(labels):
        raise ValueError("Saved test texts and labels have different lengths.")
    if any(label not in (0, 1) for label in labels):
        raise ValueError("Email labels must be 0 (safe) or 1 (phishing).")

    args.output_dir.mkdir(parents=True, exist_ok=True)
    prediction_path = args.output_dir / "email_test_predictions.csv"
    partial_path = args.output_dir / "email_test_predictions.partial.csv"
    rows: list[dict[str, object]] = []
    if partial_path.exists():
        with partial_path.open("r", encoding="utf-8", newline="") as stream:
            rows = list(csv.DictReader(stream))
        if len(rows) > len(texts) or any(
            int(row["true_label_id"]) != labels[index]
            or row["sample_id"] != f"email-test-{index + 1:05d}"
            for index, row in enumerate(rows)
        ):
            raise ValueError(f"Existing partial output does not match {split_path}; remove {partial_path} before restarting.")
        print(f"Resuming from {len(rows)} already-scored samples.", flush=True)
    started = time.monotonic()
    with requests.Session() as session:
        try:
            for zero_index in range(len(rows), len(texts)):
                text, true_id = texts[zero_index], labels[zero_index]
                # The API rejects requests over 100,000 characters. Its tokenizer
                # then keeps only the first 256 WordPiece tokens, so sending the
                # first 100,000 characters preserves the model-visible prefix.
                original_chars = len(str(text))
                request_text = str(text)[:100_000]
                response = session.post(
                    f"{args.api_base.rstrip('/')}/analyze/email",
                    json={"text": request_text},
                    timeout=args.timeout,
                )
                response.raise_for_status()
                result = response.json()
                prediction = result["prediction"]
                score = float(prediction["score"])
                predicted_id = int(score >= args.threshold)
                api_label = str(prediction["label"])
                expected_api_label = "phishing" if predicted_id else "legitimate"
                if api_label != expected_api_label:
                    raise ValueError(
                        f"API label/score mismatch for sample {zero_index + 1}: "
                        f"{api_label!r} vs score-derived {expected_api_label!r}."
                    )
                rows.append({
                    "sample_id": f"email-test-{zero_index + 1:05d}",
                    "true_label": "phishing" if true_id else "safe",
                    "true_label_id": true_id,
                    "predicted_score": score,
                    "predicted_label": api_label,
                    "predicted_label_id": predicted_id,
                    "original_character_count": original_chars,
                    "input_clipped_to_api_limit": original_chars > len(request_text),
                    "analysis_id": result.get("analysis_id", ""),
                })
                if len(rows) % 100 == 0 or len(rows) == len(texts):
                    with partial_path.open("w", encoding="utf-8", newline="") as stream:
                        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
                        writer.writeheader()
                        writer.writerows(rows)
                    print(f"Scored {len(rows)}/{len(texts)}", flush=True)
        except Exception:
            if rows:
                with partial_path.open("w", encoding="utf-8", newline="") as stream:
                    writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
                    writer.writeheader()
                    writer.writerows(rows)
            raise

    os.replace(partial_path, prediction_path)

    confusion, metric_values = summarize(rows)
    unclipped_rows = [row for row in rows if not bool(row["input_clipped_to_api_limit"])]
    unclipped_confusion, unclipped_metric_values = summarize(unclipped_rows)
    metrics = {
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
        "evaluation": "current-checkpoint re-score of the saved email test split",
        "qualification": (
            "Checkpoint training provenance is unverified; do not present these as "
            "held-out performance until training and model-selection records establish "
            "that this split was not used."
        ),
        "api_base": args.api_base,
        "model_name": "distilbert-base-uncased-finetuned",
        "threshold": args.threshold,
        "api_score_precision_decimal_places": 4,
        "api_input_limit_characters": 100_000,
        "input_clipping_count": sum(bool(row["input_clipped_to_api_limit"]) for row in rows),
        "sample_count": len(rows),
        "unclipped_sample_count": len(unclipped_rows),
        "test_split_path": str(split_path),
        "test_split_sha256": sha256(split_path),
        "checkpoint_path": str(checkpoint_path),
        "checkpoint_sha256": sha256(checkpoint_path),
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "confusion_matrix": confusion,
        "metrics": metric_values,
        "unclipped_confusion_matrix": unclipped_confusion,
        "unclipped_metrics": unclipped_metric_values,
        "predictions_file": str(prediction_path),
    }
    metrics_path = args.output_dir / "email_test_metrics.json"
    metrics_path.write_text(json.dumps(metrics, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metrics, indent=2))
    print(f"Wrote {prediction_path}")
    print(f"Wrote {metrics_path}")


if __name__ == "__main__":
    main()
