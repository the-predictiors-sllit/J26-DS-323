# Review and changes — 08 October 2026

## Findings and fixes

| Finding in uploaded archive | Change |
|---|---|
| README.md only contained a short heading | Added full handover: prerequisites, fresh setup, running, data/checkpoint requirements, folder map and limitations |
| Old template README_COMPONENT instructions described files not yet copied | Replaced stale template text with a pointer to current README |
| Backend model path depended on terminal working directory | Resolve default and relative SOLAR_MODEL_PATH from backend.py |
| UI used handwritten colours and CSS without Tailwind | Installed Tailwind 4/PostCSS; rebuilt with default utilities and shared Button/Card components |
| Repeated button styles made global changes awkward | All UI buttons use the shared Button; download link uses the same style function |
| JavaScript package.json used latest | Pinned installed versions; updated package-lock.json; verified npm ci |
| Notebook heading still requested Solar_Training_UI.zip | Updated to train.py + model.py + CNN.zip |
| Notebook downloaded test_metrics.json BEFORE evaluation | Corrected order; removed duplicate downloads; one complete backup after evaluation |
| Notebook contained previous outputs and execution counters | Cleared for a reusable fresh run; original result JSON/CSV files preserved |
| Uploaded scripts could remain cached on notebook cell rerun | Clear train/model imports before importing uploaded code |
| test_metrics.json was separate from its run history | Moved unchanged into results/deeplabv3/run_20261008_01/ |
| Historical draft scripts referred to /workspace and /tmp source paths | Added explicit CLI paths; new output directory requirement; guarded image-specific patches |
| Optional draft-script dependencies were undocumented | Added optional annotation requirements and a dedicated README |
| Missing mask directory gave an indirect filesystem error | Added a clear missing-folder message |
| Original source was compressed into long lines | Formatted Python/TypeScript for readability |

## Verified

- `npm ci --ignore-scripts`: succeeds with supplied lockfile.
- `npm run typecheck`: passes.
- `npm run build`: passes; Next.js generated the app successfully.
- Python source and all notebook code cells parse successfully.
- Notebook evaluation precedes the full backup; no stored outputs remain.
- Five API contract checks pass, including missing model, invalid image and
  response fields/geometry using a **stub prediction**.
- Actual torchvision DeepLabV3 binary architecture performs a CPU forward pass
  at test size 64 with randomly initialized weights. This is a wiring check,
  not a prediction accuracy measurement.
- Backend default model path resolves correctly from a different working directory.
- 17 originals and 17 corresponding draft masks match dimensions; masks contain
  only binary 0/255 values. This checks file structure, not annotation correctness.
- Original photographs, draft masks, manifest and recorded history/config/metrics
  are preserved byte-for-byte. Metrics were moved, not recalculated.

Review environment: Linux, Python 3.12, torch 2.6.0+cpu, torchvision 0.21.0,
Node 24.19.0. The recorded training environment in config.json remains unchanged.

## Not verified / still required

- Actual best_model.pt loading and inference: owner deliberately omitted weights.
  Check on the laptop after copying the original model. CPU architecture wiring
  checks do not prove cross-version compatibility of the omitted checkpoint.
- Fresh GPU training and final test reproduction: CNN images/masks are absent;
  Colab GPU was not available for this review. Notebook was checked statically.
- Browser click-through and visual screenshots: browser binary download failed
  in this environment. Build/type checks passed, but visual/mobile behavior still
  needs a browser check. No browser test result is claimed.
- Historical ExtraTrees/GrabCut regeneration: not executed; CNN.zip absent.
- Windows commands: documented; not executed on Windows here.
- Human annotation accuracy: reviewed folder is empty. Keep correcting the 17 masks.
- Team UI integration: other group members' source/theme/router were not supplied.
- Root group .gitignore and actual tracked files: the group repository was not
  included. This component's nested ignore rules cannot override every parent rule.
- Camera geometry, GPS data, pvlib and optimization are future implementation work.

## Run the API checks yourself (optional)

From kithmini, after backend requirements:
```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

## Merge into the existing project

Back up the original kithmini folder. Copy/merge the updated files into that folder;
do not delete the existing folder, model weights or reviewed masks. The new ZIP
contains no .pt files, dependency folders, build output or training dataset bytes.
If merging leaves the old results/test_metrics.json, the canonical copy is now
results/deeplabv3/run_20261008_01/test_metrics.json. Remove the old duplicate only
after comparing it. No Git commit, push or deployment was performed.
