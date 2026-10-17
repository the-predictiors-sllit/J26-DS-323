"""Download hourly NASA POWER weather for Component 4 (free, no key).
Run on YOUR computer (needs internet):  python fetch_weather.py
Output: weather_hourly.csv  -> put in data/raw/weather/
Times are converted from UTC to Sri Lanka time (UTC+5:30)."""
import requests, pandas as pd, io, time

LAT, LON = 5.974, 80.430          # Weligama, south coast (change if you want another site)
START_YEAR, END_YEAR = 2019, 2025  # full years only
PARAMS = "ALLSKY_SFC_SW_DWN,ALLSKY_SFC_SW_DNI,ALLSKY_SFC_SW_DIFF,T2M,WS10M"   # GHI, DNI, DHI, temp, wind
URL = "https://power.larc.nasa.gov/api/temporal/hourly/point"

frames = []
for y in range(START_YEAR, END_YEAR + 1):
    r = requests.get(URL, params=dict(parameters=PARAMS, community="RE", longitude=LON, latitude=LAT,
                                      start=f"{y}0101", end=f"{y}1231", format="CSV", **{"time-standard": "UTC"}), timeout=120)
    r.raise_for_status()
    text = r.text
    body = text[text.index("YEAR"):]                      # skip the header block
    df = pd.read_csv(io.StringIO(body))
    frames.append(df); print(y, len(df), "rows"); time.sleep(2)

w = pd.concat(frames, ignore_index=True)
w["datetime_utc"] = pd.to_datetime(dict(year=w.YEAR, month=w.MO, day=w.DY, hour=w.HR))
w["datetime_local"] = w["datetime_utc"] + pd.Timedelta(hours=5, minutes=30)
w = w.rename(columns={"ALLSKY_SFC_SW_DWN":"ghi_wh_m2","ALLSKY_SFC_SW_DNI":"dni_wh_m2","ALLSKY_SFC_SW_DIFF":"dhi_wh_m2","T2M":"temp_c","WS10M":"wind_ms"})
w = w[["datetime_local","ghi_wh_m2","dni_wh_m2","dhi_wh_m2","temp_c","wind_ms"]].replace(-999, float("nan"))
w.to_csv("weather_hourly.csv", index=False); print("saved weather_hourly.csv", w.shape)
