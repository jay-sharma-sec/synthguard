"""Run a held-out multimodal ablation from a human-curated paired manifest.

This runner deliberately refuses to manufacture cross-modal pairs from unrelated
datasets. See docs/ablation_manifest.md for the required CSV contract.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True, help="CSV containing paired scenarios and validation/test splits")
    parser.add_argument("--output-dir", type=Path, default=PROJECT_ROOT / "outputs" / "reports")
    parser.add_argument(
        "--calibration-output",
        type=Path,
        default=PROJECT_ROOT / "models" / "final" / "video_detector" / "calibration.json",
        help="Calibration artifact loaded by the API at startup",
    )
    parser.add_argument("--veto-threshold", type=float, default=0.85)
    parser.add_argument("--bootstrap-iterations", type=int, default=1000)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def parse_label(value: str) -> int:
    normalized = value.strip().lower()
    if normalized in {"1", "threat", "attack", "phishing", "malicious", "spoof", "synthetic", "fake"}:
        return 1
    if normalized in {"0", "benign", "safe", "legitimate", "genuine", "bonafide", "bona fide", "authentic", "real"}:
        return 0
    raise ValueError(f"Unsupported label {value!r}; use 0/benign/genuine or 1/threat/spoof.")


def load_manifest(path: Path) -> list[dict[str, Any]]:
    required = {
        "scenario_id", "group_id", "split", "label",
        "email_label", "audio_label", "video_label",
    }
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError(f"Manifest is missing required columns: {', '.join(sorted(missing))}")
        rows = []
        seen_ids = set()
        group_splits: dict[str, str] = {}
        for line_number, raw in enumerate(reader, start=2):
            scenario_id = (raw.get("scenario_id") or "").strip()
            group_id = (raw.get("group_id") or "").strip()
            split = (raw.get("split") or "").strip().lower()
            if not scenario_id or not group_id:
                raise ValueError(f"Line {line_number}: scenario_id and group_id are required.")
            if scenario_id in seen_ids:
                raise ValueError(f"Line {line_number}: duplicate scenario_id {scenario_id!r}.")
            if split not in {"validation", "test"}:
                raise ValueError(f"Line {line_number}: split must be validation or test; got {split!r}.")
            if group_id in group_splits and group_splits[group_id] != split:
                raise ValueError(f"Group {group_id!r} appears in both validation and test splits.")
            seen_ids.add(scenario_id)
            group_splits[group_id] = split
            row = {
                "scenario_id": scenario_id,
                "group_id": group_id,
                "split": split,
                "label": parse_label(raw.get("label", "")),
                "email_text": (raw.get("email_text") or "").strip(),
                "audio_path": (raw.get("audio_path") or "").strip(),
                "video_path": (raw.get("video_path") or "").strip(),
            }
            for modality in ("email", "audio", "video"):
                has_evidence = bool(row["email_text"] if modality == "email" else row[f"{modality}_path"])
                raw_label = (raw.get(f"{modality}_label") or "").strip()
                if has_evidence and not raw_label:
                    raise ValueError(f"Line {line_number}: {modality}_label is required when {modality} evidence is present.")
                if not has_evidence and raw_label:
                    raise ValueError(f"Line {line_number}: {modality}_label must be blank when {modality} evidence is absent.")
                row[f"{modality}_label"] = parse_label(raw_label) if raw_label else None
            if not row["email_text"] and not row["audio_path"] and not row["video_path"]:
                raise ValueError(f"Line {line_number}: scenario has no evidence.")
            for field in ("audio_path", "video_path"):
                if row[field]:
                    evidence_path = Path(row[field])
                    if not evidence_path.is_absolute():
                        evidence_path = path.parent / evidence_path
                    if not evidence_path.is_file():
                        raise ValueError(f"Line {line_number}: {field} does not exist: {evidence_path}")
                    row[field] = str(evidence_path.resolve())
            rows.append(row)

    for split in ("validation", "test"):
        split_labels = {row["label"] for row in rows if row["split"] == split}
        if split_labels != {0, 1}:
            raise ValueError(f"The {split} split must contain both benign and threat scenarios.")
    return rows


def infer_scores(rows: list[dict[str, Any]], backend: Any) -> None:
    video_transform = backend.video_transform
    for index, row in enumerate(rows, start=1):
        row.update(email_score=None, audio_score=None, video_raw_score=None)
        row.update(email_status="not_provided", audio_status="not_provided", video_status="not_provided")

        if row["email_text"]:
            if backend.email_model is None or backend.email_tokenizer is None:
                row["email_status"] = "model_unavailable"
            else:
                try:
                    tokens = backend.email_tokenizer(
                        row["email_text"], return_tensors="pt", truncation=True,
                        padding="max_length", max_length=256,
                    ).to(backend.device)
                    with torch.no_grad():
                        logits = backend.email_model(**tokens).logits
                        row["email_score"] = float(torch.softmax(logits, dim=1)[0][1].item())
                    row["email_status"] = "processed"
                except Exception as exc:
                    row["email_status"] = f"failed: {type(exc).__name__}"

        if row["audio_path"]:
            if backend.audio_model is None:
                row["audio_status"] = "model_unavailable"
            else:
                try:
                    features = backend.extract_mfcc_tensor(row["audio_path"])
                    with torch.no_grad():
                        row["audio_score"] = float(torch.sigmoid(backend.audio_model(features)).item())
                    row["audio_status"] = "processed"
                except Exception as exc:
                    row["audio_status"] = f"failed: {type(exc).__name__}"

        if row["video_path"]:
            if backend.video_model is None:
                row["video_status"] = "model_unavailable"
            else:
                capture = cv2.VideoCapture(row["video_path"])
                try:
                    fps = capture.get(cv2.CAP_PROP_FPS)
                    frame_count_total = capture.get(cv2.CAP_PROP_FRAME_COUNT)
                    if fps > 0 and frame_count_total > 0 and frame_count_total / fps > backend.MAX_VIDEO_SECONDS:
                        raise ValueError(f"video exceeds {backend.MAX_VIDEO_SECONDS:g} seconds")
                    predictions = []
                    frame_number = 0
                    max_frames = int(backend.MAX_VIDEO_SECONDS * 30)
                    while capture.isOpened() and len(predictions) < 5 and frame_number < max_frames:
                        ok, frame = capture.read()
                        if not ok:
                            break
                        if frame_number % 15 == 0:
                            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                            boxes, probabilities = backend.face_detector.detect(rgb)
                            if boxes is not None:
                                for box, probability in zip(boxes, probabilities):
                                    if probability is not None and probability > 0.90:
                                        x1, y1, x2, y2 = [int(max(0, value)) for value in box]
                                        crop = rgb[y1:y2, x1:x2]
                                        if crop.size:
                                            tensor = video_transform(Image.fromarray(crop)).unsqueeze(0).to(backend.device)
                                            with torch.no_grad():
                                                predictions.append(float(torch.sigmoid(backend.video_model(tensor)).item()))
                                        break
                        frame_number += 1
                    if predictions:
                        row["video_raw_score"] = float(np.mean(predictions))
                        row["video_status"] = "processed"
                    else:
                        row["video_status"] = "failed: no_face_regions"
                except Exception as exc:
                    row["video_status"] = f"failed: {type(exc).__name__}"
                finally:
                    capture.release()

        if index % 25 == 0 or index == len(rows):
            print(f"Scored {index}/{len(rows)} scenarios")


def wilson_interval(successes: int, total: int, z: float = 1.96) -> tuple[float | None, float | None]:
    if total == 0:
        return None, None
    proportion = successes / total
    denominator = 1 + z * z / total
    center = (proportion + z * z / (2 * total)) / denominator
    radius = z * math.sqrt((proportion * (1 - proportion) / total) + z * z / (4 * total * total)) / denominator
    return max(0.0, center - radius), min(1.0, center + radius)


def group_bootstrap_intervals(
    labels: list[int], predictions: list[int], groups: list[str], iterations: int, seed: int
) -> dict[str, tuple[float | None, float | None]]:
    unique_groups = sorted(set(groups))
    if len(unique_groups) < 2:
        return {}
    group_rows = {group: [i for i, value in enumerate(groups) if value == group] for group in unique_groups}
    rng = np.random.default_rng(seed)
    samples: dict[str, list[float]] = {"accuracy": [], "false_positive_rate": [], "false_negative_rate": []}
    for _ in range(iterations):
        picked_groups = rng.choice(unique_groups, size=len(unique_groups), replace=True)
        indices = [index for group in picked_groups for index in group_rows[str(group)]]
        summary = metric_summary([labels[i] for i in indices], [predictions[i] for i in indices])
        for metric in samples:
            value = summary[metric]
            if value is not None:
                samples[metric].append(float(value))
    return {
        metric: (float(np.percentile(values, 2.5)), float(np.percentile(values, 97.5)))
        if values else (None, None)
        for metric, values in samples.items()
    }


def metric_summary(
    labels: list[int], predictions: list[int], group_ids: list[str] | None = None,
    bootstrap_iterations: int = 1000, seed: int = 42,
) -> dict[str, Any]:
    tp = sum(actual == 1 and predicted == 1 for actual, predicted in zip(labels, predictions))
    tn = sum(actual == 0 and predicted == 0 for actual, predicted in zip(labels, predictions))
    fp = sum(actual == 0 and predicted == 1 for actual, predicted in zip(labels, predictions))
    fn = sum(actual == 1 and predicted == 0 for actual, predicted in zip(labels, predictions))
    total = tp + tn + fp + fn
    accuracy = (tp + tn) / total if total else None
    fpr = fp / (fp + tn) if fp + tn else None
    fnr = fn / (fn + tp) if fn + tp else None
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if precision + recall else 0.0
    accuracy_ci = wilson_interval(tp + tn, total)
    fpr_ci = wilson_interval(fp, fp + tn)
    fnr_ci = wilson_interval(fn, fn + tp)
    result = {
        "n": total, "tp": tp, "tn": tn, "fp": fp, "fn": fn,
        "accuracy": accuracy, "accuracy_ci95_low": accuracy_ci[0], "accuracy_ci95_high": accuracy_ci[1],
        "precision": precision, "recall": recall, "f1": f1,
        "false_positive_rate": fpr, "fpr_ci95_low": fpr_ci[0], "fpr_ci95_high": fpr_ci[1],
        "false_negative_rate": fnr, "fnr_ci95_low": fnr_ci[0], "fnr_ci95_high": fnr_ci[1],
    }
    if group_ids and len(group_ids) == total:
        intervals = group_bootstrap_intervals(labels, predictions, group_ids, bootstrap_iterations, seed)
        if intervals:
            result.update({
                "accuracy_ci95_low": intervals["accuracy"][0], "accuracy_ci95_high": intervals["accuracy"][1],
                "fpr_ci95_low": intervals["false_positive_rate"][0], "fpr_ci95_high": intervals["false_positive_rate"][1],
                "fnr_ci95_low": intervals["false_negative_rate"][0], "fnr_ci95_high": intervals["false_negative_rate"][1],
                "ci_method": "95% group bootstrap",
            })
    if "ci_method" not in result:
        result["ci_method"] = "95% Wilson interval (fewer than two test groups)"
    return result


def f1_for_threshold(
    rows: list[dict[str, Any]], score_key: str, target_key: str, threshold: float
) -> tuple[float, float]:
    selected = [row for row in rows if row[score_key] is not None and row[target_key] is not None]
    summary = metric_summary([row[target_key] for row in selected], [int(row[score_key] >= threshold) for row in selected])
    return float(summary["f1"]), float(summary["recall"])


def select_threshold(rows: list[dict[str, Any]], score_key: str, target_key: str) -> float:
    selected = [row for row in rows if row[score_key] is not None and row[target_key] is not None]
    labels = {row[target_key] for row in selected}
    if labels != {0, 1}:
        raise ValueError(f"Validation data for {score_key} / {target_key} must include both classes with a processed score.")
    candidates = sorted({0.0, 1.0, *(float(row[score_key]) for row in selected)})
    scored = [(f1_for_threshold(selected, score_key, target_key, threshold), threshold) for threshold in candidates]
    # Deterministic tie-break: F1, then recall, then closest to the conventional 0.5 cut.
    (_, _), threshold = max(scored, key=lambda item: (item[0][0], item[0][1], -abs(item[1] - 0.5)))
    return threshold


def fuse(row: dict[str, Any], weights: dict[str, float], veto_threshold: float | None = None) -> float | None:
    # An ablation subset must contain every sensor named by that configuration.
    # Partial-input behavior is a separate runtime feature and is reported as coverage.
    if any(row.get(f"{name}_score") is None for name in weights):
        return None
    available = {name: row[f"{name}_score"] for name in weights}
    if veto_threshold is not None and any(
        available.get(name) is not None and available[name] >= veto_threshold for name in ("audio", "video")
    ):
        return max(max(available.values()), veto_threshold)
    weight_sum = sum(weights[name] for name in available)
    return sum(float(available[name]) * weights[name] for name in available) / weight_sum


def score_configs(rows: list[dict[str, Any]], video_tau: float, veto_threshold: float) -> dict[str, dict[str, Any]]:
    configs: dict[str, dict[str, Any]] = {
        "Email only": {"score_key": "email_score", "target_key": "email_label"},
        "Audio only": {"score_key": "audio_score", "target_key": "audio_label"},
        "Video only": {"score_key": "video_score", "target_key": "video_label"},
        "Email + audio": {"weights": {"email": 0.5, "audio": 0.5}, "target_key": "label"},
        "Email + video": {"weights": {"email": 0.5, "video": 0.5}, "target_key": "label"},
        "Audio + video": {"weights": {"audio": 0.5, "video": 0.5}, "target_key": "label"},
        "All three equal weight": {"weights": {"email": 1 / 3, "audio": 1 / 3, "video": 1 / 3}, "target_key": "label"},
        "All three naive 0.4/0.3/0.3": {"weights": {"email": 0.4, "audio": 0.3, "video": 0.3}, "target_key": "label"},
        "All three equal weight + biometric veto": {
            "weights": {"email": 1 / 3, "audio": 1 / 3, "video": 1 / 3},
            "veto": veto_threshold,
            "target_key": "label",
        },
    }
    video_tau_logit = np.log(video_tau / (1 - video_tau))
    for row in rows:
        raw_video = row["video_raw_score"]
        if raw_video is None:
            row["video_score"] = None
        else:
            clipped = float(np.clip(raw_video, 1e-6, 1 - 1e-6))
            raw_logit = np.log(clipped / (1 - clipped))
            row["video_score"] = float(1 / (1 + np.exp(-(raw_logit - video_tau_logit))))
        for name, config in configs.items():
            if "score_key" in config:
                continue
            row[f"config:{name}"] = fuse(row, config["weights"], config.get("veto"))
    return configs


def save_csv(path: Path, rows: list[dict[str, Any]], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    args = parse_args()
    # Keep argument/help inspection usable without installing the model runtime.
    global np, torch, cv2, Image
    import numpy as np
    import torch
    import cv2
    from PIL import Image

    manifest = args.manifest.resolve()
    rows = load_manifest(manifest)
    print(f"Loaded {len(rows)} curated scenarios from {manifest}")
    print("Loading local models for inference (this can take several minutes)...")
    from backend import main as backend

    infer_scores(rows, backend)
    validation_rows = [row for row in rows if row["split"] == "validation"]
    test_rows = [row for row in rows if row["split"] == "test"]
    validation_video_rows = [row for row in validation_rows if row["video_raw_score"] is not None]
    video_tau = min(max(select_threshold(validation_video_rows, "video_raw_score", "video_label"), 1e-6), 1 - 1e-6)
    configs = score_configs(rows, video_tau, args.veto_threshold)

    result_rows = []
    for name, config in configs.items():
        score_key = config.get("score_key", f"config:{name}")
        target_key = config["target_key"]
        threshold = select_threshold(validation_rows, score_key, target_key)
        validation_scored = [row for row in validation_rows if row[score_key] is not None and row[target_key] is not None]
        test_scored = [row for row in test_rows if row[score_key] is not None and row[target_key] is not None]
        test_metrics = metric_summary(
            [row[target_key] for row in test_scored],
            [int(row[score_key] >= threshold) for row in test_scored],
            [row["group_id"] for row in test_scored], args.bootstrap_iterations, args.seed,
        )
        validation_metrics = metric_summary(
            [row[target_key] for row in validation_scored],
            [int(row[score_key] >= threshold) for row in validation_scored],
        )
        result_rows.append({
            "configuration": name,
            "evaluation_target": target_key,
            "validation_threshold": threshold,
            "validation_f1": validation_metrics["f1"],
            "test_total": len(test_rows),
            "test_evaluated": len(test_scored),
            "test_coverage": len(test_scored) / len(test_rows),
            **{f"test_{key}": value for key, value in test_metrics.items()},
        })

    args.output_dir.mkdir(parents=True, exist_ok=True)
    save_csv(args.output_dir / "ablation_metrics.csv", result_rows, list(result_rows[0]))
    prediction_fields = [
        "scenario_id", "group_id", "split", "label",
        "email_label", "audio_label", "video_label",
        "email_score", "audio_score", "video_raw_score", "video_score",
        "email_status", "audio_status", "video_status",
    ]
    prediction_fields += [
        config.get("score_key", f"config:{name}")
        for name, config in configs.items()
        if config.get("score_key", f"config:{name}") not in prediction_fields
    ]
    save_csv(args.output_dir / "ablation_predictions.csv", rows, prediction_fields)

    manifest_hash = sha256_file(manifest)
    timestamp = datetime.now(timezone.utc).isoformat()
    calibration = {
        "threshold": video_tau,
        "selection_split": "validation",
        "manifest_sha256": manifest_hash,
        "seed": args.seed,
        "bootstrap_iterations": args.bootstrap_iterations,
        "generated_at_utc": timestamp,
        "validation_video_scenarios": len(validation_video_rows),
        "note": "Video sensor threshold chosen using validation video labels only; apply to the matching video model checkpoint.",
    }
    args.calibration_output.parent.mkdir(parents=True, exist_ok=True)
    args.calibration_output.write_text(json.dumps(calibration, indent=2) + "\n", encoding="utf-8")

    model_files = {
        "email": PROJECT_ROOT / "models/final/phishing_email/model.safetensors",
        "audio": PROJECT_ROOT / "models/final/audio_detector/audio_cnn_model.pth",
        "video": PROJECT_ROOT / "models/final/video_detector/model.safetensors_2",
    }
    metadata = {
        "generated_at_utc": timestamp,
        "manifest": str(manifest),
        "manifest_sha256": manifest_hash,
        "veto_threshold": args.veto_threshold,
        "video_calibration_threshold": video_tau,
        "model_checkpoint_sha256": {
            name: sha256_file(path) if path.is_file() else None
            for name, path in model_files.items()
        },
        "split_counts": {
            split: {
                "scenarios": sum(row["split"] == split for row in rows),
                "groups": len({row["group_id"] for row in rows if row["split"] == split}),
                "benign": sum(row["split"] == split and row["label"] == 0 for row in rows),
                "threat": sum(row["split"] == split and row["label"] == 1 for row in rows),
            }
            for split in ("validation", "test")
        },
        "test_sensor_status_counts": {
            sensor: {status: sum(row["split"] == "test" and row[f"{sensor}_status"] == status for row in rows)
                     for status in sorted({row[f"{sensor}_status"] for row in test_rows})}
            for sensor in ("email", "audio", "video")
        },
        "results": result_rows,
    }
    (args.output_dir / "ablation_run.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote metrics, per-scenario predictions, run metadata, and calibration to {args.output_dir}")
    print("Thresholds were selected on validation rows; test metrics are held out.")


if __name__ == "__main__":
    main()
