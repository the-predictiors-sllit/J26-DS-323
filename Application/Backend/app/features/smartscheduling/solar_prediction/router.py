from fastapi import APIRouter

from .examples import get_backend_inputs
from .schemas import ManualPayload, WeatherPredictionRequest
from .service import predict_with_weather, run_prediction

router = APIRouter()


@router.post("/predictinput")
def predict_manual_5min(payload: ManualPayload):
    return run_prediction(payload if isinstance(payload, list) else [payload], 5)


@router.post("/predictinput15min")
def predict_manual_15min(payload: ManualPayload):
    return run_prediction(payload if isinstance(payload, list) else [payload], 15)


@router.post("/predictweather")
def predict_weather_5min(payload: WeatherPredictionRequest):
    return predict_with_weather(payload, 5)


@router.post("/predictweather15min")
def predict_weather_15min(payload: WeatherPredictionRequest):
    return predict_with_weather(payload, 15)


@router.post("/predictbackend15min")
def predict_from_backend():
    return run_prediction(get_backend_inputs(), 15)
