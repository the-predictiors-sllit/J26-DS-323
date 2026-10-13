from fastapi import FastAPI

from app.features.energyresilience.router import router as energyresilience_router
from app.features.panelhealth.router import router as panelhealth_router
from app.features.smartscheduling.router import router as smartscheduling_router
from app.features.solarsetup.router import router as solarsetup_router

app = FastAPI(
    title="J26 DS 323 API",
    version="0.1.0",
)


@app.get("/")
def read_root():
    return {"Backend is running."}

@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "backend"}


app.include_router(solarsetup_router, prefix="/api/v1/solarsetup")
app.include_router(smartscheduling_router, prefix="/api/v1/smartscheduling")
app.include_router(energyresilience_router, prefix="/api/v1/energyresilience")
app.include_router(panelhealth_router, prefix="/api/v1/panelhealth")
