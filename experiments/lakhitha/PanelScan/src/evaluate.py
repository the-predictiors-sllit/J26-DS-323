"""evaluate.py - metrics for leave-one-site-out predictions.

Needs only pandas, numpy and scipy, so it can also be run on its own:
    python src/evaluate.py results/predictions_A_image_only.csv
"""
import sys

import numpy as np
import pandas as pd
from scipy.stats import pearsonr


def tier_from_severity(sev):
    return "Healthy" if sev <= 20 else "Early" if sev <= 60 else "Moderate" if sev <= 85 else "Severe"


def make_pred_frame(test_df, reg_pred, soil_prob, train_df):
    """One row per held-out photo: the truth, the model's prediction and two trivial baselines.

    Both baselines ignore the photo. One predicts the AVERAGE of the TRAINING sites, the other their
    MEDIAN (both with the majority soiling class). With skewed data (most panels healthy, a few very
    low) the median has the lower error, so it is the fairer number to beat: a model that only learns
    to guess the typical value beats the average without having learned anything from the photo.
    """
    out = test_df[["Photo_Filename", "Site_ID", "Rated_Capacity_W", "Recent_Max_Output_W",
                   "Severity_Score_0_100"]].reset_index(drop=True).copy()
    out["true_health_score"] = test_df.Health_Score_0_100.values
    out["true_output_pct"] = test_df.Health_Percentage.values
    out["true_soiling"] = test_df.Soiling_Target.values
    out["pred_health_score"] = reg_pred[:, 0] * 100
    out["pred_output_pct"] = reg_pred[:, 1] * 100
    out["pred_soiling_prob"] = soil_prob
    out["base_health_score"] = train_df.Health_Score_0_100.mean()
    out["base_output_pct"] = train_df.Health_Percentage.mean()
    out["base_soiling"] = int(train_df.Soiling_Target.mean() >= 0.5)
    out["median_health_score"] = train_df.Health_Score_0_100.median()
    out["median_output_pct"] = train_df.Health_Percentage.median()
    out["pred_watts"] = out.pred_output_pct / 100 * out.Rated_Capacity_W
    out["base_watts"] = out.base_output_pct / 100 * out.Rated_Capacity_W
    out["median_watts"] = out.median_output_pct / 100 * out.Rated_Capacity_W
    return out


def ensure_median_columns(p):
    """Older prediction files have no median baseline. When every site was held out once (a full run), the training
    sites' truth for each held-out site is simply the other sites' rows in the same file, so it can be rebuilt."""
    p = p.copy()
    if "median_health_score" in p.columns:
        return p
    med_h, med_o = pd.Series(index=p.index, dtype=float), pd.Series(index=p.index, dtype=float)
    for site, g in p.groupby("Site_ID"):
        other = p[p.Site_ID != site]
        med_h.loc[g.index] = other.true_health_score.median() if len(other) else float("nan")
        med_o.loc[g.index] = other.true_output_pct.median() if len(other) else float("nan")
    p["median_health_score"], p["median_output_pct"] = med_h, med_o
    p["median_watts"] = p.median_output_pct / 100 * p.Rated_Capacity_W
    return p


def _mae(a, b):
    return float(np.mean(np.abs(np.asarray(a, float) - np.asarray(b, float))))


def _rmse(a, b):
    return float(np.sqrt(np.mean((np.asarray(a, float) - np.asarray(b, float)) ** 2)))


def _r(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    if len(a) < 3 or a.std() == 0 or b.std() == 0:
        return float("nan")
    return float(pearsonr(a, b)[0])


def summarize(p, prefix=None):
    """Print and (optionally) save the overall and per-site results."""
    p = ensure_median_columns(p)
    p["pred_soiling"] = (p.pred_soiling_prob >= 0.5).astype(int)
    pred_sev = 100 - p.pred_health_score
    p["pred_tier"] = pred_sev.map(tier_from_severity)
    p["true_tier"] = p.Severity_Score_0_100.map(tier_from_severity)

    # --- overall (all held-out photos pooled) ---
    overall = pd.DataFrame([
        ("Health score error, MAE (points of 100)", _mae(p.pred_health_score, p.true_health_score),
         _mae(p.base_health_score, p.true_health_score), _mae(p.median_health_score, p.true_health_score)),
        ("Health score error, RMSE (points of 100)", _rmse(p.pred_health_score, p.true_health_score),
         _rmse(p.base_health_score, p.true_health_score), _rmse(p.median_health_score, p.true_health_score)),
        ("Output percent error, MAE (points of 100)", _mae(p.pred_output_pct, p.true_output_pct),
         _mae(p.base_output_pct, p.true_output_pct), _mae(p.median_output_pct, p.true_output_pct)),
        ("Output error in watts, MAE", _mae(p.pred_watts, p.Recent_Max_Output_W),
         _mae(p.base_watts, p.Recent_Max_Output_W), _mae(p.median_watts, p.Recent_Max_Output_W)),
        ("Soiling flag accuracy (0-1)", float((p.pred_soiling == p.true_soiling).mean()),
         float((p.base_soiling == p.true_soiling).mean()), float((p.base_soiling == p.true_soiling).mean())),
    ], columns=["metric", "model", "baseline (training average)", "baseline (training median)"])

    # correlation of the predicted score with real measured output
    site_mean = lambda col: p.groupby("Site_ID")[col].transform("mean")
    r_all = _r(p.pred_health_score, p.true_output_pct)
    r_within = _r(p.pred_health_score - site_mean("pred_health_score"),
                  p.true_output_pct - site_mean("true_output_pct"))
    corr = pd.DataFrame([
        ("Pearson r: predicted score vs measured output %, all sites pooled", r_all),
        ("Pearson r: same, site averages removed (panel-to-panel within a site)", r_within),
    ], columns=["metric", "value"])

    # --- per site ---
    rows = []
    for site, g in p.groupby("Site_ID"):
        rows.append({
            "site": site, "photos": len(g),
            "true_score_mean": g.true_health_score.mean(), "pred_score_mean": g.pred_health_score.mean(),
            "score_MAE": _mae(g.pred_health_score, g.true_health_score),
            "score_MAE_baseline": _mae(g.base_health_score, g.true_health_score),
            "score_MAE_median_baseline": _mae(g.median_health_score, g.true_health_score),
            "output_pct_MAE": _mae(g.pred_output_pct, g.true_output_pct),
            "soiling_acc": float((g.pred_soiling == g.true_soiling).mean()),
            "soiling_acc_baseline": float((g.base_soiling == g.true_soiling).mean()),
        })
    per_site = pd.DataFrame(rows).round(2)

    pd.set_option("display.width", 220)
    pd.set_option("display.max_columns", 30)
    print("\n=== OVERALL (every photo was predicted while its own site was held out) ===")
    print(overall.round(3).to_string(index=False))
    print()
    print(corr.round(3).to_string(index=False))
    print("\n=== PER SITE (this is where the honest answer is) ===")
    print(per_site.to_string(index=False))
    print("\n=== Tier from predicted score vs tier from your severity (diagnostic only; Severe has 4 photos) ===")
    print(pd.crosstab(p.true_tier, p.pred_tier).to_string())

    if prefix:
        overall.round(4).to_csv(f"{prefix}_overall.csv", index=False)
        corr.round(4).to_csv(f"{prefix}_correlation.csv", index=False)
        per_site.to_csv(f"{prefix}_per_site.csv", index=False)
        print(f"\nsaved {prefix}_overall.csv, {prefix}_correlation.csv, {prefix}_per_site.csv")
    return overall, corr, per_site


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python src/evaluate.py results/predictions_<tag>.csv")
    path = sys.argv[1]
    summarize(pd.read_csv(path), path.replace("predictions_", "summary_").replace(".csv", ""))
