"""Draw the result chart from results/evaluation_summary.csv."""
import sys
from pathlib import Path
import pandas as pd, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
ROOT = Path(__file__).resolve().parents[1]
COL = {"rule_based": "#8a8a85", "mpc_savings": "#2a78d6", "mpc_balanced": "#eb6834", "mpc_resilience": "#1baf7a"}
LAB = {"rule_based": "Rule-based", "mpc_savings": "MPC savings", "mpc_balanced": "MPC balanced", "mpc_resilience": "MPC resilience"}
d = pd.read_csv(ROOT / "results" / "evaluation_summary.csv")
d = d[d.outages_known_in_advance == True]
fig, ax = plt.subplots(1, 2, figsize=(11, 4.2), constrained_layout=True)
for a, hh in zip(ax, ["small", "large"]):
    s = d[d.household == hh]
    w, scen = 0.2, ["mild", "moderate", "severe"]
    for i, c in enumerate(COL):
        v = [s[(s.scenario == sc) & (s.controller == c)].hours_lost_critical_per_year.iloc[0] for sc in scen]
        a.bar([x + (i - 1.5) * (w + 0.02) for x in range(3)], v, w, color=COL[c], label=LAB[c])
    a.set_xticks(range(3)); a.set_xticklabels(scen); a.set_title(f"{hh.capitalize()} home", loc="left", fontsize=11)
    a.set_ylabel("Hours of lost critical power per year"); a.spines[["top", "right"]].set_visible(False)
    a.grid(axis="y", alpha=.25); a.set_axisbelow(True)
ax[0].legend(frameon=False, fontsize=9)
fig.suptitle("Planning ahead removes lost critical power (outage schedule known, one simulated year)", x=0.01, ha="left", fontsize=12)
fig.savefig(ROOT / "results" / "hours_lost_by_scenario.png", dpi=160)

fig, ax = plt.subplots(figsize=(6.4, 4.2), constrained_layout=True)
s = d[(d.household == "small") & (d.scenario == "moderate")]
for c in COL:
    r = s[s.controller == c].iloc[0]
    ax.scatter(r.grid_cost_lkr_per_year, r.hours_lost_critical_per_year, s=90, color=COL[c], zorder=3)
    ax.annotate(LAB[c], (r.grid_cost_lkr_per_year, r.hours_lost_critical_per_year), xytext=(7, 6), textcoords="offset points", fontsize=9)
ax.set_xlabel("Yearly grid cost (LKR, lower is better)"); ax.set_ylabel("Hours of lost critical power per year")
ax.set_title("Small home, moderate outages: the savings versus resilience trade-off", loc="left", fontsize=10)
ax.spines[["top", "right"]].set_visible(False); ax.grid(alpha=.25)
fig.savefig(ROOT / "results" / "tradeoff.png", dpi=160)
print("saved charts")
