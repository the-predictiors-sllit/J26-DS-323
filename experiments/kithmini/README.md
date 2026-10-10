# Kithmini — solar site segmentation

This folder is the pre-installation component of the group solar research project.
It can live at `experiments/kithmini/`; it is not a separate Git repository.
Start here even if you did not create the original project.

## What works now

- Colab GPU training of one binary DeepLabV3-ResNet50 model.
- Python FastAPI inference on a laptop CPU.
- Next.js + Tailwind CSS UI: upload JPEG/PNG, review original/mask/overlay,
  download the mask and load measured test results.
- Offline manual mask editor for the 17 local photographs.

**Not implemented:** camera calibration, GPS form, pvlib annual sun mapping,
shading-aware irradiation, PSO tilt/azimuth optimization, baseline comparison or energy estimates.
Do not present segmentation scores as angle or generation accuracy.

## Before you start

Use Python **3.11 or 3.12** for the local instructions below, Node.js **22 LTS**,
and npm. The frontend lockfile fixes exact JavaScript dependency versions.
The notebook uses Colab's GPU-enabled PyTorch installation, which is separate
from your laptop environment. Do not install the CPU training dependencies into Colab.

| Item | Included? | Where to obtain / place it |
|---|---|---|
| Python/Next.js source and Colab notebook | Yes | This folder |
| 17 original images + 17 draft masks | Yes | `data/local_17/` |
| Human-reviewed masks | No | Finish review; save to `data/local_17/masks/reviewed/` |
| CNN reference training images/masks | No | Obtain CNN.zip from the cited dataset; see `data/reference/README.md` |
| best_model.pt | No | Use Kithmini's downloaded training backup or train in Colab; copy into `models/` |
| last_model.pt | No | Only needed to resume that exact training run; keep with its run results |
| Recorded run metrics/history | Yes | `results/deeplabv3/run_20261008_01/` |
| Verified GPS / projection metadata | No | Needed for the future orientation stage, not segmentation |

A teammate can open the UI and API without model weights, but mask generation
requires `best_model.pt`. There is no public checkpoint download URL in this package.
Agree on a shared model location with the team; do not commit large `.pt` files.
You do **not** need to retrain just because these files were reorganized.

## 1. Start the backend (Windows PowerShell / VS Code)

Open a terminal **inside this kithmini folder**, where `backend.py` is visible.
The commands use the environment's executable directly, avoiding activation-policy issues.

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements-torch-cpu.txt
.\.venv\Scripts\python.exe -m pip install -r requirements-backend.txt
.\.venv\Scripts\python.exe -m uvicorn backend:app --host 127.0.0.1 --port 8000
```

If Python 3.12 is installed instead, use `py -3.12` in the first command.
On macOS/Linux create the venv with `python3.11 -m venv .venv`, then use
`.venv/bin/python` in place of `.\.venv\Scripts\python.exe`.
The CPU wheel index targets supported platforms; use the official PyTorch installer
for an unsupported platform instead.

Copy your **best_model.pt** to `kithmini/models/best_model.pt` before starting.
After adding/replacing the file, restart the backend.
Open http://127.0.0.1:8000/health: `ready` means the model loaded;
`model_missing` means the file is absent; `model_error` means it failed to load.
API docs: http://127.0.0.1:8000/docs.

The default model path is resolved relative to **backend.py**, not the current
terminal directory. `SOLAR_MODEL_PATH` may be an absolute path, or a path relative
to the kithmini folder. Python must still be able to import the backend module.
The simplest option is always to run the commands from this folder.

## 2. Start the frontend

Leave the backend running. Open a **second** terminal inside kithmini:

```powershell
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:3000. Choose a photo and click **Generate mask**.
The local default API URL is http://127.0.0.1:8000.
If it changes, copy `frontend/.env.example` to `frontend/.env.local`, edit
`NEXT_PUBLIC_API_URL` and restart Next.js. For production, rebuild after changing it.
`SOLAR_CORS_ORIGINS` controls permitted frontend origins on the backend.
Never add credentials to a `NEXT_PUBLIC_` variable: it is exposed to the browser.

Frontend checks (run inside frontend/):
```powershell
npm run typecheck
npm run build
```

On **Model evaluation**, select
`results/deeplabv3/run_20261008_01/test_metrics.json` from this folder.

## 3. Train from scratch in Colab (optional if the trained model is already saved)

1. Upload `notebooks/Train_Solar_DeepLabV3.ipynb` to Colab.
2. Select a GPU runtime. Run cells in order.
3. When prompted, select **train.py**, **model.py** (from this folder) and **CNN.zip**.
   Do not upload the entire UI ZIP or local draft masks.
4. Check the displayed split counts and image/mask pairs.
5. Train; inspect validation curves; freeze choices before final test evaluation.
6. Run final evaluation **before** downloading the complete backup.
7. Download `Solar_Training_Backup.zip`. It includes both checkpoints, history,
   config and test metrics. With `USE_DRIVE=False`, Colab files are temporary.
8. Copy best_model.pt into `models/`. Put other files in a **new** run folder under
   `results/deeplabv3/`. Preserve the recorded run_20261008_01 experiment.

`/content/solar_work/code` and `/content/solar_work/dataset` are intentional
**Colab paths**. They are unrelated to Windows paths or where the notebook is saved.
Fresh runs use RESUME=False. Resuming requires the previous last_model.pt,
its history, matching size and exact output folder; it is not an automatic recovery feature.

## 4. Review the 17 masks

Open `tools/mask_annotation/mask_editor.html` in your browser, choose an original
from `data/local_17/originals/` and its same-stem PNG from `masks/drafts/`.
**Black = sky (including clouds), white = obstacles.** Match the photograph;
do not invent hidden sky behind people or objects.
Download your corrected mask and save it in `masks/reviewed/`, using the original
image stem plus `.png` (remove `_reviewed` or duplicate-download suffixes when needed).
Keep the original drafts. Reviewed masks are reference annotations only after
human review; predictions must stay in `results/local_predictions/`.
No reviewed masks were included in the uploaded archive.

## Folder map

| Path | Responsibility |
|---|---|
| backend.py | `/health`, `/segment`, CPU model loading and image validation |
| model.py | Same architecture, preprocessing and mask prediction used by training/API |
| train.py | Dataset pairing, training, validation, explicit final evaluation |
| requirements-*.txt | Local backend, CPU PyTorch and optional annotation dependencies |
| frontend/app/ | Page and global Tailwind import |
| frontend/components/ui/ | Shared Button and Card styles |
| frontend/lib/api.ts | API calls, types and report validation |
| notebooks/ | Reusable Colab notebook; no saved outputs |
| models/ | Local selected inference checkpoint, ignored by Git |
| data/ | Reference dataset scaffold and local annotation material |
| results/ | Real experimental records and prediction folders |
| tools/mask_annotation/ | Manual editor and optional historical draft scripts |
| docs/ | Review findings and UI styling guide |
| archives/ | Local original ZIP backups; ignored by Git |

## Recorded experiment

40 epochs were recorded; the selected checkpoint was epoch **38**.
Held-out reference mIoU: **0.9217875157249467**; pixel accuracy:
**0.9594248672211876**. Read the actual JSON for all metrics.
`config.json` records the original Colab paths and versions (PyTorch 2.11.0+cu130,
Python 3.13.15). Those historical paths must **not** be edited to new local paths:
this file is evidence, not live application configuration.
GPU nondeterminism and version differences mean a new run need not reproduce
identical scores. Model bytes were omitted, so original trained-weight loading
and actual predictions must also be checked on the user's laptop.

## Group styling and Git

Use Tailwind's default theme and shared components. See `docs/UI_STYLING.md`
for the one-place button-colour change. Other group components need to use the
same shared components/version to match; this folder cannot change teammates' UIs.

The nested `.gitignore` applies to this component. It excludes weights, reference
dataset bytes, environment files and generated dependencies, while retaining
source, local17 annotations and recorded results. Parent repository rules still apply.
Previously tracked files stay tracked until explicitly removed from the Git index.
Do not run `git init` here. No commit or push was made during this review.

## Review evidence

See `docs/REVIEW.md` for fixes, passed checks and unverified items. In particular,
no real-weight prediction, GPU retraining or browser click-through is claimed.

## Attribution

Reference dataset: https://doi.org/10.57745/FG5T2Z
Paper: https://doi.org/10.3390/jimaging11120446
Preserve source attribution and check dataset redistribution terms before sharing bytes.
