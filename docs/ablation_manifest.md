# Reproducible multimodal ablation

`scripts/run_ablation_study.py` evaluates curated paired scenarios. It does not
randomly attach unrelated audio or video to an email, and it will not accept a
single held-out split for both threshold selection and scoring.

## Manifest format

Provide a UTF-8 CSV with these columns:

| Column | Required | Meaning |
| --- | --- | --- |
| `scenario_id` | Yes | Unique investigation/scenario identifier |
| `group_id` | Yes | Source group that must stay wholly within one split (for example campaign, speaker, actor, or recording session) |
| `split` | Yes | `validation` or `test` |
| `label` | Yes | `1` / `threat` or `0` / `benign` for the scenario as a whole |
| `email_label` | Required when email is present | `threat` if the email itself is malicious, otherwise `benign` |
| `email_text` | No | Email payload text; blank means not included |
| `audio_label` | Required when audio is present | `spoof` / `synthetic` as threat, or `genuine` as benign |
| `audio_path` | No | Path to paired audio; relative paths resolve from the CSV directory |
| `video_label` | Required when video is present | `spoof` / `synthetic` as threat, or `genuine` as benign |
| `video_path` | No | Path to paired video; relative paths resolve from the CSV directory |

Each row must contain at least one modality. Both splits must contain benign and
threat scenarios, and a `group_id` cannot cross the validation/test boundary.
Use actual paired scenarios when claiming multimodal performance. If the project
does not have enough authentic paired cases, report email, audio, and video
benchmarks separately and describe any constructed fusion cases as stress tests,
not as real-world accuracy estimates.

The scenario label needs a written rule before labeling begins. For example,
decide whether a scenario is a threat when any one modality is malicious, when
multiple signals agree, or only when a predefined attack story is confirmed.
Do not infer this label from the same model scores being evaluated. Sensor labels
describe the sensor's own target: a malicious email, a spoofed voice recording,
or a manipulated video. A scenario can be a threat while containing genuine
audio/video, so do not copy the overall scenario label into every sensor label.
Leave a sensor label blank when its evidence is absent.

```csv
scenario_id,group_id,split,label,email_label,email_text,audio_label,audio_path,video_label,video_path
case-001,source-A,validation,threat,threat,"Urgent payment request",spoof,/absolute/path/voice.flac,genuine,/absolute/path/meeting.mp4
```

This example is valid only if the audio and video genuinely belong to the same
scenario. The scenario is labeled as a threat, while its authentic video remains
benign for the video detector.

## Running the benchmark

```sh
python scripts/run_ablation_study.py --manifest /path/to/paired_scenarios.csv
```

The runner loads the local model checkpoints, chooses the video calibration
threshold from validation video labels and each configuration's decision
threshold using **validation rows only**, then computes metrics on test rows. It
writes:

- `outputs/reports/ablation_metrics.csv`: test metrics, thresholds, coverage,
  confusion counts, and 95% group-bootstrap intervals for accuracy/FPR/FNR.
- `outputs/reports/ablation_predictions.csv`: per-scenario scores and sensor
  processing status.
- `outputs/reports/ablation_run.json`: split counts, manifest hash, thresholds,
  sensor availability, and results.
- `models/final/video_detector/calibration.json`: validation-selected video
  calibration threshold. The API reads this file when it starts; restart the API
  after regenerating it.

The benchmark covers the seven sensor subsets (each sensor alone, each pair,
and all three), then compares naive 0.4/0.3/0.3, equal-weight, and
equal-weight-with-biometric-veto strategies for all-three fusion. Single-sensor
metrics use the corresponding sensor label; fused metrics use the overall
scenario label. A subset is scored only when all of its sensors processed that
scenario. Coverage is reported for every row; configurations with different
coverage do not represent a strictly paired comparison.

The confidence intervals resample `group_id` clusters to account for related
scenarios from the same source. With fewer than two evaluated test groups, the
runner falls back to Wilson intervals. Neither interval corrects for dataset
shift, label errors, or training-data leakage. Keep test groups independent of
training and validation data, and review checkpoint hashes and dataset licensing
before publishing claims.
