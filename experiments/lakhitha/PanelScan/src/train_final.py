"""train_final.py - train ONE model on every photo and save it for the app.

Run this only AFTER the leave-one-site-out experiments (train.py) have told you which settings
work best. Use the SAME options here as in the best experiment (--precropped or --corners,
--img-size, --no-clahe, --backbone, --epochs, --use-meta).

    python src/train_final.py --precropped --output-margin 8.5

--output-margin is how many percentage points of output the app shows either side of its
estimate. Take it from results/summary_<tag>_overall.csv ("Output percent error, MAE").
The model is saved to checkpoints/panelscan.pt together with the settings it was trained with,
so inference.py and the web service can rebuild exactly the same input pipeline.
"""
import argparse
import datetime
from pathlib import Path

import pandas as pd
import torch

from consistency import file_hashes
from dataset import AGE_SCALE, CAPACITY_SCALE
from preprocessing import PANEL_ASPECT
from train import add_common_args, build_and_train, prepare_cache, set_seed


def main():
    ap = argparse.ArgumentParser()
    add_common_args(ap)
    ap.add_argument("--out", default="checkpoints/panelscan.pt")
    ap.add_argument("--output-margin", type=float, default=10.0,
                    help="+/- percentage points of output shown around the estimate (use your leave-one-site-out MAE)")
    ap.add_argument("--soiling-threshold", type=float, default=0.5,
                    help="probability above which a surface deposit is reported")
    args = ap.parse_args()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    df = pd.read_csv(args.csv)
    print(f"training the final model on all {len(df)} photos from {df.Site_ID.nunique()} sites ({device})")
    cache = prepare_cache(df, args)

    set_seed(args.seed)
    model = build_and_train(df, cache, args, device)

    config = {
        "backbone": args.backbone,
        "use_meta": bool(args.use_meta),
        "img_size": int(args.img_size),
        "use_clahe": not args.no_clahe,
        "panel_aspect": float(PANEL_ASPECT),
        "age_scale": float(AGE_SCALE),
        "capacity_scale": float(CAPACITY_SCALE),
        "output_margin": float(args.output_margin),
        "soiling_threshold": float(args.soiling_threshold),
        "trained_on_crop": "corners" if args.corners else "hand-straightened" if args.precropped else "none",
        "source_hashes": file_hashes(Path(__file__).resolve().parent),   # checked again when the Backend loads the model
        "n_photos": int(len(df)),
        "n_sites": int(df.Site_ID.nunique()),
        "epochs": int(args.epochs),
        "freeze_backbone": bool(args.freeze_backbone),
        "strong_aug": bool(args.strong_aug),
        "created": datetime.datetime.now().isoformat(timespec="seconds"),
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"state_dict": {k: v.cpu() for k, v in model.state_dict().items()}, "config": config}, out)
    print(f"\nsaved {out}")
    for k, v in config.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
