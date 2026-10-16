"""Physics, geometry, weather and optimization checks without any CNN weights."""

import io
import json
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from PIL import Image
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pvlib.irradiance import get_total_irradiance

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from solar.schema import SolarSettings
from solar.geometry import SkyMask, direction_vectors
from solar.weather import annual_starts, load_weather
from solar.engine import IrradiationObjective, analyze
from solar.optimize import particle_swarm, grid_search
from solar.api import router


def config(**kwargs):
    return SolarSettings(
        latitude=7,
        longitude=80,
        projection="equisolid",
        center_x=0.5,
        center_y=0.5,
        radius=0.5,
        azimuth_clockwise=True,
        geometry_acknowledged=True,
        **kwargs
    )


def test_cardinals_and_both_projections():
    for projection in ["equisolid", "equidistant"]:
        s = config().model_copy(update={"projection": projection})
        sky = SkyMask(np.zeros((201, 201), dtype=np.uint8), s)
        x, y = sky.project([90] * 4, [0, 90, 180, 270])
        np.testing.assert_allclose(x, [100, 200, 100, 0], atol=1e-10)
        np.testing.assert_allclose(y, [0, 100, 200, 100], atol=1e-10)
        x, y = sky.project(0, 270)
        assert abs(x - 100) < 1e-10 and abs(y - 100) < 1e-10
        rotated = SkyMask(
            sky.mask,
            s.model_copy(update={"north_offset_deg": 90, "azimuth_clockwise": False}),
        )
        x, y = rotated.project([90, 90], [0, 90])
        np.testing.assert_allclose(x, [200, 100], atol=1e-10)
        np.testing.assert_allclose(y, [100, 0], atol=1e-10)


def test_east_obstacle_blocks_east_only_and_below_horizon():
    mask = np.zeros((201, 201), dtype=np.uint8)
    mask[:, 101:] = 255
    sky = SkyMask(mask, config())
    assert sky.visible([45, 45, 100], [90, 270, 0]).tolist() == [False, True, False]


def test_invalid_geometry_and_nonbinary_masks_rejected():
    with pytest.raises(ValueError):
        SkyMask(np.zeros((100, 100)), config().model_copy(update={"center_x": 0.1}))
    with pytest.raises(ValueError):
        SkyMask(np.full((100, 100), 128), config())
    with pytest.raises(ValueError):
        config().model_copy(update={}).model_validate(
            {**config().model_dump(), "geometry_acknowledged": False}
        )


def synthetic_weather():
    times = pd.date_range("2026-01-01T08:00:00+05:30", periods=5, freq="h")
    z = np.array([70, 50, 20, 40, 65])
    a = np.array([90, 110, 180, 230, 270])
    dni = np.full(5, 700.0)
    dhi = np.full(5, 100.0)
    return {
        "times": times,
        "position": pd.DataFrame({"apparent_zenith": z, "azimuth": a}, index=times),
        "dni": dni,
        "dhi": dhi,
        "ghi": dni * np.cos(np.deg2rad(z)) + dhi,
        "dt_hours": 1,
        "daylight": np.ones(5, dtype=bool),
    }


def test_open_sky_agrees_with_pvlib_isotropic_and_energy_sum():
    weather = synthetic_weather()
    sky = SkyMask(np.zeros((201, 201), dtype=np.uint8), config())
    objective = IrradiationObjective(sky, weather, 0.2)
    for tilt, az in [(0, 0), (7, 180), (35, 90), (60, 270)]:
        reference = get_total_irradiance(
            tilt,
            az,
            weather["position"].apparent_zenith,
            weather["position"].azimuth,
            weather["dni"],
            weather["ghi"],
            weather["dhi"],
            albedo=0.2,
            model="isotropic",
        )["poa_global"]
        actual = objective.series(tilt, az)
        np.testing.assert_allclose(actual, reference, rtol=0.001, atol=0.1)
        assert float(objective([[tilt, az]])[0]) == pytest.approx(actual.sum() / 1000)


def test_all_obstacles_zero_with_no_ground_reflection():
    obj = IrradiationObjective(
        SkyMask(np.full((201, 201), 255, dtype=np.uint8), config()),
        synthetic_weather(),
        0,
    )
    np.testing.assert_array_equal(obj([[0, 0], [30, 180], [60, 90]]), 0)


def test_shading_never_adds_irradiation():
    weather = synthetic_weather()
    open_mask = np.zeros((201, 201), dtype=np.uint8)
    blocked = open_mask.copy()
    blocked[:, 101:] = 255
    clear = IrradiationObjective(SkyMask(open_mask, config()), weather, 0.2)
    shaded = IrradiationObjective(SkyMask(blocked, config()), weather, 0.2)
    angles = np.array([[0, 0], [15, 90], [35, 180], [60, 270]])
    assert np.all(shaded(angles) <= clear(angles) + 1e-12)


def test_pso_matches_known_periodic_objective_and_grid():
    def score(p):
        return (
            1000 - (p[:, 0] - 23) ** 2 - 100 * (1 - np.cos(np.deg2rad(p[:, 1] - 358)))
        )

    result = particle_swarm(score, 60, 42)
    assert abs(result["tilt_deg"] - 23) < 0.1
    assert abs((result["azimuth_deg"] - 358 + 180) % 360 - 180) < 0.2
    assert np.all(np.diff(result["history_kwh_m2"]) >= 0)
    assert result == particle_swarm(score, 60, 42)
    assert result["poa_kwh_m2"] >= grid_search(score, 60)["poa_kwh_m2"]


def test_weather_full_year_and_leap_year():
    assert len(annual_starts(config(year=2024, interval_minutes=60))) == 8784
    weather = load_weather(config(interval_minutes=60))
    assert len(weather["times"]) == 8760
    assert np.isfinite(weather["ghi"]).all()
    assert (weather["ghi"][~weather["daylight"]] == 0).all()


def csv_weather(s, drop=False, naive=False):
    times = annual_starts(s)
    if naive:
        times = times.tz_localize(None)
    frame = pd.DataFrame(
        {"timestamp": [t.isoformat() for t in times], "ghi": 0, "dni": 0, "dhi": 0}
    )
    if drop:
        frame = frame.iloc[:-1]
    return frame.to_csv(index=False).encode()


def test_csv_accepts_full_year_rejects_missing_and_naive():
    s = config(weather_mode="csv", interval_minutes=60)
    w = load_weather(s, csv_weather(s))
    assert w["ghi"].sum() == 0
    with pytest.raises(ValueError, match="Expected"):
        load_weather(s, csv_weather(s, drop=True))
    with pytest.raises(ValueError, match="offset"):
        load_weather(s, csv_weather(s, naive=True))


def test_full_analysis_months_gain_capacity_and_output_json():
    mask = np.zeros((101, 101), dtype=np.uint8)
    result = analyze(mask, config(interval_minutes=60, panel_count=10, panel_watts=550))
    assert result["capacity_kwp"] == 5.5
    assert result["selected"]["energy_kwh"] == pytest.approx(
        result["selected"]["poa_kwh_m2"] * 5.5 * 0.8
    )
    assert sum(m["selected_poa_kwh_m2"] for m in result["monthly"]) == pytest.approx(
        result["selected"]["poa_kwh_m2"]
    )
    assert result["gain_percent"] >= -1e-9
    assert len(result["sun_samples"]) > 0
    json.dumps(result, allow_nan=False)


def test_api_template_and_mask_validation():
    app = FastAPI()
    app.include_router(router)
    with TestClient(app) as client:
        response = client.get("/solar/weather-template?year=2026&interval_minutes=60")
        assert response.status_code == 200 and len(response.text.splitlines()) == 8761
        payload = io.BytesIO()
        Image.new("RGB", (100, 100), "red").save(payload, format="PNG")
        response = client.post(
            "/solar/analyze",
            data={"settings": config().model_dump_json()},
            files={"mask": ("wrong.png", payload.getvalue(), "image/png")},
        )
        assert response.status_code == 422


def test_api_preview_then_full_year_csv_end_to_end():
    app = FastAPI()
    app.include_router(router)
    settings = config(weather_mode="csv", interval_minutes=60, albedo=0)
    content = io.BytesIO()
    Image.new("L", (101, 101), 0).save(content, format="PNG")
    mask = content.getvalue()
    with TestClient(app) as client:
        preview = client.post(
            "/solar/analyze",
            data={"settings": settings.model_dump_json(), "preview_only": "true"},
            files={"mask": ("sky.png", mask, "image/png")},
        )
        assert preview.status_code == 200, preview.text
        assert len(preview.json()["sun_samples"]) > 0
        assert "selected" not in preview.json()
        response = client.post(
            "/solar/analyze",
            data={"settings": settings.model_dump_json()},
            files={
                "mask": ("sky.png", mask, "image/png"),
                "weather": ("weather.csv", csv_weather(settings), "text/csv"),
            },
        )
        assert response.status_code == 200, response.text
        report = response.json()
        assert report["gain_percent"] is None
        assert report["selected"]["poa_kwh_m2"] == 0


def test_nonnegative_csv_values_and_duplicate_timestamps_rejected():
    s = config(weather_mode="csv", interval_minutes=60)
    frame = pd.read_csv(io.BytesIO(csv_weather(s)))
    frame.loc[0, "dni"] = -1
    with pytest.raises(ValueError, match="nonnegative"):
        load_weather(s, frame.to_csv(index=False).encode())
    frame.loc[0, "dni"] = 0
    frame.loc[1, "timestamp"] = frame.loc[0, "timestamp"]
    with pytest.raises(ValueError, match="unique"):
        load_weather(s, frame.to_csv(index=False).encode())
