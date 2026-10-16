"""preprocessing.py - load a photo, optionally cut out the panel, even out the lighting (CLAHE) and resize.

Without corners the whole photo is squashed to a square (the first version).
With corners the panel is cut out and straightened into an upright rectangle that is
PANEL_ASPECT times taller than wide, so neighbouring panels and the roof disappear.
"""
import cv2
import numpy as np

PANEL_ASPECT = 1.8   # height / width of a cropped panel image. Set it to the median of your own straightened
                     # panels (python src/check_precropped.py prints it); training and the app both follow it.
MAX_WARP_WIDTH = 2000   # the cut-out is first made at about the photo's own resolution, but never wider than this


def warp_to_panel(img, corners_px, out_w, out_h):
    """Straighten the panel into an upright out_w x out_h rectangle.

    corners_px: four (x, y) points in PIXELS of img, ordered top-left, top-right,
    bottom-right, bottom-left. A perspective transform removes the slant of the photo.
    """
    src = np.asarray(corners_px, dtype=np.float32).reshape(4, 2)
    dst = np.array([[0, 0], [out_w - 1, 0], [out_w - 1, out_h - 1], [0, out_h - 1]], dtype=np.float32)
    matrix = cv2.getPerspectiveTransform(src, dst)
    return cv2.warpPerspective(img, matrix, (out_w, out_h), flags=cv2.INTER_LINEAR)


def prepare_image(img_rgb, size=224, use_clahe=True, corners=None, precropped=False):
    """Turn an RGB photo that is already in memory into the array the model is trained on.

    This is the ONE place that defines the model's input, so training (load_image below) and
    the web server (api/panel_api.py) cannot drift apart. Any change here changes both.

    size     : the width of the result (and the height too, unless corners are given).
    use_clahe: even out the lighting on the lightness channel only (colours are not distorted).
    corners  : 8 numbers x1,y1,...,x4,y4 as FRACTIONS of the photo (see corners.py), or None.
    precropped: the photo is ALREADY cut out and straightened (for example by hand in an editor).
               It is then only resized to the same shape as a corner-cropped panel
               (size wide, size * PANEL_ASPECT tall), so training on hand-straightened photos
               and the app's tapped-corner crops give the model the same kind of input.
    """
    if corners is not None and precropped:
        raise ValueError("use either corners or precropped, not both")
    img = img_rgb
    h, w = img.shape[:2]

    if corners is not None:
        out_w, out_h = size, int(round(size * PANEL_ASPECT))
        pts = np.asarray(corners, dtype=np.float32).reshape(4, 2) * np.array([w, h], dtype=np.float32)
        # Cut the panel out at about the photo's own resolution, then let INTER_AREA average it down.
        # (Warping straight to a small size skips pixels, which blurs thin lines and small marks
        # differently from an ordinary resize of an already-straightened photo.)
        src_w = (np.linalg.norm(pts[1] - pts[0]) + np.linalg.norm(pts[2] - pts[3])) / 2
        mid_w = int(min(MAX_WARP_WIDTH, max(3 * out_w, round(float(src_w)))))
        img = warp_to_panel(img, pts, mid_w, int(round(mid_w * PANEL_ASPECT)))
    elif precropped:
        out_w, out_h = size, int(round(size * PANEL_ASPECT))
    else:
        out_w = out_h = size

    if use_clahe:
        lab = cv2.cvtColor(img, cv2.COLOR_RGB2LAB)
        l, a, b = cv2.split(lab)
        l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
        img = cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2RGB)
    return cv2.resize(img, (out_w, out_h), interpolation=cv2.INTER_AREA)


def load_image(path, size=224, use_clahe=True, corners=None, precropped=False):
    """Read one photo from disk and prepare it (see prepare_image)."""
    img = cv2.imread(str(path))  # OpenCV also applies the phone's rotation (EXIF) automatically
    if img is None:
        raise FileNotFoundError(f"Could not read image: {path}")
    return prepare_image(cv2.cvtColor(img, cv2.COLOR_BGR2RGB), size, use_clahe, corners, precropped)


def load_all(paths, size=224, use_clahe=True, corners=None, precropped=False):
    """Read every photo once and keep it in memory: {path: array}.

    corners is an optional {path: 8 numbers} dictionary (all photos or none); precropped=True
    means every photo is already a straightened panel.
    Phone photos are large, so doing this once is much faster than re-reading them on every
    epoch of every fold. Memory per photo: about 150 KB at 224 square, 600 KB at 448 square,
    and 1.6 times that when cropped to the panel.
    """
    cache = {}
    paths = list(paths)
    for i, p in enumerate(paths, 1):
        if p not in cache:
            cache[p] = load_image(p, size, use_clahe, None if corners is None else corners[p], precropped)
        if i % 25 == 0 or i == len(paths):
            print(f"  loaded {i}/{len(paths)} photos")
    return cache
