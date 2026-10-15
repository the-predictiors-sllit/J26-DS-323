"""Single-point opaque-obstacle shading, isotropic diffuse sky and fixed PR energy.

No panel-level electrical mismatch, row shading, temperature, clipping, bypass
circuits, tracker movement, near-obstacle parallax or financial savings are modeled.
"""

import hashlib
import importlib.metadata
import numpy as np
from threadpoolctl import threadpool_limits
from .geometry import SkyMask, direction_vectors, sky_quadrature
from .weather import load_weather
from .optimize import particle_swarm, grid_search


class IrradiationObjective:
    def __init__(self, sky, weather, albedo):
        self.sky = sky
        self.weather = weather
        self.albedo = albedo
        pos = weather["position"]
        self.sun = direction_vectors(
            pos.apparent_zenith.to_numpy(), pos.azimuth.to_numpy()
        )
        self.visible = (
            sky.visible(pos.apparent_zenith.to_numpy(), pos.azimuth.to_numpy())
            & weather["daylight"]
        )
        self.sky_vectors, self.sky_weights = sky_quadrature(sky)
        dt = weather["dt_hours"]
        self.beam_weights = weather["dni"] * self.visible * dt / 1000
        self.diffuse_total = float(weather["dhi"].sum() * dt / 1000)
        self.ground_total = float(weather["ghi"].sum() * dt / 1000 * albedo)
        active = self.beam_weights > 0
        self.active_sun = self.sun[active]
        self.active_beam = self.beam_weights[active]

    def __call__(self, angles):
        angles = np.atleast_2d(angles)
        results = []
        for i in range(0, len(angles), 64):
            block = angles[i : i + 64]
            normals = direction_vectors(block[:, 0], block[:, 1])
            beam = np.maximum(0, self.active_sun @ normals.T).T @ self.active_beam
            sky_factor = (
                np.maximum(0, self.sky_vectors @ normals.T).T @ self.sky_weights
            )
            ground_factor = (1 - np.cos(np.deg2rad(block[:, 0]))) / 2
            results.extend(
                beam
                + self.diffuse_total * sky_factor
                + self.ground_total * ground_factor
            )
        return np.asarray(results)

    def series(self, tilt, azimuth):
        normal = direction_vectors(tilt, azimuth)
        direct = self.weather["dni"] * self.visible * np.maximum(0, self.sun @ normal)
        sky_factor = float(np.maximum(0, self.sky_vectors @ normal) @ self.sky_weights)
        diffuse = self.weather["dhi"] * sky_factor
        ground = self.weather["ghi"] * self.albedo * (1 - np.cos(np.deg2rad(tilt))) / 2
        return direct + diffuse + ground


def analyze(mask, settings, weather_csv=None):
    sky = SkyMask(mask, settings)
    weather = load_weather(settings, weather_csv)
    objective = IrradiationObjective(sky, weather, settings.albedo)
    warnings = list(weather["warnings"])
    # Avoid CPU oversubscription on laptops when evaluating many small candidates.
    with threadpool_limits(limits=1):
        baseline_score = float(
            objective([[settings.baseline_tilt, settings.baseline_azimuth]])[0]
        )
        baseline = {
            "tilt_deg": settings.baseline_tilt,
            "azimuth_deg": settings.baseline_azimuth,
            "poa_kwh_m2": baseline_score,
        }
        grid = grid_search(objective, settings.max_tilt)
        runs = [
            particle_swarm(objective, settings.max_tilt, settings.seed + i)
            for i in range(2)
        ]
        pso = max(runs, key=lambda r: r["poa_kwh_m2"])
        # Never label a grid/baseline fallback as PSO. All candidates share conditions.
        method, selected = max(
            [("PSO", pso), ("grid", grid), ("baseline", baseline)],
            key=lambda item: item[1]["poa_kwh_m2"],
        )
        selected = {k: selected[k] for k in ["tilt_deg", "azimuth_deg", "poa_kwh_m2"]}
        recommended = objective.series(selected["tilt_deg"], selected["azimuth_deg"])
        reference = objective.series(settings.baseline_tilt, settings.baseline_azimuth)
    if method != "PSO":
        warnings.append(
            f"{method} candidate was best; reported selection is explicitly a {method} fallback, not a PSO result."
        )
    if settings.geometry_status != "verified":
        warnings.append(
            "Camera projection, full horizon, level and true North mapping are assumed. This result is exploratory and is not a validated installation recommendation."
        )
    warnings.extend(
        [
            "A single capture point represents an opaque obstruction map. Panel tilt changes incidence, not whether the sun ray at that point is blocked.",
            "Diffuse sky is isotropic and integrated at 3° angular resolution. Ground reflection is unshaded isotropic using the entered albedo.",
            "Predicted masks require review. People, watermark regions and missing field of view can distort the obstruction map.",
            "Baseline 7° is a project reference when selected, not a universal Sri Lankan standard; azimuth is explicitly supplied.",
        ]
    )
    if selected["tilt_deg"] < 0.1:
        warnings.append(
            "At near-zero tilt the panel azimuth is poorly determined; do not interpret its precise numeric value."
        )
    if selected["poa_kwh_m2"] < 1e-6:
        warnings.append(
            "Available modeled irradiation is zero; there is no meaningful optimal orientation for these inputs."
        )
    gain = (
        None
        if baseline_score < 1e-9
        else (selected["poa_kwh_m2"] / baseline_score - 1) * 100
    )
    capacity = (
        None
        if settings.panel_count is None
        else settings.panel_count * settings.panel_watts / 1000
    )

    def energy(h):
        return None if capacity is None else h * capacity * settings.performance_ratio

    selected["energy_kwh"] = energy(selected["poa_kwh_m2"])
    baseline["energy_kwh"] = energy(baseline_score)
    months = weather["times"].month.to_numpy()
    monthly = []
    for month in range(1, 13):
        ix = months == month
        opt = float(recommended[ix].sum() * weather["dt_hours"] / 1000)
        base = float(reference[ix].sum() * weather["dt_hours"] / 1000)
        monthly.append(
            {
                "month": month,
                "selected_poa_kwh_m2": opt,
                "baseline_poa_kwh_m2": base,
                "selected_energy_kwh": energy(opt),
                "baseline_energy_kwh": energy(base),
            }
        )
    # Actual annual sun samples. Overlay is a thinned display of these, not a daily template.
    pos = weather["position"]
    day_indices = np.flatnonzero(weather["daylight"])
    display = day_indices[:: max(1, int(np.ceil(len(day_indices) / 2500)))]
    x, y = sky.project(
        pos.apparent_zenith.to_numpy()[display], pos.azimuth.to_numpy()[display]
    )
    samples = [
        {
            "x": round(float(px), 2),
            "y": round(float(py), 2),
            "visible": bool(objective.visible[j]),
            "time": weather["times"][j].isoformat(),
        }
        for j, px, py in zip(display, x, y)
    ]
    cardinal = []
    for label, az in [("N", 0), ("E", 90), ("S", 180), ("W", 270)]:
        px, py = sky.project(90, az)
        cardinal.append({"label": label, "x": float(px), "y": float(py)})
    dni_weight = weather["dni"] * weather["dt_hours"]
    blocked = (
        None
        if dni_weight.sum() == 0
        else float((dni_weight * ~objective.visible).sum() / dni_weight.sum() * 100)
    )
    return {
        "schema_version": "solar_orientation_v1",
        "settings": settings.model_dump(),
        "mask_sha256": hashlib.sha256(np.asarray(mask).tobytes()).hexdigest(),
        "weather_sha256": (
            hashlib.sha256(weather_csv).hexdigest() if weather_csv else None
        ),
        "weather_source": weather["source"],
        "weather_metadata": weather.get("metadata"),
        "sample_count": len(weather["times"]),
        "daylight_samples": int(weather["daylight"].sum()),
        "mask_width": sky.mask.shape[1],
        "mask_height": sky.mask.shape[0],
        "geometry": {
            "cx": sky.cx,
            "cy": sky.cy,
            "radius": sky.radius,
            "cardinals": cardinal,
        },
        "selected_method": method,
        "selected": selected,
        "baseline": baseline,
        "gain_percent": gain,
        "capacity_kwp": capacity,
        "pso": {
            "best": pso,
            "runs": runs,
            "particles": 28,
            "iterations": 60,
            "cognitive": 1.5,
            "social": 1.5,
            "inertia_start": 0.8,
            "inertia_end": 0.4,
        },
        "grid": grid,
        "pso_minus_grid_kwh_m2": pso["poa_kwh_m2"] - grid["poa_kwh_m2"],
        "monthly": monthly,
        "dni_weighted_blocked_percent": blocked,
        "sun_samples": samples,
        "warnings": warnings,
        "versions": {
            key: importlib.metadata.version(key) for key in ["pvlib", "numpy", "pandas"]
        },
        "model_notes": "Fixed orientation; energy = POA(kWh/m²)/1(kW/m²) × capacity(kWp) × PR. No thermal, clipping, electrical mismatch or row-shading model. Solar position and irradiance sampled at interval midpoints; full-year integration.",
    }


def preview(mask, settings):
    """Preview geometry before optimization; no weather CSV or CNN is required."""
    from pvlib.location import Location
    from .weather import annual_starts
    import pandas as pd

    sky = SkyMask(mask, settings)
    times = annual_starts(settings) + pd.Timedelta(
        minutes=settings.interval_minutes / 2
    )
    location = Location(
        settings.latitude,
        settings.longitude,
        tz=settings.timezone,
        altitude=settings.altitude_m,
    )
    position = location.get_solarposition(times)
    daylight = np.flatnonzero(position.apparent_zenith.to_numpy() < 90)
    chosen = daylight[:: max(1, int(np.ceil(len(daylight) / 2500)))]
    zen, az = (
        position.apparent_zenith.to_numpy()[chosen],
        position.azimuth.to_numpy()[chosen],
    )
    x, y = sky.project(zen, az)
    visible = sky.visible(zen, az)
    cardinals = []
    for label, a in [("N", 0), ("E", 90), ("S", 180), ("W", 270)]:
        px, py = sky.project(90, a)
        cardinals.append({"label": label, "x": float(px), "y": float(py)})
    return {
        "mask_width": sky.mask.shape[1],
        "mask_height": sky.mask.shape[0],
        "geometry": {
            "cx": sky.cx,
            "cy": sky.cy,
            "radius": sky.radius,
            "cardinals": cardinals,
        },
        "sun_samples": [
            {
                "x": float(px),
                "y": float(py),
                "visible": bool(v),
                "time": times[j].isoformat(),
            }
            for j, px, py, v in zip(chosen, x, y, visible)
        ],
        "preview_only": True,
    }
