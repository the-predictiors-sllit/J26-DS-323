r"""fix_shapes.py - bring odd-shaped straightened photos back to the shape of the rest of their site.

    python src\fix_shapes.py --csv data\panel_dataset_clean.csv                  # DRY RUN: shows what it would do, writes nothing
    python src\fix_shapes.py --csv data\panel_dataset_clean.csv --threshold 0.25 # only the worst photos (25% or more off)
    python src\fix_shapes.py --csv data\panel_dataset_clean.csv --write          # do it (originals are backed up first)
    python src\fix_shapes.py --csv data\panel_dataset_clean.csv --stretch-only   # only resize to the site's shape: never trim
    python src\fix_shapes.py --csv ... --only IMG_3066 IMG_3070                   # just these photos
    python src\fix_shapes.py --csv ... --skip IMG_3090                            # everything except these

For every photo whose shape is off by --threshold (default 15%) from the median of its site:
  1. TRIM: find the blue cell area and cut away everything around it (frame, roof, background, a neighbour).
     The cells are not changed, only the space around them.
  2. STRETCH, only if the trimmed photo is still more than 8% off the site's shape: the panel is complete and
     tight, so its true shape is the site's shape, and the photo is resized to it. This repairs panels that
     were stretched by the perspective step.
If the panel cannot be found (for example a very dusty panel whose blue is hidden) the photo is left alone
and listed as "check by hand".

--stretch-only is for photos that are tight and complete but stretched (no extra space around the panel): it
skips the search for the panel and only resizes each photo to the shape of its site, so it also works for
photos where the panel cannot be found. The resize only SHRINKS one side (it never enlarges the other),
so no detail is invented.

Every run writes before/after thumbnails to results\shape_fix_preview_N.jpg. Look at them BEFORE using --write.
--write copies each original to data\cropped_backup\ (never overwriting an existing backup) and then saves the
fixed photo (JPEG quality 92) under its original name, so nothing else has to change.
The previews show private property: results\*.jpg and data\cropped_backup\ are git-ignored. Do not share them.
"""
import argparse
import shutil
from pathlib import Path

import cv2
import numpy as np
import pandas as pd
from PIL import Image

STRETCH_TOLERANCE = 0.08   # after trimming, stretch only if still this far from the site's shape
MARGIN = 0.01              # keep 1% of the panel size around the cells
TILE_W, TILE_H, LABEL_H = 175, 300, 44


def measured_shape(path):
    """Height / width as OpenCV (and so the training) will see the photo, including the phone's rotation tag."""
    with Image.open(path) as im:
        w, h = im.size
        if im.getexif().get(0x0112, 1) in (5, 6, 7, 8):
            w, h = h, w
    return h / w


def find_panel_box(small_bgr):
    """(x0, y0, x1, y1) in pixels of the blue cell area of a (small) photo, or None if it cannot be found."""
    h, w = small_bgr.shape[:2]
    hsv = cv2.cvtColor(small_bgr, cv2.COLOR_BGR2HSV)
    mask = cv2.inRange(hsv, (95, 60, 30), (135, 255, 255))                # strongly blue: the solar cells
    k = max(5, (int(0.012 * w) // 2) * 2 + 1)                              # close the thin white lines between cells
    closed = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (k, k)))
    n, _, stats, _ = cv2.connectedComponentsWithStats(closed, connectivity=8)
    if n <= 1:
        return None
    i = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))                    # the biggest blue block is the panel
    x, y, bw, bh, area = (int(v) for v in stats[i])
    if area < 0.55 * bw * bh or bw * bh < 0.25 * w * h:                    # a patch that does not fill its box is not a panel
        return None
    return x, y, x + bw, y + bh


def plan_photo(path, site_median, stretch_only=False):
    """Decide what to do with one photo, working on a small copy. Returns a dict (fractions of the photo)."""
    small = cv2.imread(str(path), cv2.IMREAD_REDUCED_COLOR_8)
    before = small.shape[0] / small.shape[1]
    if stretch_only:
        return {"action": "stretched to the site's shape (no trimming)", "before": before, "after": site_median,
                "box": (0.0, 0.0, 1.0, 1.0), "stretch": True}
    box = find_panel_box(small)
    if box is None:
        return {"action": "check by hand (panel not found)", "before": before, "after": before, "box": None, "stretch": False}
    hs, ws = small.shape[:2]
    x0, y0, x1, y1 = box
    mx, my = max(2, int(MARGIN * (x1 - x0))), max(2, int(MARGIN * (y1 - y0)))
    x0, y0, x1, y1 = max(0, x0 - mx), max(0, y0 - my), min(ws, x1 + mx), min(hs, y1 + my)
    trimmed = (y1 - y0) / (x1 - x0)
    stretch = abs(trimmed / site_median - 1) > STRETCH_TOLERANCE
    trimmed_something = (x1 - x0) < 0.97 * ws or (y1 - y0) < 0.97 * hs
    action = ("trimmed and stretched to the site's shape" if stretch and trimmed_something
              else "stretched to the site's shape" if stretch
              else "trimmed" if trimmed_something else "no change needed")
    return {"action": action, "before": before, "after": site_median if stretch else trimmed,
            "box": (x0 / ws, y0 / hs, x1 / ws, y1 / hs), "stretch": stretch}


def apply_plan(img, plan, site_median):
    """Apply a plan to an image of any size (a small preview copy or the full photo)."""
    if plan["box"] is None:
        return img
    h, w = img.shape[:2]
    fx0, fy0, fx1, fy1 = plan["box"]
    out = img[int(round(fy0 * h)):int(round(fy1 * h)), int(round(fx0 * w)):int(round(fx1 * w))]
    if plan["stretch"]:
        oh, ow = out.shape[:2]
        new_w = min(ow, int(round(oh / site_median)))      # shrink the side that is too long; never enlarge the other
        new_h = int(round(new_w * site_median))
        out = cv2.resize(out, (new_w, new_h), interpolation=cv2.INTER_AREA)
    return out


def fit_tile(img, label_lines, colour):
    tile = np.full((TILE_H + LABEL_H, TILE_W, 3), 40, np.uint8)
    scale = min((TILE_W - 8) / img.shape[1], (TILE_H - 8) / img.shape[0])
    small = cv2.resize(img, (max(1, int(img.shape[1] * scale)), max(1, int(img.shape[0] * scale))), interpolation=cv2.INTER_AREA)
    y0, x0 = (TILE_H - small.shape[0]) // 2, (TILE_W - small.shape[1]) // 2
    tile[y0:y0 + small.shape[0], x0:x0 + small.shape[1]] = small
    cv2.rectangle(tile, (0, 0), (TILE_W - 1, TILE_H - 1), colour, 2)
    for k, line in enumerate(label_lines):
        cv2.putText(tile, line, (5, TILE_H + 14 + 13 * k), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255) if k == 0 else colour, 1, cv2.LINE_AA)
    return tile


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", default="data/panel_dataset_clean.csv", help="needs Photo_Filename, Image_Path, Site_ID")
    ap.add_argument("--threshold", type=float, default=0.15, help="handle photos whose shape is off by at least this fraction")
    ap.add_argument("--write", action="store_true", help="really change the photos (originals are backed up first)")
    ap.add_argument("--stretch-only", action="store_true", help="never trim: only resize each photo to the shape of its site")
    ap.add_argument("--only", nargs="*", default=None, metavar="NAME", help="handle only these photos, e.g. IMG_3066 IMG_3070")
    ap.add_argument("--skip", nargs="*", default=None, metavar="NAME", help="leave these photos alone")
    ap.add_argument("--backup-dir", default="data/cropped_backup")
    ap.add_argument("--out-dir", default="results")
    ap.add_argument("--pairs-per-row", type=int, default=4)
    ap.add_argument("--rows", type=int, default=2)
    args = ap.parse_args()

    df = pd.read_csv(args.csv)
    df["aspect"] = [measured_shape(p) for p in df.Image_Path]
    df["site_median"] = df.groupby("Site_ID").aspect.transform("median")
    df["dev"] = df.aspect / df.site_median - 1
    todo = df[df.dev.abs() >= args.threshold].copy()
    if args.only:
        todo = todo[todo.Photo_Filename.isin(args.only)]
        missing = sorted(set(args.only) - set(todo.Photo_Filename))
        if missing:
            print(f"not selected (not found, or less than {args.threshold:.0%} off): {missing}")
    if args.skip:
        todo = todo[~todo.Photo_Filename.isin(args.skip)]
    todo = todo.reindex(todo.dev.abs().sort_values(ascending=False).index)
    print(f"{len(todo)} of {len(df)} photos selected ({args.threshold:.0%} or more off the shape of their site"
          f"{'; stretch only, no trimming' if args.stretch_only else ''}) - "
          f"{'WRITING changes' if args.write else 'DRY RUN: nothing is written'}\n")
    if todo.empty:
        return

    results, pairs = [], []
    for row in todo.itertuples():
        plan = plan_photo(row.Image_Path, row.site_median, args.stretch_only)
        small = cv2.imread(row.Image_Path, cv2.IMREAD_REDUCED_COLOR_8)
        after_small = apply_plan(small, plan, row.site_median)
        ok = plan["box"] is not None and plan["action"] != "no change needed"
        colour = (80, 200, 80) if ok else (60, 60, 230)
        pairs.append(np.hstack([
            fit_tile(small, [row.Photo_Filename, f"BEFORE {row.aspect:.2f} ({row.dev:+.0%})", str(row.Site_ID).replace("CRN ", "site ")], (110, 110, 110)),
            fit_tile(after_small, [plan["action"][:30], f"AFTER {after_small.shape[0] / after_small.shape[1]:.2f}", f"site shape {row.site_median:.2f}"], colour)]))
        results.append({"Photo": row.Photo_Filename, "Site": row.Site_ID, "before": round(row.aspect, 2),
                        "after": round(after_small.shape[0] / after_small.shape[1], 2), "site_shape": round(row.site_median, 2),
                        "action": plan["action"]})
        if args.write and plan["box"] is not None and plan["action"] != "no change needed":
            src = Path(row.Image_Path)
            backup = Path(args.backup_dir) / src.name
            backup.parent.mkdir(parents=True, exist_ok=True)
            if not backup.exists():
                shutil.copy2(src, backup)
            full = cv2.imread(str(src))
            cv2.imwrite(str(src), apply_plan(full, plan, row.site_median), [cv2.IMWRITE_JPEG_QUALITY, 92])

    res = pd.DataFrame(results)
    pd.set_option("display.width", 200)
    print(res.to_string(index=False))
    print("\nsummary:", res.action.value_counts().to_dict())

    Path(args.out_dir).mkdir(exist_ok=True)
    per_sheet = args.pairs_per_row * args.rows
    for s in range(0, len(pairs), per_sheet):
        chunk = pairs[s:s + per_sheet]
        while len(chunk) % args.pairs_per_row:
            chunk.append(np.zeros_like(chunk[0]))
        grid = np.vstack([np.hstack(chunk[i:i + args.pairs_per_row]) for i in range(0, len(chunk), args.pairs_per_row)])
        path = Path(args.out_dir) / f"shape_fix_preview_{s // per_sheet + 1}.jpg"
        cv2.imwrite(str(path), grid, [cv2.IMWRITE_JPEG_QUALITY, 88])
        print(f"wrote {path}")
    res.to_csv(Path(args.out_dir) / "shape_fix_log.csv", index=False)
    if args.write:
        n = int(((res.action != "no change needed") & (~res.action.str.startswith("check"))).sum())
        print(f"\nchanged {n} photos. Originals are in {args.backup_dir}. Next: python src\\check_precropped.py --csv {args.csv}")
    else:
        print("\nNothing was changed. Look at the preview sheet(s); if they look right, run again with --write.")


if __name__ == "__main__":
    main()
