r"""compare_runs.py - every run (fine-tuned networks, classical models, anything with a predictions file) in one table.

    python src\compare_runs.py                                  # every results\predictions_<tag>.csv
    python src\compare_runs.py --match X_                       # only runs whose name contains X_ (the other_models.py runs)
    python src\compare_runs.py --runs A_frozen A_base           # only these exact runs
    python src\compare_runs.py --sort output_MAE --top 10       # sort by another measure; show 10 per-site columns
    python src\compare_runs.py --chart                          # also write results\model_comparison.png

TWO TRIVIAL BASELINES come first in every table. Neither looks at the photo:
  BASELINE (median)  predicts the median of the training sites for every photo
  BASELINE (mean)    predicts their average
With skewed data (most panels healthy, a few very low) the median has the lower error, so it is the number to beat. A
model that merely learns to guess the typical value beats the mean without having learned anything from the photo.
"vs median" columns are the run minus the median baseline: NEGATIVE = better than the median guess.

Tables: 1. all sites; 2. the sites left after removing the two whose condition appears nowhere else (heavy dust 13552,
corrosion 8139; a model cannot learn a condition it never saw); 3. fuller accuracy measures (all sites); 4. health error
per site for the best runs. Report tables 1 and 2 together; never only the flattering one.

Measures: health_MAE / output_MAE (average error in points of 100), watts_MAE, R2 (1 = perfect, 0 = no better than the
overall average), within10 (share of photos within 10 points), tier_acc and tier_F1 (the Healthy / Early / Moderate /
Severe tier from the predicted score), the soiling flag's accuracy, precision, recall, F1 and balanced accuracy, and the
correlation of predicted score with measured output (pooled over sites, and within sites).
Everything is rebuilt from the predictions files, so older runs work too.
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

from evaluate import ensure_median_columns, tier_from_severity

TIERS = ["Healthy", "Early", "Moderate", "Severe"]
HIGHER_IS_BETTER = ("soiling_acc", "r_pooled", "R2")


def _mae(a, b):
    return float(np.mean(np.abs(np.asarray(a, float) - np.asarray(b, float))))


def _r(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    return float("nan") if len(a) < 3 or a.std() == 0 or b.std() == 0 else float(np.corrcoef(a, b)[0, 1])


def _tier_scores(true_t, pred_t):
    true_t, pred_t = np.asarray(true_t), np.asarray(pred_t)
    f1s = []
    for t in TIERS:
        if not ((true_t == t).any() or (pred_t == t).any()):
            continue
        tp = float(((true_t == t) & (pred_t == t)).sum())
        fp, fn = float(((true_t != t) & (pred_t == t)).sum()), float(((true_t == t) & (pred_t != t)).sum())
        f1s.append(0.0 if tp == 0 else 2 * tp / (2 * tp + fp + fn))
    return float((true_t == pred_t).mean()), float(np.mean(f1s))


def _soil_scores(true, pred):
    true, pred = np.asarray(true).astype(int), np.asarray(pred).astype(int)
    tp, fp = float(((true == 1) & (pred == 1)).sum()), float(((true == 0) & (pred == 1)).sum())
    fn, tn = float(((true == 1) & (pred == 0)).sum()), float(((true == 0) & (pred == 0)).sum())
    prec, rec = (tp / (tp + fp) if tp + fp else 0.0), (tp / (tp + fn) if tp + fn else 0.0)
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    bal = 0.5 * ((tp / (tp + fn) if tp + fn else 0.0) + (tn / (tn + fp) if tn + fp else 0.0))
    return float((true == pred).mean()), prec, rec, f1, bal


def _block(p, health, out_pct, watts, soil_flag, with_corr):
    """All measures for one set of predictions (the model's, or one of the baselines')."""
    health = np.asarray(health, float)
    truth_h = p.true_health_score.values
    err = np.abs(health - truth_h)
    sst = float(((truth_h - truth_h.mean()) ** 2).sum())
    pred_tier = pd.Series(100 - health).map(tier_from_severity)
    true_tier = pd.Series(100 - truth_h).map(tier_from_severity)
    tier_acc, tier_f1 = _tier_scores(true_tier, pred_tier)
    acc, prec, rec, f1, bal = _soil_scores(p.true_soiling.values, soil_flag)
    out = {
        "health_MAE": float(err.mean()), "health_RMSE": float(np.sqrt((err ** 2).mean())),
        "R2": 1 - float(((health - truth_h) ** 2).sum()) / sst if sst else float("nan"),
        "within10": float((err <= 10).mean()),
        "output_MAE": _mae(out_pct, p.true_output_pct), "watts_MAE": _mae(watts, p.Recent_Max_Output_W),
        "soiling_acc": acc, "soil_precision": prec, "soil_recall": rec, "soil_F1": f1, "soil_bal_acc": bal,
        "tier_acc": tier_acc, "tier_F1": tier_f1, "r_pooled": float("nan"), "r_within": float("nan"),
    }
    if with_corr:
        site_mean = lambda col: p.groupby("Site_ID")[col].transform("mean").values
        out["r_pooled"] = _r(health, p.true_output_pct)
        out["r_within"] = _r(health - site_mean("pred_health_score"), p.true_output_pct.values - site_mean("true_output_pct"))
    return out


def score_run(p):
    """{'model': {...}, 'median': {...}, 'mean': {...}} for one run's predictions."""
    model = _block(p, p.pred_health_score, p.pred_output_pct, p.pred_watts, (p.pred_soiling_prob >= 0.5).astype(int), True)
    median = _block(p, p.median_health_score, p.median_output_pct, p.median_watts, p.base_soiling, False)
    mean = _block(p, p.base_health_score, p.base_output_pct, p.base_watts, p.base_soiling, False)
    return {"model": model, "median": median, "mean": mean}


def build_table(runs, exclude):
    """The two baselines first (they are identical in every run), then one row per run."""
    rows, first = [], None
    for tag, p in runs.items():
        q = p[~p.Site_ID.isin(exclude)] if exclude else p
        if q.empty:
            continue
        s = score_run(q.reset_index(drop=True))
        first = first or s
        rows.append({"run": tag, "photos": len(q), **s["model"]})
    if first is None:
        return pd.DataFrame()
    n = rows[0]["photos"]
    base = [{"run": "BASELINE (median)", "photos": n, **first["median"]}, {"run": "BASELINE (mean)", "photos": n, **first["mean"]}]
    t = pd.DataFrame(base + rows)
    t["health_vs_median"] = t.health_MAE - t.health_MAE.iloc[0]
    t["output_vs_median"] = t.output_MAE - t.output_MAE.iloc[0]
    return t


def show(t, cols, title):
    pd.set_option("display.width", 250)
    pd.set_option("display.max_columns", 40)
    print(f"\n=== {title} ===")
    print(t[["run"] + cols].round(3).to_string(index=False, na_rep="-"))


def chart(t_all, path, top):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    runs = t_all.iloc[2:].sort_values("health_MAE").head(top)
    med, mean = t_all.iloc[0], t_all.iloc[1]
    fig, axes = plt.subplots(1, 2, figsize=(13, 0.45 * len(runs) + 2.2), sharey=True)
    for ax, col, label in [(axes[0], "health_MAE", "Health-score error (points; lower is better)"),
                           (axes[1], "output_MAE", "Output-percent error (points; lower is better)")]:
        ax.barh(runs.run, runs[col], color=["#2a9d8f" if v < med[col] else "#c0c0c0" for v in runs[col]])
        ax.axvline(med[col], color="#1d3557", linestyle="--", linewidth=1.5, label=f"predict the median ({med[col]:.1f})")
        ax.axvline(mean[col], color="#e76f51", linestyle=":", linewidth=1.5, label=f"predict the average ({mean[col]:.1f})")
        ax.set_xlabel(label)
        ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.16), fontsize=8)
    axes[0].invert_yaxis()                 # the y axis is shared: invert it once, so the best run is at the top
    fig.suptitle("Leave-one-site-out, all sites (green = beats the median guess)", fontsize=11)
    fig.tight_layout()
    fig.savefig(path, dpi=140)
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--results-dir", default="results")
    ap.add_argument("--runs", nargs="*", default=None, help="exact run names (default: every predictions_<tag>.csv)")
    ap.add_argument("--match", nargs="*", default=None, help="keep runs whose name contains any of these pieces of text")
    ap.add_argument("--exclude", nargs="*", default=["CRN 13552", "CRN 8139"],
                    help="sites left out of table 2 (conditions that appear nowhere else)")
    ap.add_argument("--sort", default="health_MAE", choices=["health_MAE", "output_MAE", "watts_MAE", "soiling_acc", "r_pooled", "R2"])
    ap.add_argument("--top", type=int, default=8, help="how many runs to show in the per-site table and chart")
    ap.add_argument("--chart", action="store_true", help="write results/model_comparison.png")
    args = ap.parse_args()

    files = sorted(Path(args.results_dir).glob("predictions_*.csv"))
    runs = {f.stem.replace("predictions_", ""): pd.read_csv(f) for f in files}
    if args.runs:
        missing = [r for r in args.runs if r not in runs]
        if missing:
            raise SystemExit(f"no predictions file for: {missing}. Found: {sorted(runs)}")
        runs = {r: runs[r] for r in args.runs}
    if args.match:
        runs = {k: v for k, v in runs.items() if any(m in k for m in args.match)}
    if not runs:
        raise SystemExit(f"no matching predictions_*.csv in {args.results_dir}")
    for tag, p in list(runs.items()):
        p["Site_ID"] = p.Site_ID.astype(str).str.strip()
        runs[tag] = ensure_median_columns(p)
        if runs[tag].Site_ID.nunique() < 8:
            print(f"note: {tag} covers only {runs[tag].Site_ID.nunique()} site(s); its totals are not comparable with full runs")

    asc = args.sort not in HIGHER_IS_BETTER
    main_cols = ["health_MAE", "health_vs_median", "output_MAE", "output_vs_median", "watts_MAE", "soiling_acc", "r_pooled", "r_within"]
    ext_cols = ["health_RMSE", "R2", "within10", "tier_acc", "tier_F1", "soil_precision", "soil_recall", "soil_F1", "soil_bal_acc"]

    out, tables = [], {}
    for key, title, ex in [("all", "1. ALL SITES", []),
                           ("six", f"2. WITHOUT {', '.join(args.exclude)} (conditions seen at no other site)", args.exclude)]:
        t = build_table(runs, ex)
        t = pd.concat([t.iloc[:2], t.iloc[2:].sort_values(args.sort, ascending=asc)])
        tables[key] = t
        show(t, main_cols, title)
        out.append(t.assign(subset=key))
    show(tables["all"], ext_cols, "3. FULLER ACCURACY MEASURES (all sites)")

    first = next(iter(runs.values()))
    best = tables["all"].iloc[2:].head(args.top).run.tolist()
    per = pd.DataFrame({
        "photos": first.groupby("Site_ID").size(),
        "BASELINE (median)": first.groupby("Site_ID").apply(lambda x: _mae(x.median_health_score, x.true_health_score), include_groups=False),
        "BASELINE (mean)": first.groupby("Site_ID").apply(lambda x: _mae(x.base_health_score, x.true_health_score), include_groups=False)})
    for tag in best:
        per[tag] = runs[tag].groupby("Site_ID").apply(lambda x: _mae(x.pred_health_score, x.true_health_score), include_groups=False)
    print(f"\n=== 4. HEALTH-SCORE ERROR PER SITE: the {len(best)} best runs (lower is better) ===")
    print(per.round(1).to_string())

    a = tables["all"].iloc[2:]
    med, mean = tables["all"].iloc[0], tables["all"].iloc[1]
    beat_med = a[a.health_MAE < med.health_MAE]
    print("\n=== verdict (health-score error) ===")
    print(f"   all sites: predict the median ({med.health_MAE:.1f}): {len(beat_med)} of {len(a)} runs beat it"
          + (f" -> {', '.join(beat_med.run)}" if len(beat_med) else ""))
    print(f"   all sites: predict the average ({mean.health_MAE:.1f}): {int((a.health_MAE < mean.health_MAE).sum())} of {len(a)} runs beat it")
    six = tables["six"].iloc[2:]
    print(f"   without the two unique-condition sites the median guess scores {tables['six'].iloc[0].health_MAE:.1f}: "
          f"{int((six.health_MAE < tables['six'].iloc[0].health_MAE).sum())} of {len(six)} runs beat it")

    Path(args.results_dir).mkdir(exist_ok=True)
    pd.concat(out).to_csv(Path(args.results_dir) / "comparison.csv", index=False)
    print(f"\nsaved {Path(args.results_dir) / 'comparison.csv'}")
    if args.chart:
        chart(tables["all"], Path(args.results_dir) / "model_comparison.png", args.top)
        print(f"saved {Path(args.results_dir) / 'model_comparison.png'}")


if __name__ == "__main__":
    main()
