# Backend

This is the FastAPI backend for the project. Each feature has its own folder
and router, so a member can work inside that folder without changing another
feature's code.

## Structure

```text
Backend/
├── app/
│   ├── main.py
│   └── features/
│       ├── solarsetup/
│       │   └── router.py
│       ├── smartscheduling/
│       │   └── router.py
│       ├── energyresilience/
│       │   └── router.py
│       └── panelhealth/
│           └── router.py
├── requirements.txt
└── README.md
```

## Run locally

`If you are using UV`
```powershell
uv run fastapi dev
```

## Health checks

- Main API: `GET /health`
- Solar setup: `GET /api/v1/solarsetup/health`
- Smart scheduling: `GET /api/v1/smartscheduling/health`
- Energy resilience: `GET /api/v1/energyresilience/health`
- Panel health: `GET /api/v1/panelhealth/health`

Each feature also has a placeholder endpoint at its prefix, for example
`GET /api/v1/solarsetup`.

## Panel health endpoints

| Method and path | What it does |
|---|---|
| `GET /api/v1/panelhealth/model-status` | Is a trained model saved where the service looks for it? |
| `POST /api/v1/panelhealth/crop` | Photo + four corners in, the straightened panel (JPEG) out. |
| `POST /api/v1/panelhealth/predict` | Photo + four corners + rated capacity (W) + age (years) in; health score, category, advice, watt range and a Grad-CAM heat map out. |

The model code is in `app/features/panelhealth/ml/`. That folder is **copied** from
`experiments/lakhitha/PanelScan/src` by `sync_to_backend.py`; do not edit it here. The trained model
(`models/panelscan.pt`) is not committed. Until it exists, `/predict` answers `503` with instructions and
`/crop` keeps working.

Dependencies for this feature are added from the folder that holds `pyproject.toml` (`Backend/app`):

```powershell
uv add torch torchvision opencv-python-headless albumentations numpy pandas grad-cam
```
