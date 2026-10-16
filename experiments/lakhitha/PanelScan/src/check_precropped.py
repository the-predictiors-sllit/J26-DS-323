"""check_precropped.py - check your hand-straightened panel photos before training.

    python src/check_precropped.py --csv data/panel_dataset_clean.csv
or, without the CSV:
    python src/check_precropped.py --folder data/cropped

It reads only the file headers, so it is fast. It reports:
  * pixels and megabytes per photo (the model shrinks every photo to a few hundred pixels,
    so big files cost disk space and loading time, not accuracy)
  * the shape of each panel (height / width) and the median to use as PANEL_ASPECT
  * photos whose shape is unlike the other photos of the same site. Photos of one site show the
    same panel model, so a different shape usually means a slip in the manual crop (a panel
    cut short, a sliver too much frame, or a photo saved sideways).
"""
import argparse
import os
from pathlib import Path

import pandas as pd
from PIL import Image

EXTENSIONS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}


def inspect(path):
    with Image.open(path) as im:                 # opens the header only, not the pixels
        w, h = im.size
        fmt = im.format
    return {"path": str(path), "width": w, "height": h, "megabytes": os.path.getsize(path) / 1e6,
            "aspect": h / w, "format": fmt}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default=None, help="the clean CSV (needs Photo_Filename, Image_Path, Site_ID)")
    ap.add_argument("--folder", default=None, help="or just a folder of photos")
    ap.add_argument("--tolerance", type=float, default=0.08,
                    help="flag photos whose shape differs from their site's median by more than this fraction")
    args = ap.parse_args()
    if not args.csv and not args.folder:
        raise SystemExit("give --csv or --folder")

    if args.csv:
        df = pd.read_csv(args.csv)
        rows = [{**inspect(r.Image_Path), "name": r.Photo_Filename, "site": r.Site_ID} for r in df.itertuples()]
    else:
        files = sorted(p for p in Path(args.folder).rglob("*") if p.suffix.lower() in EXTENSIONS)
        rows = [{**inspect(p), "name": p.stem, "site": "(all)"} for p in files]
    d = pd.DataFrame(rows)
    if d.empty:
        raise SystemExit("no photos found")

    pd.set_option("display.width", 200)
    q = lambda col: [round(float(v), 2) for v in (d[col].min(), d[col].median(), d[col].max())]
    print(f"{len(d)} photos, {d.megabytes.sum() / 1000:.2f} GB in total")
    print(f"  width  px  min / median / max : {q('width')}")
    print(f"  height px  min / median / max : {q('height')}")
    print(f"  size   MB  min / median / max : {q('megabytes')}")
    print(f"  height/width  min / median / max : {q('aspect')}")
    print(f"  file types: {d.format.value_counts().to_dict()}")
    median_aspect = float(d.aspect.median())
    print(f"\nPANEL_ASPECT in src/preprocessing.py is the shape every panel is resized to. "
          f"Your median is {median_aspect:.2f}; set PANEL_ASPECT = {round(median_aspect, 2)} if it differs from the current value.")

    problems = []
    for r in d.itertuples():
        notes = []
        if r.aspect < 1.0:
            notes.append("wider than tall: saved sideways?")
        if r.width < 600:
            notes.append(f"only {r.width}px wide: small marks will be lost")
        if r.format not in ("JPEG",):
            notes.append(f"{r.format} file: fine, but large")
        if r.megabytes > 8:
            notes.append(f"{r.megabytes:.1f} MB: re-saving as JPEG quality 92-95 would shrink it a lot")
        site_median = d[d.site == r.site].aspect.median()
        n_site = (d.site == r.site).sum()
        if n_site >= 3 and abs(r.aspect / site_median - 1) > args.tolerance:
            notes.append(f"shape {r.aspect:.2f} vs {site_median:.2f} for the rest of site {r.site}")
        if notes:
            problems.append((r.name, r.site, "; ".join(notes)))

    shape_issues = [p for p in problems if "shape" in p[2] or "sideways" in p[2]]
    print(f"\n{len(shape_issues)} photo(s) with an unusual shape (worth a look):")
    for name, site, note in shape_issues:
        print(f"  {name}  ({site}): {note}")
    other = [p for p in problems if p not in shape_issues]
    print(f"\n{len(other)} photo(s) with size notes (not a problem for training):")
    for name, site, note in other[:15]:
        print(f"  {name}: {note}")
    if len(other) > 15:
        print(f"  ... and {len(other) - 15} more")


if __name__ == "__main__":
    main()
