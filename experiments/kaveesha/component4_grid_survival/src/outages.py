"""Synthetic load-shedding schedules for Component 4 (fallback, no live CEB data).
Anchors (documented, not invented): 2025 CEB cuts ~90 min; 2019 rolling blackouts 3-5 h/day, none on Sundays.
Everything else (start-time weights, split into blocks) is an ASSUMPTION - log it in docs/assumptions_log.md."""
import numpy as np, pandas as pd

SCENARIOS = {                       # hours_per_day, number of blocks, skip_sunday
    "mild":     dict(hours=1.5, blocks=1, skip_sunday=False),   # ~2025 style
    "moderate": dict(hours=3.0, blocks=2, skip_sunday=True),    # ~2019 low end
    "severe":   dict(hours=5.0, blocks=3, skip_sunday=True),    # ~2019 high end
}
# assumed likelihood a block starts at each hour (daytime + evening peak heavier than night)
START_W = np.array([1,1,1,1,1,1, 2,3,3,3,3,3, 3,3,3,3,3,4, 5,5,4,3,2,1], float)

def make_outage_schedule(start="2026-01-01", days=365, scenario="moderate", seed=0):
    """Return hourly DataFrame: datetime_local, outage (1 = grid down). Fully deterministic given seed."""
    cfg, rng = SCENARIOS[scenario], np.random.default_rng(seed)
    idx = pd.date_range(start, periods=days*24, freq="1h")
    out = np.zeros(len(idx), int)
    for d in range(days):
        day = idx[d*24]
        if cfg["skip_sunday"] and day.dayofweek == 6: continue
        per_block = max(1, round(cfg["hours"] / cfg["blocks"]))
        starts, tries = [], 0
        while len(starts) < cfg["blocks"] and tries < 50:
            s = rng.choice(24, p=START_W/START_W.sum()); tries += 1
            if s + per_block <= 24 and all(abs(s - o) >= per_block + 2 for o in starts):
                starts.append(s)
        for s in starts: out[d*24+s : d*24+s+per_block] = 1
    return pd.DataFrame({"datetime_local": idx, "outage": out})

if __name__ == "__main__":
    for sc in SCENARIOS:
        df = make_outage_schedule(scenario=sc); df.to_csv(f"outage_{sc}.csv", index=False)
        print(sc, "avg outage h/day:", round(df.outage.sum()/365, 2))
