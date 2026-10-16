"""train.py - leave-one-site-out training and evaluation (Version A: your own photos only).

For each site in turn: train on the other sites, then predict the held-out site.
No model selection is done on the held-out site (a fixed number of epochs is used),
so the result is an honest estimate for a site the model has never seen.

Quick check on one site first:
    python src/train.py --test-sites "CRN 53652" --epochs 2
Full run (all sites):
    python src/train.py
Photos you straightened by hand (use --images data/cropped when running prepare_dataset.py):
    python src/train.py --precropped --tag A_precropped
Or crop every photo to the panel with corner clicks (needs data/panel_corners.csv):
    python src/train.py --corners data/panel_corners.csv --tag A_crop
Fewer passes, frozen features, stronger augmentation (quick checks against over-fitting; each with its own --tag):
    python src/train.py --precropped --epochs 5 --tag A_ep5
    python src/train.py --precropped --freeze-backbone --tag A_frozen
    python src/train.py --precropped --strong-aug --tag A_strongaug
Larger photos / no CLAHE / age+capacity as extra inputs (give each run its own --tag):
    python src/train.py --precropped --img-size 384 --tag A_size384
    python src/train.py --precropped --no-clahe --tag A_noclahe
    python src/train.py --precropped --use-meta --tag A_with_meta

train_final.py reuses build_and_train, prepare_cache and add_common_args from this file.
"""
import argparse
import random
import time
from pathlib import Path

import numpy as np
import pandas as pd
import torch
import torch.nn as nn
from torch.utils.data import DataLoader

from corners import read_corners
from dataset import PanelDataset
from evaluate import make_pred_frame, summarize
from model import PanelModel
from preprocessing import load_all


def add_common_args(ap):
    """Options shared by train.py and train_final.py."""
    ap.add_argument("--csv", default="data/panel_dataset_clean.csv")
    ap.add_argument("--backbone", default="resnet18", choices=["resnet18", "resnet50"])
    ap.add_argument("--epochs", type=int, default=15)
    ap.add_argument("--batch-size", type=int, default=16)
    ap.add_argument("--lr", type=float, default=1e-4)
    ap.add_argument("--use-meta", action="store_true", help="also feed age and rated capacity (ablation)")
    ap.add_argument("--no-pretrained", action="store_true", help="do not download ImageNet weights")
    ap.add_argument("--img-size", type=int, default=224,
                    help="photos are resized to this width; 384 or 448 keep small marks visible but train slower")
    ap.add_argument("--no-clahe", action="store_true", help="skip the CLAHE lighting step (to test whether it helps)")
    ap.add_argument("--precropped", action="store_true",
                    help="the photos in the CSV are already cut out and straightened by hand: just resize them")
    ap.add_argument("--corners", default=None,
                    help="CSV of panel corners (from annotate_corners.py): crop every photo to the panel")
    ap.add_argument("--freeze-backbone", action="store_true",
                    help="train only the small heads on the frozen pretrained features: fast, and less able to memorise sites")
    ap.add_argument("--strong-aug", action="store_true",
                    help="stronger augmentation (zoom, shift, colour, blur): makes site-specific colour and texture less usable")
    ap.add_argument("--seed", type=int, default=42)


def set_seed(seed):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def prepare_cache(df, args):
    """Read every photo once (crop, CLAHE, resize) and keep it in memory."""
    if args.corners and args.precropped:
        raise SystemExit("use either --corners or --precropped, not both")
    corners = None
    if args.corners:
        found = read_corners(args.corners)
        missing = [n for n in df.Photo_Filename if n not in found]
        if missing:
            raise SystemExit(f"{len(missing)} photos have no corners in {args.corners} "
                             f"(first few: {missing[:8]}). Run annotate_corners.py to finish them.")
        corners = {p: found[n] for p, n in zip(df.Image_Path, df.Photo_Filename)}

    print("loading photos once (" + ("panel crop + " if corners else "straightened photos + " if args.precropped else "")
          + "resize" + ("" if args.no_clahe else " + CLAHE") + ")...")
    return load_all(df.Image_Path.tolist(), size=args.img_size, use_clahe=not args.no_clahe,
                    corners=corners, precropped=args.precropped)


def predict(model, loader, device):
    """Run the model on a loader (no shuffling) and return (regression outputs, soiling probabilities)."""
    model.eval()
    regs, probs = [], []
    with torch.no_grad():
        for img, meta, _, _ in loader:
            reg, soil_logit = model(img.to(device), meta.to(device))
            regs.append(reg.cpu().numpy())
            probs.append(torch.sigmoid(soil_logit).cpu().numpy())
    return np.concatenate(regs), np.concatenate(probs)


def build_and_train(train_df, cache, args, device):
    """Train a fresh model on the photos in train_df for a fixed number of epochs and return it."""
    train_ds = PanelDataset(train_df, cache, train=True, strong_aug=args.strong_aug)
    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,
                              drop_last=len(train_ds) > args.batch_size)

    model = PanelModel(args.backbone, use_meta=args.use_meta, pretrained=not args.no_pretrained).to(device)
    head_params = (list(model.shared.parameters()) + list(model.reg_head.parameters())
                   + list(model.soil_head.parameters()))
    if args.freeze_backbone:
        for param in model.backbone.parameters():
            param.requires_grad = False
        groups = [{"params": head_params, "lr": args.lr * 10}]     # only the small heads learn
    else:
        groups = [{"params": model.backbone.parameters(), "lr": args.lr},
                  {"params": head_params, "lr": args.lr * 3}]
    optimizer = torch.optim.AdamW(groups, weight_decay=1e-4)
    mse, bce = nn.MSELoss(), nn.BCEWithLogitsLoss()

    for epoch in range(1, args.epochs + 1):
        model.train()
        if args.freeze_backbone:
            model.backbone.eval()       # keep the pretrained batch-norm statistics unchanged
        total = 0.0
        for img, meta, reg_t, soil_t in train_loader:
            img, meta = img.to(device), meta.to(device)
            reg_t, soil_t = reg_t.to(device), soil_t.to(device)
            reg, soil_logit = model(img, meta)
            loss = mse(reg, reg_t) + 0.5 * bce(soil_logit, soil_t)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            total += loss.item() * img.size(0)
        print(f"    epoch {epoch:2d}/{args.epochs}   train loss {total / len(train_ds):.4f}")
    return model


def train_one_fold(train_df, test_df, cache, args, device):
    model = build_and_train(train_df, cache, args, device)
    test_ds = PanelDataset(test_df, cache, train=False)
    test_loader = DataLoader(test_ds, batch_size=args.batch_size, shuffle=False)
    return predict(model, test_loader, device)


def main():
    ap = argparse.ArgumentParser()
    add_common_args(ap)
    ap.add_argument("--test-sites", nargs="*", default=None,
                    help='sites to hold out, e.g. "CRN 53652" "CRN 8139" (default: every site)')
    ap.add_argument("--tag", default="A_image_only")
    args = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    df = pd.read_csv(args.csv)
    crop = "corners" if args.corners else "hand-straightened photos" if args.precropped else "none"
    print(f"device: {device} | photos: {len(df)} | sites: {df.Site_ID.nunique()} | backbone: {args.backbone} | "
          f"image size: {args.img_size} | CLAHE: {not args.no_clahe} | panel crop: {crop} | "
          f"extra inputs (age, capacity): {args.use_meta} | frozen backbone: {args.freeze_backbone} | strong augmentation: {args.strong_aug}")

    cache = prepare_cache(df, args)

    all_sites = sorted(df.Site_ID.unique())
    sites = args.test_sites or all_sites
    unknown = [s for s in sites if s not in all_sites]
    if unknown:
        raise SystemExit(f"unknown site(s) {unknown}. Available: {all_sites}")

    frames = []
    for k, site in enumerate(sites, 1):
        test_df = df[df.Site_ID == site]
        train_df = df[df.Site_ID != site]
        print(f"\n[{k}/{len(sites)}] hold out {site}: train on {len(train_df)} photos "
              f"from {train_df.Site_ID.nunique()} sites, test on {len(test_df)}")
        set_seed(args.seed + k)
        start = time.time()
        reg, prob = train_one_fold(train_df, test_df, cache, args, device)
        print(f"    done in {time.time() - start:.0f}s")
        frames.append(make_pred_frame(test_df, reg, prob, train_df))

    preds = pd.concat(frames, ignore_index=True)
    Path("results").mkdir(exist_ok=True)
    preds.to_csv(f"results/predictions_{args.tag}.csv", index=False)
    print(f"\nsaved results/predictions_{args.tag}.csv")
    summarize(preds, f"results/summary_{args.tag}")


if __name__ == "__main__":
    main()
