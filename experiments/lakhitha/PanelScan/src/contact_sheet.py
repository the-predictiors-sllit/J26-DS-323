r"""contact_sheet.py - look at your straightened photos as thumbnails, without opening 150 huge files.

    python src\contact_sheet.py --csv data\panel_dataset_clean.csv                    # photos whose shape is off by 15% or more
    python src\contact_sheet.py --csv data\panel_dataset_clean.csv --threshold 0.08   # a stricter list
    python src\contact_sheet.py --csv data\panel_dataset_clean.csv --all              # every photo, grouped by site

Writes results\shape_check_1.jpg, shape_check_2.jpg, ... Each tile shows one photo at its TRUE shape, with its
name, its height/width, and how far that is from the median of its site. Photos of one site show the same panel
model, so a shape far from the site median usually means the crop shows only part of the panel, includes extra
(roof, a neighbouring panel), or was saved sideways.
Tile border: red = 25% or more off, orange = 15-25% off, grey = closer.

What to look for in each tile: the whole panel, upright, filling the picture, nothing extra and nothing cut off.
The sheets show private property, so results\*.jpg is git-ignored. Do not share them.
"""
import argparse
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from PIL import Image

TILE_W, TILE_H, LABEL_H = 190, 330, 46


def measured_shape(path):
    """Height / width as OpenCV (and so the training) will see the photo, including the phone's rotation tag."""
    with Image.open(path) as im:
        w, h = im.size
        if im.getexif().get(0x0112, 1) in (5, 6, 7, 8):
            w, h = h, w
    return h / w


def make_tile(row):
    # a reduced-size read is much faster for very large JPEGs and still applies the rotation tag
    img = cv2.imread(row.Image_Path, cv2.IMREAD_REDUCED_COLOR_8)
    if img is None:
        img = cv2.imread(row.Image_Path)
    tile = np.full((TILE_H + LABEL_H, TILE_W, 3), 40, np.uint8)
    if img is not None:
        scale = min((TILE_W - 8) / img.shape[1], (TILE_H - 8) / img.shape[0])
        small = cv2.resize(img, (max(1, int(img.shape[1] * scale)), max(1, int(img.shape[0] * scale))), interpolation=cv2.INTER_AREA)
        y0 = (TILE_H - small.shape[0]) // 2
        x0 = (TILE_W - small.shape[1]) // 2
        tile[y0:y0 + small.shape[0], x0:x0 + small.shape[1]] = small
    mag = abs(row.dev)
    colour = (60, 60, 230) if mag >= 0.25 else (40, 150, 245) if mag >= 0.15 else (110, 110, 110)   # BGR
    cv2.rectangle(tile, (0, 0), (TILE_W - 1, TILE_H - 1), colour, 3)
    cv2.putText(tile, row.Photo_Filename, (6, TILE_H + 16), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1, cv2.LINE_AA)
    cv2.putText(tile, f"shape {row.aspect:.2f} ({row.dev:+.0%})", (6, TILE_H + 32), cv2.FONT_HERSHEY_SIMPLEX, 0.45, colour, 1, cv2.LINE_AA)
    cv2.putText(tile, str(row.Site_ID).replace("CRN ", "site "), (6, TILE_H + 44), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1, cv2.LINE_AA)
    return tile


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="data/panel_dataset_clean.csv", help="needs Photo_Filename, Image_Path, Site_ID")
    ap.add_argument("--threshold", type=float, default=0.15, help="show photos whose shape is off by at least this fraction")
    ap.add_argument("--all", action="store_true", help="show every photo, grouped by site")
    ap.add_argument("--out-dir", default="results")
    ap.add_argument("--cols", type=int, default=8)
    ap.add_argument("--rows", type=int, default=3, help="rows per sheet")
    args = ap.parse_args()

    df = pd.read_csv(args.csv)
    df["aspect"] = [measured_shape(p) for p in df.Image_Path]
    df["dev"] = df.aspect / df.groupby("Site_ID").aspect.transform("median") - 1
    show = df if args.all else df[df.dev.abs() >= args.threshold]
    show = (show.sort_values(["Site_ID", "Photo_Filename"]) if args.all else show.reindex(show.dev.abs().sort_values(ascending=False).index))
    print(f"{len(show)} of {len(df)} photos to show "
          f"({'all' if args.all else f'shape off by {args.threshold:.0%} or more, worst first'})")
    if show.empty:
        return

    Path(args.out_dir).mkdir(exist_ok=True)
    per_sheet = args.cols * args.rows
    rows = list(show.itertuples())
    for s in range(0, len(rows), per_sheet):
        tiles = [make_tile(r) for r in rows[s:s + per_sheet]]
        while len(tiles) % args.cols:
            tiles.append(np.zeros_like(tiles[0]))
        grid = np.vstack([np.hstack(tiles[i:i + args.cols]) for i in range(0, len(tiles), args.cols)])
        path = Path(args.out_dir) / f"shape_check_{s // per_sheet + 1}.jpg"
        cv2.imwrite(str(path), grid, [cv2.IMWRITE_JPEG_QUALITY, 88])
        print(f"wrote {path}  ({min(per_sheet, len(rows) - s)} photos)")


if __name__ == "__main__":
    main()
