"""PV output simulation with pvlib from NASA POWER weather."""
import numpy as np
import pandas as pd
import pvlib
from pvlib.temperature import sapm_cell, TEMPERATURE_MODEL_PARAMETERS
from data_loader import align_half_hour


def simulate_pv(weather, cfg_pv):
    """Return hourly PV AC energy (kWh per hour) on xx:00 bins, from weather indexed by interval start."""
    c = cfg_pv
    center = (weather.index + pd.Timedelta(minutes=30)).tz_localize("Asia/Colombo", nonexistent="shift_forward")
    loc = pvlib.location.Location(c["lat"], c["lon"], tz="Asia/Colombo")
    sp = loc.get_solarposition(center)
    extra = pvlib.irradiance.get_extra_radiation(center)
    poa = pvlib.irradiance.get_total_irradiance(
        c["tilt_deg"], c["azimuth_deg"], sp["apparent_zenith"], sp["azimuth"],
        dni=weather["dni_wh_m2"].to_numpy(), ghi=weather["ghi_wh_m2"].to_numpy(),
        dhi=weather["dhi_wh_m2"].to_numpy(), dni_extra=extra, model="haydavies")
    tcell = sapm_cell(poa["poa_global"], weather["temp_c"].to_numpy(), weather["wind_ms"].to_numpy(),
                      **TEMPERATURE_MODEL_PARAMETERS["sapm"]["open_rack_glass_glass"])
    dc_kw = c["system_kwp"] * poa["poa_global"] / 1000 * (1 + c["temp_coeff_per_c"] * (tcell - 25))
    ac_kw = (dc_kw * c["system_loss_factor"]).clip(lower=0, upper=c["inverter_kw"])
    ac_kw.index = weather.index
    return align_half_hour(ac_kw).rename("pv_kwh")
