"""Compare rule-based vs MPC (3 preference profiles) over a full year and several outage scenarios."""
import sys
from pathlib import Path
import pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parent))
from data_loader import load_config, load_weather, make_load_year, ROOT
from pv_model import simulate_pv
from simulator import simulate, summarize
from baseline import rule_based_controller
from mpc import run_receding_horizon
from outages import make_outage_schedule


def build_inputs(cfg, year=2025, scenario="moderate", household="small", days=365, seed=1):
    """Hourly dataframe (pv, load, outage, buy, sell) for one household and outage scenario."""
    hh = cfg["households"][household]
    pv_cfg = dict(cfg["pv"], system_kwp=hh["pv_kwp"])
    pv = simulate_pv(load_weather(), pv_cfg)[f"{year}-01-01":f"{year}-12-31 23:00"].iloc[: days * 24]
    out = make_outage_schedule(start=f"{year}-01-01", days=days, scenario=scenario, seed=seed).set_index("datetime_local")["outage"]
    return pd.DataFrame({"pv": pv, "load": make_load_year(pv.index, hh["load_site"], seed=seed),
                         "outage": out.reindex(pv.index).fillna(0).astype(int),
                         "buy": cfg["tariff"]["buy_lkr_per_kwh"], "sell": cfg["tariff"]["sell_lkr_per_kwh"]})


def evaluate(cfg, scenario="moderate", household="small", days=365, forecast_noise=0.0, know_outages=True):
    """Return one metrics row per controller."""
    df = build_inputs(cfg, scenario=scenario, household=household, days=days)
    rows = {"rule_based": summarize(simulate(rule_based_controller, df, cfg), df, cfg)}
    for p in cfg["profiles"]:
        rows[f"mpc_{p}"] = summarize(run_receding_horizon(df, cfg, p, forecast_noise, know_outages=know_outages), df, cfg)
    t = pd.DataFrame(rows).T
    t["savings_vs_rule_lkr"] = t.loc["rule_based", "grid_cost_lkr_per_year"] - t["grid_cost_lkr_per_year"]
    t.insert(0, "scenario", scenario); t.insert(1, "household", household); t.insert(2, "outages_known_in_advance", know_outages)
    return t.round(1)


def evaluate_combo(args):
    return evaluate(*args)


if __name__ == "__main__":
    cfg = load_config()
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 365
    from concurrent.futures import ProcessPoolExecutor
    combos = [(s, h, 0.0, True) for h in ["small", "large"] for s in ["mild", "moderate", "severe"]]
    combos += [("moderate", h, 0.0, False) for h in ["small", "large"]]          # surprise outages
    with ProcessPoolExecutor() as ex:
        out = pd.concat(list(ex.map(evaluate_combo, [(cfg, s, h, days, n, k) for s, h, n, k in combos])))
    out.index.name = "controller"
    (ROOT / "results").mkdir(exist_ok=True)
    out.to_csv(ROOT / "results" / "evaluation_summary.csv")
    print(out.to_string())
