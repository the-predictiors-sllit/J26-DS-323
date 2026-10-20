"""High-level planning for the app: the user gives simple inputs (battery size, panel size, tariff, preference,
weather outlook, outage notices) and this module builds the 24-hour forecasts, runs MPC, and compares it with
two ordinary battery rules on the same day.  All logic is plain functions so the API only wraps them."""
import copy
import numpy as np
import pandas as pd
from .data_loader import load_config, ASSETS
from .simulator import Battery, simulate, summarize
from .baseline import rule_based_controller, make_reserve_controller
from .mpc import make_mpc_controller
from .plan import get_plan

# Weather words the user can choose -> share of a clear-day solar output (ASSUMPTION, see docs/assumptions_log.md)
WEATHER_FACTOR = {"sunny": 1.0, "cloudy": 0.5, "rainy": 0.15}
_PV = None
_LOAD = None


def _pv_table():
    global _PV
    if _PV is None:
        _PV = pd.read_csv(ASSETS / "pv_profiles_per_kwp.csv")
    return _PV


def _load_table():
    global _LOAD
    if _LOAD is None:
        _LOAD = pd.read_csv(ASSETS / "load_profile_weekday_weekend.csv").set_index("hour")
    return _LOAD


def make_cfg(base, battery_kwh=None, pv_kwp=None):
    """Copy of the config with the user's battery size. Power limits scale with size (ASSUMPTION: same C-rate)."""
    cfg = copy.deepcopy(base)
    if battery_kwh:
        k = battery_kwh / cfg["battery"]["capacity_kwh"]
        cfg["battery"]["capacity_kwh"] = float(battery_kwh)
        cfg["battery"]["max_charge_kw"] *= k
        cfg["battery"]["max_discharge_kw"] *= k
    if pv_kwp:
        cfg["pv"]["system_kwp"] = float(pv_kwp)
    return cfg


def build_forecasts(month, start_hour, pv_kwp, daily_kwh, is_weekend=False, weather_events=None, horizon=24,
                    pv_per_kwp=None):
    """Return (hour_of_day, pv_kwh, load_kwh) lists for the next `horizon` hours starting at start_hour.
    weather_events: list of {start_in_hours, duration_hours, condition} using WEATHER_FACTOR words.
    Without events the solar forecast is the normal (average) day for that month, or pv_per_kwp (24 values from a live
    forecast) when given. Weather events always override the hours they cover (the user knows best)."""
    tab = _pv_table()
    tab = tab[tab.month == month].set_index("hour")
    lt = _load_table()["weekend_kwh" if is_weekend else "weekday_kwh"]
    scale = daily_kwh / float(lt.sum())
    hrs = [(start_hour + t) % 24 for t in range(horizon)]
    if pv_per_kwp is not None:
        pv = [float(x) * pv_kwp for x in pv_per_kwp[:horizon]]
    else:
        pv = [float(tab.loc[h, "normal_kwh"]) * pv_kwp for h in hrs]
    for ev in weather_events or []:
        f = WEATHER_FACTOR[ev["condition"]]
        for t in range(max(0, int(ev["start_in_hours"])), min(horizon, int(ev["start_in_hours"] + ev["duration_hours"]))):
            pv[t] = float(tab.loc[hrs[t], "sunny_kwh"]) * pv_kwp * f      # clear-day profile times the weather factor
    load = [float(lt.loc[h]) * scale for h in hrs]
    return hrs, [round(x, 4) for x in pv], [round(x, 4) for x in load]


def build_outage(outage_events, horizon=24):
    """outage_events: list of {start_in_hours, duration_hours}. start_in_hours = 0 means the grid is down right now."""
    out = [0] * horizon
    for ev in outage_events or []:
        for t in range(max(0, int(ev["start_in_hours"])), min(horizon, int(ev["start_in_hours"] + ev["duration_hours"]))):
            out[t] = 1
    return out


def compare_controllers(profile, cfg, soc_pct, pv, load, outage, buy, sell):
    """Run MPC and two ordinary rules on the same day with the same physics. Returns metrics and SoC curves."""
    H = len(pv)
    df = pd.DataFrame({"pv": pv, "load": load, "outage": outage, "buy": float(buy), "sell": float(sell)},
                      index=pd.date_range("2026-01-01", periods=H, freq="1h"))
    c = copy.deepcopy(cfg); c["battery"]["init_soc_pct"] = soc_pct
    bat = Battery(c["battery"])
    reserve = c["profiles"][profile]["reserve_pct"]
    runs = {"plain_rule": rule_based_controller,
            "reserve_rule": make_reserve_controller(bat, reserve),
            "mpc": make_mpc_controller(c, profile)}
    labels = {"plain_rule": "Normal battery rule", "reserve_rule": f"Rule with {reserve}% reserve", "mpc": "Our MPC planner"}
    out = {}
    for k, ctl in runs.items():
        res = simulate(ctl, df, c)
        out[k] = {"label": labels[k],
                  "unserved_critical_kwh": round(float(res["uns"].sum()), 3),
                  "hours_lost": int((res["uns"] > 0.01).sum()),
                  "grid_cost_lkr": round(float(res["cost"].sum()), 1),
                  "soc_pct": [round(float(s) / bat.cap * 100, 1) for s in res["soc"]]}
    return out


def plan_for_user(profile, buy, sell, soc_pct, battery_kwh, pv_kwp, daily_kwh, month, start_hour,
                  is_weekend=False, weather_events=None, outage_events=None, cfg=None, pv_per_kwp=None, solar_source=None):
    """Everything the app needs in one call: forecasts used, MPC plan, comparison, plain-English notes."""
    base = cfg or load_config()
    c = make_cfg(base, battery_kwh, pv_kwp)
    hrs, pv, load = build_forecasts(month, start_hour, pv_kwp or c["pv"]["system_kwp"], daily_kwh, is_weekend, weather_events,
                                 pv_per_kwp=pv_per_kwp)
    outage = build_outage(outage_events)
    plan = get_plan(profile, buy, sell, soc_pct, pv, load, outage, c)
    cmp_ = compare_controllers(profile, c, soc_pct, pv, load, outage, buy, sell)
    notes = []
    if any(outage):
        first = outage.index(1)
        notes.append(f"Grid outage expected from hour {hrs[first]:02d}:00 for {sum(outage)} h. The plan prepares the battery before it.")
    if solar_source:
        notes.append(solar_source)
    if weather_events:
        notes.append("Solar forecast adjusted for your weather outlook.")
    if cmp_["plain_rule"]["unserved_critical_kwh"] > cmp_["mpc"]["unserved_critical_kwh"]:
        d = cmp_["plain_rule"]["unserved_critical_kwh"] - cmp_["mpc"]["unserved_critical_kwh"]
        notes.append(f"The planner keeps {d:.2f} kWh more critical power than a normal battery rule.")
    return {"profile": profile, "hour_of_day": hrs, "pv_forecast_kwh": pv, "load_forecast_kwh": load,
            "outage_forecast": outage, "battery_kwh": c["battery"]["capacity_kwh"], "pv_kwp": c["pv"]["system_kwp"],
            "plan": plan, "comparison": cmp_, "notes": notes,
            "weather_source": "open-meteo" if pv_per_kwp is not None else "typical"}
