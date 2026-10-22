r"""other_models.py - other models, tested EXACTLY like the main model, for comparison.

    python src\other_models.py --precropped                                        # the full default grid (about 15 minutes)
    python src\other_models.py --precropped --features handcrafted resnet18        # fewer feature sets
    python src\other_models.py --precropped --heads ridge forest                   # fewer heads
    python src\compare_runs.py --match X_                                          # then compare them (see compare_runs.py)

Every model sees the same photos (same cut-out, CLAHE and resize as the main model) and is tested leave-one-site-out:
it is trained on 7 sites and predicts the 8th, 8 times. Results are written as results\predictions_<tag>.csv and
results\summary_<tag>_*.csv, the same files train.py writes, so compare_runs.py can put everything in one table.

A model here = FEATURES + a HEAD:
  features  handcrafted     27 numbers per photo: colour, brightness, contrast, haze (dark channel), sharpness, edge
                            density, blue-cell fraction. Simple things dust and dirt change.
            resnet18, resnet50, efficientnet_b0, mobilenet_v3_large, densenet121, convnext_tiny
                            the ImageNet-pretrained network with its last layer removed, kept FROZEN (no fine-tuning).
  head      ridge   linear regression with shrinkage (logistic regression for the soiling flag)
            svr     support-vector machine (RBF kernel)
            forest  random forest (300 trees)
            knn     k-nearest neighbours (k=7)
            boost   gradient boosting
Settings are fixed, NOT tuned on the test sites, so no model is favoured. Features are standardised, and for every head
except ridge reduced to 50 principal components when there are more than 50; both steps use the training sites only.
The fine-tuned networks (ResNet18, ResNet50) are run with train.py (--backbone resnet50 ...).

Choosing the best of many models on 8 sites is optimistic: report ALL of them, not only the winner.
"""
import argparse
import contextlib
import io
import time
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from sklearn.decomposition import PCA
from sklearn.ensemble import (HistGradientBoostingClassifier, HistGradientBoostingRegressor, RandomForestClassifier,
                              RandomForestRegressor)
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.multioutput import MultiOutputRegressor
from sklearn.neighbors import KNeighborsClassifier, KNeighborsRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC, SVR
from torchvision import models

from dataset import get_transforms
from evaluate import make_pred_frame, summarize
from train import prepare_cache

DEEP = ["resnet18", "resnet50", "efficientnet_b0", "mobilenet_v3_large", "densenet121", "convnext_tiny"]
HEADS = ["ridge", "svr", "forest", "knn", "boost"]
HANDCRAFTED_NAMES = (["R_mean", "G_mean", "B_mean", "R_std", "G_std", "B_std", "sat_mean", "sat_std", "val_mean", "val_std",
                      "low_saturation_fraction", "gray_mean", "gray_contrast", "gray_p5", "gray_p50", "gray_p95", "gray_entropy",
                      "dark_channel_mean", "dark_channel_p90", "laplacian_variance", "gradient_mean", "canny_edge_density",
                      "local_contrast_mean", "local_contrast_std", "R_over_B", "G_over_B", "blue_cell_fraction"])


# ----------------------------------------------------------------------------------------------- features
def handcrafted_features(rgb):
    """27 simple numbers describing colour, brightness, haze and sharpness of one preprocessed panel photo."""
    img = rgb.astype(np.float32)
    gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    sat, val = hsv[:, :, 1].astype(np.float32) / 255, hsv[:, :, 2].astype(np.float32) / 255
    dark = cv2.erode(rgb.min(axis=2), np.ones((7, 7), np.uint8)).astype(np.float32) / 255
    hist = np.bincount((gray // 8).ravel(), minlength=32).astype(np.float64)
    hist /= hist.sum()
    entropy = float(-(hist[hist > 0] * np.log2(hist[hist > 0])).sum())
    h16, w16 = (gray.shape[0] // 16) * 16, (gray.shape[1] // 16) * 16
    blocks = gray[:h16, :w16].astype(np.float32).reshape(h16 // 16, 16, w16 // 16, 16).std(axis=(1, 3))
    grad = np.hypot(cv2.Sobel(gray, cv2.CV_32F, 1, 0), cv2.Sobel(gray, cv2.CV_32F, 0, 1))
    blue = ((hsv[:, :, 0] >= 95) & (hsv[:, :, 0] <= 135) & (hsv[:, :, 1] > 60) & (hsv[:, :, 2] > 30)).mean()
    r, g, b = (img[:, :, c].mean() for c in range(3))
    p5, p50, p95 = np.percentile(gray, [5, 50, 95])
    return np.array([
        r, g, b, img[:, :, 0].std(), img[:, :, 1].std(), img[:, :, 2].std(),
        sat.mean(), sat.std(), val.mean(), val.std(), (sat < 0.25).mean(),
        gray.mean(), gray.std(), p5, p50, p95, entropy,
        dark.mean(), np.percentile(dark, 90), cv2.Laplacian(gray, cv2.CV_32F).var(), grad.mean(),
        cv2.Canny(gray, 50, 150).mean() / 255, blocks.mean(), blocks.std(), r / max(b, 1e-6), g / max(b, 1e-6), blue,
    ], dtype=np.float64)


def build_backbone(name, pretrained):
    """The torchvision network with its classification layer removed: the output is the feature vector."""
    w = pretrained
    if name == "resnet18":
        net = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1 if w else None)
        net.fc = nn.Identity()
    elif name == "resnet50":
        net = models.resnet50(weights=models.ResNet50_Weights.IMAGENET1K_V2 if w else None)
        net.fc = nn.Identity()
    elif name == "efficientnet_b0":
        net = models.efficientnet_b0(weights=models.EfficientNet_B0_Weights.DEFAULT if w else None)
        net.classifier = nn.Identity()
    elif name == "mobilenet_v3_large":
        net = models.mobilenet_v3_large(weights=models.MobileNet_V3_Large_Weights.DEFAULT if w else None)
        net.classifier = nn.Identity()
    elif name == "densenet121":
        net = models.densenet121(weights=models.DenseNet121_Weights.DEFAULT if w else None)
        net.classifier = nn.Identity()
    elif name == "convnext_tiny":
        net = models.convnext_tiny(weights=models.ConvNeXt_Tiny_Weights.DEFAULT if w else None)
        net.classifier[2] = nn.Identity()
    else:
        raise ValueError(f"unknown backbone {name}")
    return net


def extract_features(name, df, cache, pretrained, device):
    """One feature row per photo, in the order of df. No labels are used, so there is no leakage."""
    paths = df.Image_Path.tolist()
    if name == "handcrafted":
        return np.stack([handcrafted_features(cache[p]) for p in paths])
    net = build_backbone(name, pretrained).to(device).eval()
    tf = get_transforms(False)                  # the same normalisation the main model uses
    out = []
    with torch.no_grad():
        for i in range(0, len(paths), 16):
            batch = torch.stack([tf(image=cache[p])["image"] for p in paths[i:i + 16]]).to(device)
            out.append(net(batch).float().cpu().numpy())
    return np.concatenate(out)


# ----------------------------------------------------------------------------------------------- heads
def make_models(head, seed, n_features):
    """(regressor for [health score, output %], classifier for the soiling flag); fixed settings, not tuned."""
    if head == "ridge":
        reg, clf, pca = Ridge(alpha=10.0), LogisticRegression(C=0.1, max_iter=5000), False
    elif head == "svr":
        reg, clf, pca = MultiOutputRegressor(SVR(kernel="rbf", C=1.0, epsilon=0.02)), SVC(C=1.0, probability=True, random_state=seed), True
    elif head == "forest":
        reg = RandomForestRegressor(n_estimators=300, min_samples_leaf=2, random_state=seed, n_jobs=-1)
        clf, pca = RandomForestClassifier(n_estimators=300, min_samples_leaf=2, random_state=seed, n_jobs=-1), True
    elif head == "knn":
        reg, clf, pca = KNeighborsRegressor(n_neighbors=7, weights="distance"), KNeighborsClassifier(n_neighbors=7, weights="distance"), True
    elif head == "boost":
        reg = MultiOutputRegressor(HistGradientBoostingRegressor(max_depth=3, learning_rate=0.05, max_iter=150, random_state=seed))
        clf, pca = HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=150, random_state=seed), True
    else:
        raise ValueError(f"unknown head {head}")
    def wrap(model, n_train):
        steps = [StandardScaler()]
        if pca and n_features > 50:
            steps.append(PCA(n_components=min(50, n_train - 1, n_features), random_state=seed))
        return make_pipeline(*steps, model)
    return reg, clf, wrap


def run_loso(df, X, head, seed):
    frames = []
    Y = np.c_[df.Health_Score_0_100.values / 100.0, df.Health_Percentage.values / 100.0]
    soil = df.Soiling_Target.values
    for site in sorted(df.Site_ID.unique()):
        te = (df.Site_ID == site).values
        tr = ~te
        reg, clf, wrap = make_models(head, seed, X.shape[1])
        reg_model = wrap(reg, int(tr.sum())).fit(X[tr], Y[tr])
        reg_pred = np.clip(reg_model.predict(X[te]), 0.0, 1.0)
        if len(np.unique(soil[tr])) < 2:        # a fold whose training sites show only one class
            prob = np.full(int(te.sum()), float(soil[tr].mean() >= 0.5))
        else:
            prob = wrap(clf, int(tr.sum())).fit(X[tr], soil[tr]).predict_proba(X[te])[:, 1]
        frames.append(make_pred_frame(df[te], reg_pred, prob, df[tr]))
    return pd.concat(frames, ignore_index=True)


def main():
    ap = argparse.ArgumentParser(description="Other models, tested leave-one-site-out like the main model.")
    ap.add_argument("--csv", default="data/panel_dataset_clean.csv")
    ap.add_argument("--features", nargs="*", default=["handcrafted"] + DEEP, choices=["handcrafted"] + DEEP)
    ap.add_argument("--heads", nargs="*", default=HEADS, choices=HEADS)
    ap.add_argument("--prefix", default="X", help="run names are <prefix>_<features>_<head>")
    ap.add_argument("--precropped", action="store_true", help="the photos are already straightened by hand (as in train.py)")
    ap.add_argument("--corners", default=None)
    ap.add_argument("--img-size", type=int, default=224)
    ap.add_argument("--no-clahe", action="store_true")
    ap.add_argument("--no-pretrained", action="store_true", help="random network weights (only for testing the code)")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    df = pd.read_csv(args.csv).reset_index(drop=True)
    print(f"{len(df)} photos, {df.Site_ID.nunique()} sites | feature sets: {args.features} | heads: {args.heads}")
    cache = prepare_cache(df, args)
    Path("results").mkdir(exist_ok=True)

    rows = []
    for feat in args.features:
        t0 = time.time()
        X = extract_features(feat, df, cache, not args.no_pretrained, device)
        print(f"\nfeatures '{feat}': {X.shape[1]} numbers per photo, extracted in {time.time() - t0:.0f}s")
        for head in args.heads:
            tag = f"{args.prefix}_{feat}_{head}"
            t1 = time.time()
            preds = run_loso(df, X, head, args.seed)
            preds.to_csv(f"results/predictions_{tag}.csv", index=False)
            with contextlib.redirect_stdout(io.StringIO()):          # summarize prints three long tables; keep one line
                overall, corr, _ = summarize(preds, f"results/summary_{tag}")
            o = overall.set_index("metric")
            get = lambda key, col="model": float(o.loc[[i for i in o.index if i.startswith(key)][0], col])
            row = {"run": tag, "health_MAE": get("Health score error, MAE"), "output_MAE": get("Output percent error, MAE"),
                   "soiling_acc": get("Soiling flag accuracy")}
            row["baseline_health_MAE"] = get("Health score error, MAE", "baseline (training average)")
            row["median_health_MAE"] = get("Health score error, MAE", "baseline (training median)")
            rows.append(row)
            print(f"   {tag:34s} health error {row['health_MAE']:5.1f} | output-% error {row['output_MAE']:5.1f} | "
                  f"soiling accuracy {row['soiling_acc']:.2f}   ({time.time() - t1:.0f}s)")

    r = pd.DataFrame(rows).sort_values("health_MAE")
    base, med = r.baseline_health_MAE.iloc[0], r.median_health_MAE.iloc[0]
    print("\n=== ranked by health-score error (lower is better) ===")
    print(r[["run", "health_MAE", "output_MAE", "soiling_acc"]].round(2).to_string(index=False))
    print(f"\ntrivial guesses that ignore the photo: predict the average = {base:.1f}, predict the median = {med:.1f}")
    print(f"{int((r.health_MAE < base).sum())} of {len(r)} models beat the average guess; "
          f"{int((r.health_MAE < med).sum())} of {len(r)} beat the median guess (the fairer test).")
    print("Next: python src\\compare_runs.py --match X_     (full tables, extra measures and a chart)")


if __name__ == "__main__":
    main()
