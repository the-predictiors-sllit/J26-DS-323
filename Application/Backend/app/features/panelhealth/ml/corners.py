"""corners.py - the panel-corner file and a sanity check for it. Needs only pandas and numpy.

Corners are stored as FRACTIONS of the photo (x / width, y / height), not pixels, so the
file stays correct even if a photo is later saved at a different size.
Order of the four points: top-left, top-right, bottom-right, bottom-left.
"""
import numpy as np
import pandas as pd
from pathlib import Path

COLS = ["x1", "y1", "x2", "y2", "x3", "y3", "x4", "y4"]


def read_corners(path):
    """Return {Photo_Filename: [x1, y1, ..., x4, y4]} (empty if the file does not exist yet)."""
    if not path or not Path(path).exists():
        return {}
    df = pd.read_csv(path)
    return {r.Photo_Filename: [float(r[c]) for c in COLS] for _, r in df.iterrows()}


def write_corners(path, corners):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    rows = [{"Photo_Filename": name, **dict(zip(COLS, vals))} for name, vals in sorted(corners.items())]
    pd.DataFrame(rows, columns=["Photo_Filename"] + COLS).round(5).to_csv(path, index=False)


def check_quad(norm_corners, width, height):
    """List what looks wrong with one set of corners (an empty list means it looks fine)."""
    p = np.asarray(norm_corners, dtype=float).reshape(4, 2) * [width, height]
    problems = []
    # the four corners must turn the same way round (a convex, non-twisted shape)
    cross = []
    for i in range(4):
        a, b, c = p[i], p[(i + 1) % 4], p[(i + 2) % 4]
        cross.append((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]))
    if not (all(v > 0 for v in cross) or all(v < 0 for v in cross)):
        problems.append("corners are not in order or the shape is twisted")
    area = 0.5 * abs(sum(p[i][0] * p[(i + 1) % 4][1] - p[(i + 1) % 4][0] * p[i][1] for i in range(4)))
    if area < 0.15 * width * height:
        problems.append(f"panel covers only {area / (width * height):.0%} of the photo")
    top, bottom = np.linalg.norm(p[1] - p[0]), np.linalg.norm(p[2] - p[3])
    left, right = np.linalg.norm(p[3] - p[0]), np.linalg.norm(p[2] - p[1])
    aspect = ((top + bottom) / 2) / max(1e-6, (left + right) / 2)   # width / height of the panel
    if not 0.4 <= aspect <= 0.9:
        problems.append(f"width/height is {aspect:.2f} (a 60-cell panel is about 0.6): wrong corner or rotated?")
    return problems
