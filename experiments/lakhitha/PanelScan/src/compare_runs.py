r"""compare_runs.py - compare your experiment runs with each other and with the baseline, in one table.

    python src\compare_runs.py                              # every results\predictions_<tag>.csv
    python src\compare_runs.py --runs A_base A_frozen       # only these runs
    python src\compare_runs.py --exclude "CRN 13552" "CRN 8139"   # which sites to leave out of the second table (the default)

It prints three tables:
  1. All sites.
  2. The sites that remain after leaving out the ones whose condition appears at NO other site (CRN 13552 has the
     only heavy dust, CRN 8139 the only corrosion). A model cannot learn a condition it never saw, so this shows how
     it does on conditions it could have seen. Report BOTH tables; never only the flattering one.
  3. The health-score error per site, run by run.

How to read it: the BASELINE predicts the average of the training sites for every photo. A run is only useful if it
beats that: lower errors, a higher soiling accuracy and a clearly positive correlation. "diff" columns are
run minus baseline (negative error differences are good).
Uses only pandas and numpy.
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd


def _mae(a, b):
    return float(np.mean(np.abs(np.asarray(a, float) - np.asarray(b, float))))


def _r(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    return float("nan") if len(a) < 3 or a.std() == 0 or b.std() == 0 else float(np.corrcoef(a, b)[0, 1])


def metrics(p):
    """One row of numbers for a set of held-out predictions, for the model and for the baseline."""
    site_mean = lambda col: p.groupby("Site_ID")[col].transform("mean")
    model = {
        "health_MAE": _mae(p.pred_health_score, p.true_health_score),
        "output_pct_MAE": _mae(p.pred_output_pct, p.true_output_pct),
        "watts_MAE": _mae(p.pred_watts, p.Recent_Max_Output_W),
        "soiling_acc": float(((p.pred_soiling_prob >= 0.5).astype(int) == p.true_soiling).mean()),
        "r_pooled": _r(p.pred_health_score, p.true_output_pct),
        "r_within_site": _r(p.pred_health_score - site_mean("pred_health_score"), p.true_output_pct - site_mean("true_output_pct")),
    }
    base = {
        "health_MAE": _mae(p.base_health_score, p.true_health_score),
        "output_pct_MAE": _mae(p.base_output_pct, p.true_output_pct),
        "watts_MAE": _mae(p.base_watts, p.Recent_Max_Output_W),
        "soiling_acc": float((p.base_soiling == p.true_soiling).mean()),
        "r_pooled": float("nan"), "r_within_site": float("nan"),
    }
    return model, base


def table(runs, exclude):
    """runs: {tag: predictions DataFrame}. Returns a DataFrame with a baseline row and one row per run."""
    rows, base_row = [], None
    for tag, p in runs.items():
        q = p[~p.Site_ID.str.strip().isin(exclude)] if exclude else p
        if q.empty:
            continue
        model, base = metrics(q)
        base_row = base_row or {"run": "BASELINE", "photos": len(q), **base}
        rows.append({"run": tag, "photos": len(q), **model,
                     "health_diff": model["health_MAE"] - base["health_MAE"],
                     "output_diff": model["output_pct_MAE"] - base["output_pct_MAE"],
                     "soiling_diff": model["soiling_acc"] - base["soiling_acc"]})
    return pd.DataFrame([base_row] + rows) if base_row else pd.DataFrame()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results-dir", default="results")
    ap.add_argument("--runs", nargs="*", default=None, help="tags to compare (default: every predictions_<tag>.csv)")
    ap.add_argument("--exclude", nargs="*", default=["CRN 13552", "CRN 8139"],
                    help="sites left out of the second table (conditions that appear nowhere else)")
    args = ap.parse_args()

    files = sorted(Path(args.results_dir).glob("predictions_*.csv"))
    runs = {f.stem.replace("predictions_", ""): pd.read_csv(f) for f in files}
    if args.runs:
        missing = [r for r in args.runs if r not in runs]
        if missing:
            raise SystemExit(f"no predictions file for: {missing}. Found: {sorted(runs)}")
        runs = {r: runs[r] for r in args.runs}
    if not runs:
        raise SystemExit(f"no predictions_*.csv found in {args.results_dir}")
    for p in runs.values():
        p["Site_ID"] = p.Site_ID.astype(str).str.strip()

    pd.set_option("display.width", 220)
    pd.set_option("display.max_columns", 30)
    out = []
    for title, ex in [("ALL SITES", []), (f"WITHOUT {', '.join(args.exclude)} (conditions seen at no other site)", args.exclude)]:
        t = table(runs, ex)
        print(f"\n=== {title} ===")
        print(t.round(3).to_string(index=False, na_rep="-"))
        t.insert(0, "subset", "all" if not ex else "without_unique_sites")
        out.append(t)

    print("\n=== HEALTH-SCORE ERROR PER SITE (points of 100; lower is better; baseline first) ===")
    first = next(iter(runs.values()))
    per = pd.DataFrame({"photos": first.groupby("Site_ID").size(),
                        "BASELINE": first.groupby("Site_ID").apply(lambda x: _mae(x.base_health_score, x.true_health_score), include_groups=False)})
    for tag, p in runs.items():
        per[tag] = p.groupby("Site_ID").apply(lambda x: _mae(x.pred_health_score, x.true_health_score), include_groups=False)
    print(per.round(1).to_string())
    print("\nWhich runs beat the baseline at each site:")
    for site, row in per.iterrows():
        wins = [tag for tag in runs if row[tag] < row["BASELINE"]]
        print(f"   {site:10s} better than baseline: {', '.join(wins) if wins else 'none'}")

    Path(args.results_dir).mkdir(exist_ok=True)
    pd.concat(out).to_csv(Path(args.results_dir) / "comparison.csv", index=False)
    print(f"\nsaved {Path(args.results_dir) / 'comparison.csv'}")


if __name__ == "__main__":
    main()
