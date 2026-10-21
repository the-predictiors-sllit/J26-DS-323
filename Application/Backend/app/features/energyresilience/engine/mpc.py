"""Model Predictive Control (receding horizon) as a linear program solved with SciPy HiGHS.
Each hour: look ahead H hours, minimise cost + penalty on unserved critical load, apply hour 1, repeat."""
import numpy as np
from scipy.optimize import linprog
from scipy.sparse import lil_matrix
from .simulator import Battery


def solve_mpc(soc0, pv_f, load_f, outage_f, buy_f, sell_f, bat, crit_frac, unserved_penalty, degr=2.0, reserve_pct=0):
    """Solve one horizon. Inputs are arrays of length H. Returns dict with the planned hourly
    battery power (kWh, + charge / - discharge) and the full plan."""
    H = len(pv_f)
    ch, dis, imp, exp, cur, uns = [slice(i * H, (i + 1) * H) for i in range(6)]
    N = 7 * H + 1
    eta = bat.eta
    up = 1 - np.asarray(outage_f)
    need = np.where(up == 1, load_f, crit_frac * np.asarray(load_f))
    # objective
    c = np.zeros(N)
    c[ch] = degr; c[dis] = degr
    c[imp] = buy_f; c[exp] = -np.asarray(sell_f)
    c[uns] = unserved_penalty
    c[cur] = 1e-4
    c[6 * H + H] = -0.8 * np.mean(buy_f) * eta              # value of energy left in battery at horizon end
    # equalities
    A = lil_matrix((2 * H + 1, N)); b = np.zeros(2 * H + 1)
    A[0, 6 * H] = 1; b[0] = soc0
    for t in range(H):
        r = 1 + t                                           # soc balance
        A[r, 6 * H + t + 1] = 1; A[r, 6 * H + t] = -1; A[r, t] = -eta; A[r, H + t] = 1 / eta
        r = 1 + H + t                                       # power balance
        A[r, 2 * H + t] = 1; A[r, H + t] = 1; A[r, t] = -1; A[r, 3 * H + t] = -1; A[r, 4 * H + t] = -1
        A[r, 5 * H + t] = 1
        b[r] = need[t] - pv_f[t]
    big = 1e3
    bounds = ([(0, bat.max_ch)] * H + [(0, bat.max_dis)] * H +
              [(0, big * u) for u in up] + [(0, big * u) for u in up] +
              [(0, big)] * H + [(0, 0 if u else big) for u in up] +
              [(soc0, soc0)] + [(min(max(bat.soc_min, reserve_pct / 100 * bat.cap if u else bat.soc_min), bat.soc_max), bat.soc_max)
                                 for u in up])
    # reserve floor: when the grid is up the battery keeps at least reserve_pct (usable during outages down to the minimum)
    r = linprog(c, A_eq=A.tocsr(), b_eq=b, bounds=bounds, method="highs")
    if r.status != 0:
        return {"ok": False, "p_first": 0.0}
    x = r.x
    plan = x[ch] - x[dis]
    return {"ok": True, "p_first": float(plan[0]), "plan": plan, "soc_plan": x[6 * H:7 * H + 1], "imp": x[imp], "exp": x[exp],
            "unserved": x[uns], "cost": float(r.fun)}


def make_mpc_controller(cfg, profile, forecast_noise=0.0, seed=0, know_outages=True):
    """Return controller(t, soc, df) for run_receding_horizon / simulate.
    forecast_noise: relative std of error added to PV and load forecasts (0 = perfect forecast)."""
    bat = Battery(cfg["battery"])
    pen = cfg["profiles"][profile]["unserved_penalty_lkr_per_kwh"]
    reserve = cfg["profiles"][profile].get("reserve_pct", 0)
    H = cfg["mpc"]["horizon_hours"]
    crit = cfg["household"]["critical_load_fraction"]
    degr = cfg["degradation_lkr_per_kwh_throughput"]
    rng = np.random.default_rng(seed)
    cache = {}

    def controller(t, soc, df):
        if "arr" not in cache:
            cache["arr"] = {k: df[k].to_numpy() for k in ["pv", "load", "outage", "buy", "sell"]}
        a, e = cache["arr"], min(t + H, len(df))
        pv_f, ld_f = a["pv"][t:e].copy(), a["load"][t:e].copy()
        if forecast_noise > 0:
            pv_f *= np.clip(1 + forecast_noise * rng.standard_normal(len(pv_f)), 0, None)
            ld_f *= np.clip(1 + forecast_noise * rng.standard_normal(len(ld_f)), 0, None)
        outage_f = a["outage"][t:e] if know_outages else np.zeros(e - t, int)
        sol = solve_mpc(soc, pv_f, ld_f, outage_f, a["buy"][t:e], a["sell"][t:e], bat, crit, pen, degr, reserve)
        return sol["p_first"]
    return controller


def run_receding_horizon(df, cfg, profile, forecast_noise=0.0, seed=0, know_outages=True):
    """Run MPC across the whole dataframe and return the hourly results."""
    from simulator import simulate
    return simulate(make_mpc_controller(cfg, profile, forecast_noise, seed, know_outages), df, cfg)
