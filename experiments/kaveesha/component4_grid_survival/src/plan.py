"""Single entry point for the API: get_plan(...) returns the next-24-hour battery plan.
The FastAPI endpoint only needs to wrap this function."""
import numpy as np
from data_loader import load_config
from simulator import Battery
from mpc import solve_mpc


def get_plan(profile, buy, sell, soc_pct, pv_forecast_kwh, load_forecast_kwh, outage_forecast, cfg=None):
    """Plan the next hours for one household.
    profile: 'savings' | 'balanced' | 'resilience'
    buy, sell: LKR per kWh (a number, or a list with one value per hour)
    soc_pct: current battery level in percent
    pv_forecast_kwh, load_forecast_kwh: lists, kWh per hour (same length H, normally 24)
    outage_forecast: list of 0/1 per hour (1 = grid down)
    Returns a dict with a per-hour plan and a short summary."""
    cfg = cfg or load_config()
    if profile not in cfg["profiles"]:
        raise ValueError(f"profile must be one of {list(cfg['profiles'])}")
    H = len(pv_forecast_kwh)
    if not (len(load_forecast_kwh) == len(outage_forecast) == H):
        raise ValueError("forecast lists must all have the same length")
    bat = Battery(cfg["battery"])
    buy_f = np.full(H, buy, float) if np.isscalar(buy) else np.asarray(buy, float)
    sell_f = np.full(H, sell, float) if np.isscalar(sell) else np.asarray(sell, float)
    sol = solve_mpc(soc_pct / 100 * bat.cap, np.asarray(pv_forecast_kwh, float), np.asarray(load_forecast_kwh, float),
                    np.asarray(outage_forecast, int), buy_f, sell_f, bat, cfg["household"]["critical_load_fraction"],
                    cfg["profiles"][profile]["unserved_penalty_lkr_per_kwh"], cfg["degradation_lkr_per_kwh_throughput"],
                    cfg["profiles"][profile].get("reserve_pct", 0))
    if not sol["ok"]:
        raise RuntimeError("optimiser could not find a plan")
    hours = []
    for t in range(H):
        p, soc_t = float(sol["plan"][t]), float(sol["soc_plan"][t + 1])
        if outage_forecast[t]:
            action = "outage: run on battery and solar"
        elif p > 0.05:
            action = "charge battery"
        elif p < -0.05:
            action = "use battery for home"
        elif sol["exp"][t] > 0.05:
            action = "export to grid"
        else:
            action = "hold (battery kept in reserve)"
        hours.append({"hour": t, "action": action, "battery_kwh": round(p, 3),
                      "soc_pct_end": round(soc_t / bat.cap * 100, 1), "grid_import_kwh": round(float(sol["imp"][t]), 3),
                      "grid_export_kwh": round(float(sol["exp"][t]), 3), "unserved_critical_kwh": round(float(sol["unserved"][t]), 3)})
    return {"profile": profile, "hours": hours,
            "summary": {"expected_unserved_critical_kwh": round(float(sol["unserved"].sum()), 3),
                        "expected_grid_import_kwh": round(float(sol["imp"].sum()), 2),
                        "expected_grid_export_kwh": round(float(sol["exp"].sum()), 2)}}
