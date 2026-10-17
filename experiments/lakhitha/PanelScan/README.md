# PanelScan (Component 2: panel health from one photo)

Run guide for the vision-based panel health model. The system description is in `../README.md`.
The trained model is served by the Backend (`Application/Backend/app/features/panelhealth`) and used by the
frontend page (`Application/frontend/app/features/panelhealth`).

**This folder is the single source of truth for the model code.** Edit files here, then run
`python src\sync_to_backend.py` so the Backend gets the same copies.

## Folder layout
```
PanelScan/
  data/
    cropped/                    the straightened panel photos, named like the CSV (IMG_2814.jpg)   [git-ignored]
    raw/                        optional: the original, uncropped photos                            [git-ignored]
    panel_dataset_log_v3.csv    the labelled dataset
    panel_dataset_clean.csv     written by prepare_dataset.py                                       [git-ignored]
  src/                          the code (guide below)
  checkpoints/                  the trained model (panelscan.pt)                                    [git-ignored]
  results/                      experiment results written by train.py
  requirements.txt
```
Run every command from this folder (the paths in the clean CSV are relative to it).

## What each file in src/ does
| File | What it does |
|---|---|
| `prepare_dataset.py` | Checks the CSV against the photos, cleans it, adds the training columns, writes `data/panel_dataset_clean.csv`. Run first. |
| `check_precropped.py` | Sizes and shapes of the straightened photos, the median shape for `PANEL_ASPECT`, and odd ones. |
| `preprocessing.py` | THE definition of what the model sees (cut-out, CLAHE, resize). Holds `PANEL_ASPECT`. |
| `dataset.py` | PyTorch dataset: each photo with its three targets (health score, measured output %, soiling flag). |
| `model.py` | ResNet backbone with a regression head and a soiling head. |
| `train.py` | Leave-one-site-out experiments (train on 7 sites, test on the 8th, repeat). Writes `results/`. |
| `evaluate.py` | Compares the model with a baseline, overall and per site. |
| `train_final.py` | Trains ONE model on all photos and saves `checkpoints/panelscan.pt`. |
| `advice.py` | Tier, advice, surface-deposit note and watt range from the model's numbers. |
| `inference.py` | `Predictor`: loads the saved model and answers for one photo (used by the Backend). |
| `gradcam_utils.py` | Grad-CAM heat map: where on the panel the score was pulled down. |
| `corners.py` | Corner-file helpers and the outline check (also used by the Backend). |
| `consistency.py` | Fingerprints so the Backend can refuse a model whose preprocessing no longer matches. |
| `sync_to_backend.py` | Copies the shared files (and, with `--with-model`, the model) into the Backend. |

## Run order (PowerShell)
```
cd E:\Research\J26-DS-323\experiments\lakhitha\PanelScan
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

python src\prepare_dataset.py --csv data\panel_dataset_log_v3.csv --images data\cropped --out data\panel_dataset_clean.csv
python src\check_precropped.py --csv data\panel_dataset_clean.csv      # set PANEL_ASPECT if it differs

python src\train.py --precropped --test-sites "CRN 53652" --epochs 2   # smoke test: is the pipeline alive?
python src\train.py --precropped --tag A_base                          # the real experiment (8 runs inside)
python src\train.py --precropped --img-size 384 --tag A_size384        # does a larger image help?
python src\train.py --precropped --no-clahe --tag A_noclahe            # does CLAHE help?
python src\train.py --precropped --use-meta --tag A_with_meta          # do age and capacity help?
#   read results\summary_<tag>_*.csv and keep the best settings

python src\train_final.py --precropped --output-margin <output-percent MAE of the best run>
python src\sync_to_backend.py --with-model
```
Use the SAME options in `train_final.py` as in the best experiment. Whenever you change `preprocessing.py`,
`dataset.py` or `model.py`: retrain, then run `python src\sync_to_backend.py` again.

## Limits to state in the report
8 sites, all in the south; algae, corrosion and heavy dust each seen at one or two sites; no cracks or yellowing;
photos taken straight on with the panel upright; the score measures output loss from any cause, including dirt.
Results are leave-one-site-out: each site is predicted by a model that never saw it.
