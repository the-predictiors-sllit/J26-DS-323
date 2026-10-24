from .schemas import PredictionRequest


def get_backend_inputs() -> list[PredictionRequest]:
    # Replace this example with actual backend inputs before production use.
    return [
        PredictionRequest(
            timestamp="2024-02-29T08:15:00+05:30",
            latitude=6.2353,
            longitude=80.055,
            pv_capacity_kwp=15,
            weather_temperature_c=27.8,
            weather_relative_humidity_pct=80,
            weather_wind_speed_ms=1.6,
            weather_cloud_cover_pct=100,
            weather_cloud_cover_low_pct=10,
            weather_cloud_cover_mid_pct=0,
            weather_cloud_cover_high_pct=100,
            weather_ghi_instant_wm2=349.1,
            weather_dni_instant_wm2=409.3,
            weather_dhi_instant_wm2=188.8,
            weather_preceding_hour_precipitation_mm=0,
            weather_preceding_hour_rain_mm=0,
        )
    ]
