# Evaluation output status

The pre-existing `ablation_study_results.csv` and `ablation_study_table.tex` are
historical outputs from the former benchmark runner. That runner paired
independent modality datasets by their labels and selected its video threshold
on the same records used for scoring. Treat those numbers as unverified and do
not use them as held-out performance claims.

The replacement `scripts/run_ablation_study.py` requires a curated paired
manifest and writes new results to `ablation_metrics.csv`,
`ablation_predictions.csv`, and `ablation_run.json`. See
`docs/ablation_manifest.md` for the input format and interpretation.
