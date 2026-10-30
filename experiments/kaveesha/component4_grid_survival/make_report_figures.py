"""Makes the Data Analysis Report figures from Component 4 data.
Run from inside the component folder (or any folder above it):
    python make_report_figures.py
Figures are saved into a new folder called report_figures next to this script."""
from pathlib import Path
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

HERE = Path.cwd()
OUT = Path(__file__).resolve().parent / "report_figures"
OUT.mkdir(exist_ok=True)
plt.rcParams.update({"font.family": "serif", "font.size": 11, "axes.spines.top": False, "axes.spines.right": False})


def find(name):
    hits = [p for p in HERE.rglob(name) if "node_modules" not in p.parts and ".git" not in p.parts]
    if not hits:
        print(f"  not found: {name}  (skipping the figure that needs it)")
        return None
    print(f"  using {hits[0]}")
    return hits[0]


made = []

# Figure 1: average home use and solar by hour for the two homes
f1, f2 = find("weligama_hourly.csv"), find("hybrid_crn14037_hourly.csv")
if f1 and f2:
    fig, axes = plt.subplots(1, 2, figsize=(11, 4), sharey=False, constrained_layout=True)
    for ax, f, title in zip(axes, [f1, f2], ["Small home (Weligama)", "Large home (CRN14037)"]):
        d = pd.read_csv(f, parse_dates=["datetime_local"])
        g = d.groupby(d.datetime_local.dt.hour)[["pv_kwh", "load_kwh"]].mean()
        ax.plot(g.index, g.pv_kwh, marker="o", color="#e8a317", label="Solar generation")
        ax.plot(g.index, g.load_kwh, marker="s", color="#2a5d9f", label="Home use")
        ax.set_title(title, loc="left")
        ax.set_xlabel("Hour of day")
        ax.set_ylabel("Average energy (kWh per hour)")
        ax.set_xticks(range(0, 24, 3))
        ax.grid(alpha=0.25)
    axes[0].legend(frameon=False)
    fig.savefig(OUT / "fig_solar_vs_home_use.png", dpi=200)
    made.append("fig_solar_vs_home_use.png")

# Figure 2: battery state of charge over the logged period
f = find("battery_soc_series.csv")
if f:
    b = pd.read_csv(f, parse_dates=["datetime"]).sort_values("datetime")
    daily = b.set_index("datetime").soc.resample("1D").agg(["min", "mean", "max"]).dropna()
    fig, ax = plt.subplots(figsize=(10, 3.8), constrained_layout=True)
    ax.fill_between(daily.index, daily["min"], daily["max"], color="#1baf7a", alpha=0.25, label="Daily range")
    ax.plot(daily.index, daily["mean"], color="#137a56", label="Daily average")
    ax.axhline(80, color="#888", ls="--", lw=1)
    ax.text(daily.index[0], 81, "80 percent", color="#666", fontsize=9)
    ax.set_ylabel("Battery charge (%)")
    ax.set_ylim(0, 102)
    ax.legend(frameon=False, loc="lower left")
    ax.grid(alpha=0.25)
    fig.savefig(OUT / "fig_battery_soc.png", dpi=200)
    made.append("fig_battery_soc.png")

# Figure 3: typical solar output per kWp by month
f = find("pv_profiles_per_kwp.csv")
if f:
    p = pd.read_csv(f)
    m = p.groupby("month")[["normal_kwh", "sunny_kwh"]].sum()
    names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    fig, ax = plt.subplots(figsize=(9, 3.8), constrained_layout=True)
    x = range(len(m))
    ax.bar([i - 0.2 for i in x], m.normal_kwh, 0.4, color="#e8a317", label="Average day")
    ax.bar([i + 0.2 for i in x], m.sunny_kwh, 0.4, color="#f4cf7a", label="Clear day")
    ax.set_xticks(list(x))
    ax.set_xticklabels([names[i - 1] for i in m.index])
    ax.set_ylabel("Daily solar output (kWh per kWp)")
    ax.legend(frameon=False)
    ax.grid(axis="y", alpha=0.25)
    ax.set_axisbelow(True)
    fig.savefig(OUT / "fig_monthly_solar.png", dpi=200)
    made.append("fig_monthly_solar.png")

# Figure 4: hours of lost critical power per controller (simulation results)
f = find("evaluation_summary.csv")
if f:
    d = pd.read_csv(f)
    if "outages_known_in_advance" in d:
        d = d[d.outages_known_in_advance.astype(str).str.lower() == "true"]
    col = {"rule_based": "#8a8a85", "mpc_savings": "#2a78d6", "mpc_balanced": "#eb6834", "mpc_resilience": "#1baf7a"}
    lab = {"rule_based": "Rule based", "mpc_savings": "MPC savings", "mpc_balanced": "MPC balanced", "mpc_resilience": "MPC resilience"}
    scen = [s for s in ["mild", "moderate", "severe"] if s in set(d.scenario)]
    homes = [h for h in ["small", "large"] if h in set(d.household)]
    fig, axes = plt.subplots(1, len(homes), figsize=(11, 4.2), constrained_layout=True, squeeze=False)
    for ax, h in zip(axes[0], homes):
        s = d[d.household == h]
        ctrls = [c for c in col if c in set(s.controller)]
        w = 0.8 / max(len(ctrls), 1)
        for i, c in enumerate(ctrls):
            v = [s[(s.scenario == sc) & (s.controller == c)].hours_lost_critical_per_year.sum() for sc in scen]
            ax.bar([k + (i - (len(ctrls) - 1) / 2) * w for k in range(len(scen))], v, w, color=col[c], label=lab[c])
        ax.set_xticks(range(len(scen)))
        ax.set_xticklabels(scen)
        ax.set_title(f"{h.capitalize()} home", loc="left")
        ax.set_ylabel("Hours of lost critical power per year")
        ax.grid(axis="y", alpha=0.25)
        ax.set_axisbelow(True)
    axes[0][0].legend(frameon=False, fontsize=9)
    fig.savefig(OUT / "fig_hours_lost.png", dpi=200)
    made.append("fig_hours_lost.png")

print("\nSaved in", OUT)
for m in made:
    print("  ", m)
