from pathlib import Path
import json

import joblib
import numpy as np
import pandas as pd
from pvlib.solarposition import get_solarposition
from functools import lru_cache


@lru_cache(maxsize=2)
def load_prediction_model(interval_minutes=15):
    if interval_minutes not in (5, 15):
        raise ValueError("interval_minutes must be 5 or 15.")
    result_folder = Path(__file__).resolve().parent / "model" / f"{interval_minutes}min"
    model_path = result_folder / "best_tuned_model.joblib"
    metadata_path = result_folder / "training_metadata.json"

    if not model_path.is_file() or not metadata_path.is_file():
        raise FileNotFoundError("Solar prediction model files are not installed.")

    with metadata_path.open("r", encoding="utf-8") as file:
        metadata = json.load(file)

    model = joblib.load(model_path)

    return model, metadata["features"]


LOCAL_TIMEZONE = "Asia/Colombo"


def prepare_features(row: dict) -> dict:
    """Generate time and solar features for one input row."""
    features = dict(row)

    timestamp = pd.Timestamp(features.pop("timestamp"))

    if pd.isna(timestamp):
        raise ValueError("Provide a valid timestamp.")

    # A timestamp without an offset is interpreted as Sri Lanka time.
    if timestamp.tzinfo is None:
        local_time = timestamp.tz_localize(LOCAL_TIMEZONE)
    else:
        local_time = timestamp.tz_convert(LOCAL_TIMEZONE)

    latitude = float(features["latitude"])
    longitude = float(features["longitude"])

    if not np.isfinite(latitude) or not -90 <= latitude <= 90:
        raise ValueError("latitude must be between -90 and 90.")

    if not np.isfinite(longitude) or not -180 <= longitude <= 180:
        raise ValueError("longitude must be between -180 and 180.")

    # Match the time-feature formulas used during training.
    minutes_of_day = local_time.hour * 60 + local_time.minute
    daily_angle = 2 * np.pi * minutes_of_day / 1440

    days_in_year = 366 if local_time.is_leap_year else 365
    yearly_angle = 2 * np.pi * (local_time.dayofyear - 1) / days_in_year

    features["time_of_day_sin"] = float(np.sin(daily_angle))
    features["time_of_day_cos"] = float(np.cos(daily_angle))
    features["day_of_year_sin"] = float(np.sin(yearly_angle))
    features["day_of_year_cos"] = float(np.cos(yearly_angle))

    # Match training: altitude=0 and geometric elevation.
    position = get_solarposition(
        time=pd.DatetimeIndex([local_time.tz_convert("UTC")]),
        latitude=latitude,
        longitude=longitude,
        altitude=0,
        method="nrel_numpy",
    )

    azimuth_radians = np.deg2rad(float(position["azimuth"].iloc[0]))

    features["sun_elevation_deg"] = float(position["elevation"].iloc[0])
    features["sun_azimuth_sin"] = float(np.sin(azimuth_radians))
    features["sun_azimuth_cos"] = float(np.cos(azimuth_radians))

    return features


def predict_solar_power(feature_values, *, interval_minutes=15):
    """
    Accept one input dictionary or a list of input dictionaries.

    Each dictionary contains timestamp, coordinates, capacity,
    and weather features. Time and solar features are generated here.

    Return one prediction row per input.
    """
    saved_model, FEATURE_COLUMNS = load_prediction_model(interval_minutes)
    rows = [feature_values] if isinstance(feature_values, dict) else feature_values

    if not isinstance(rows, list) or not rows:
        raise ValueError(
            "Provide one input dictionary or a nonempty list of dictionaries."
        )

    prepared_rows = []

    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"Input row {index} must be a dictionary.")

        try:
            features = prepare_features(row)
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError(f"Invalid input row {index}: {exc}") from exc

        missing = [name for name in FEATURE_COLUMNS if name not in features]

        if missing:
            raise ValueError(f"Input row {index} is missing features: {missing}")

        # Arrange values in the exact saved training order.
        prepared_rows.append([features[name] for name in FEATURE_COLUMNS])

    values = np.asarray(prepared_rows, dtype=float)

    if np.isinf(values).any():
        raise ValueError("Inputs contain infinity. Use np.nan for missing features.")

    inputs = pd.DataFrame(values, columns=FEATURE_COLUMNS)

    capacities = inputs["pv_capacity_kwp"].to_numpy()

    if (~np.isfinite(capacities) | (capacities <= 0)).any():
        raise ValueError("pv_capacity_kwp must be a finite positive number.")

    predictions = np.asarray(
        saved_model.predict(inputs),
        dtype=float,
    ).reshape(-1)

    if len(predictions) != len(inputs):
        raise ValueError("Model returned an unexpected number of predictions.")

    if not np.isfinite(predictions).all():
        raise ValueError("Model produced nonfinite predictions.")

    predictions = np.maximum(predictions, 0)

    return pd.DataFrame(
        {
            "predicted_W_per_kWp": predictions,
            "pv_capacity_kwp": capacities,
            "predicted_W": predictions * capacities,
            "predicted_power_kw": predictions * capacities / 1000,
        }
    )
