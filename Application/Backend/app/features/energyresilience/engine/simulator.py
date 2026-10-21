"""Hourly physics of a solar + battery home with scheduled outages.
Shared by every controller (rule-based, MPC, PPO) so the comparison is fair."""
import numpy as np
import pandas as pd


class Battery:
    """Battery limits from config. Energy in kWh, AC-side flows, one-way efficiency = sqrt(round trip)."""
    def __init__(self, cfg):
        self.cap = cfg["capacity_kwh"]
        self.soc_min = cfg["min_soc_pct"] / 100 * self.cap
        self.soc_max = cfg["max_soc_pct"] / 100 * self.cap
        self.max_ch, self.max_dis = cfg["max_charge_kw"], cfg["max_discharge_kw"]
        self.eta = float(np.sqrt(cfg["round_trip_efficiency"]))
        self.soc0 = cfg["init_soc_pct"] / 100 * self.cap


def step_physics(soc, p_cmd, pv, load, outage, crit_frac, bat):
    """Advance one hour. p_cmd = requested battery AC power (kWh this hour, +charge / -discharge).
    During an outage the inverter always discharges to back the critical load (backup mode).
    Returns new soc and a dict of flows."""
    crit = crit_frac * load
    eta = bat.eta
    room = (bat.soc_max - soc) / eta                       # AC kWh the battery can still absorb
    avail = max(soc - bat.soc_min, 0.0) * eta               # AC kWh it can still deliver
    ch = dis = imp = exp = curt = uns = 0.0
    if outage:
        need = max(crit - pv, 0.0)
        dis = min(need, bat.max_dis, avail)                 # automatic backup discharge
        uns = need - dis                                    # critical load that went dark
        surplus = max(pv - crit, 0.0)
        ch = min(max(p_cmd, 0.0), surplus, bat.max_ch, room)
        curt = surplus - ch
    else:
        if p_cmd >= 0:
            ch = min(p_cmd, bat.max_ch, room)
        else:
            dis = min(-p_cmd, bat.max_dis, avail)
        net = pv + dis - load - ch                          # >0 export, <0 import
        imp, exp = max(-net, 0.0), max(net, 0.0)
    soc_new = soc + eta * ch - dis / eta
    return soc_new, dict(ch=ch, dis=dis, imp=imp, exp=exp, curt=curt, uns=uns, crit=crit)


def simulate(controller, df, cfg, crit_frac=None):
    """Run a controller over df (columns pv, load, outage, buy, sell). controller(t, soc, df) -> p_cmd.
    Returns hourly results DataFrame."""
    bat = Battery(cfg["battery"])
    crit_frac = cfg["household"]["critical_load_fraction"] if crit_frac is None else crit_frac
    soc, rows = bat.soc0, []
    pv, load, out = df["pv"].to_numpy(), df["load"].to_numpy(), df["outage"].to_numpy()
    for t in range(len(df)):
        p = controller(t, soc, df)
        soc, f = step_physics(soc, p, pv[t], load[t], out[t], crit_frac, bat)
        f["soc"] = soc
        rows.append(f)
    res = pd.DataFrame(rows, index=df.index)
    res["cost"] = df["buy"].to_numpy() * res["imp"] - df["sell"].to_numpy() * res["exp"]
    return res


def summarize(res, df, cfg):
    """Headline metrics. hours_lost = hours in which any critical load went unserved."""
    days = len(res) / 24
    thr = cfg["degradation_lkr_per_kwh_throughput"] * (res["ch"] + res["dis"]).sum()
    return {
        "hours_lost_critical_per_year": float((res["uns"] > 0.01).sum() / days * 365),
        "unserved_kwh_per_year": float(res["uns"].sum() / days * 365),
        "grid_cost_lkr_per_year": float(res["cost"].sum() / days * 365),
        "battery_throughput_kwh_per_year": float((res["ch"] + res["dis"]).sum() / days * 365),
        "outage_hours_per_year": float(df["outage"].sum() / days * 365),
    }
