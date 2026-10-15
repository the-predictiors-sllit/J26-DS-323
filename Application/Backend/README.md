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
