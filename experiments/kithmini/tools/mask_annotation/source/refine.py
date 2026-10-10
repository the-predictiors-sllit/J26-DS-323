from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np, json, shutil
import argparse

parser = argparse.ArgumentParser(
    description="Refine generated draft workspace; never reviewed ground truth."
)
parser.add_argument(
    "--workspace", type=Path, required=True, help="Output folder from make_drafts.py"
)
args = parser.parse_args()
root = args.workspace
if not (root / "originals").is_dir() or not (root / "masks").is_dir():
    parser.error("Expected generated originals/ and masks/ folders.")
# Conservative sky-interior polygons manually chosen by visual inspection.
# Coordinates are relative to image extent. No obstacle boundary tracing claimed.
polys = {
    1: [
        (0.34, 0.25),
        (0.61, 0.23),
        (0.74, 0.37),
        (0.74, 0.66),
        (0.57, 0.72),
        (0.40, 0.65),
        (0.26, 0.55),
    ],
    4: [
        (0.39, 0.27),
        (0.66, 0.22),
        (0.71, 0.4),
        (0.70, 0.65),
        (0.56, 0.74),
        (0.38, 0.63),
        (0.27, 0.46),
    ],
    5: [
        (0.30, 0.23),
        (0.48, 0.18),
        (0.67, 0.20),
        (0.79, 0.32),
        (0.83, 0.51),
        (0.76, 0.70),
        (0.61, 0.79),
        (0.42, 0.80),
        (0.27, 0.7),
        (0.18, 0.49),
        (0.20, 0.33),
    ],
    6: [
        (0.30, 0.27),
        (0.47, 0.21),
        (0.68, 0.24),
        (0.78, 0.37),
        (0.80, 0.59),
        (0.67, 0.74),
        (0.48, 0.80),
        (0.30, 0.73),
        (0.23, 0.56),
        (0.22, 0.4),
    ],
    7: [
        (0.46, 0.27),
        (0.55, 0.18),
        (0.69, 0.23),
        (0.78, 0.4),
        (0.79, 0.6),
        (0.69, 0.70),
        (0.65, 0.82),
        (0.48, 0.81),
        (0.39, 0.73),
        (0.33, 0.70),
        (0.40, 0.54),
        (0.39, 0.43),
    ],
    9: [
        (0.30, 0.38),
        (0.37, 0.23),
        (0.57, 0.19),
        (0.69, 0.35),
        (0.67, 0.56),
        (0.73, 0.65),
        (0.66, 0.8),
        (0.43, 0.8),
        (0.31, 0.67),
    ],
    10: [
        (0.35, 0.22),
        (0.59, 0.20),
        (0.75, 0.32),
        (0.77, 0.52),
        (0.66, 0.65),
        (0.48, 0.65),
        (0.34, 0.57),
        (0.23, 0.43),
    ],
    14: [
        (0.32, 0.27),
        (0.53, 0.22),
        (0.70, 0.26),
        (0.79, 0.4),
        (0.74, 0.64),
        (0.60, 0.76),
        (0.41, 0.71),
        (0.29, 0.56),
    ],
    15: [
        (0.36, 0.10),
        (0.56, 0.12),
        (0.75, 0.22),
        (0.88, 0.39),
        (0.87, 0.62),
        (0.76, 0.81),
        (0.59, 0.90),
        (0.36, 0.86),
        (0.19, 0.71),
        (0.12, 0.48),
        (0.17, 0.25),
    ],
    16: [
        (0.36, 0.17),
        (0.55, 0.16),
        (0.71, 0.26),
        (0.85, 0.39),
        (0.86, 0.60),
        (0.76, 0.79),
        (0.56, 0.87),
        (0.33, 0.83),
        (0.19, 0.69),
        (0.14, 0.47),
        (0.22, 0.29),
    ],
}
paths = sorted((root / "originals").glob("*.jpeg"))
if [p.name for p in paths] != [
    "IMG_20260813_155026_885.jpeg",
    "IMG_20260813_162948_500.jpeg",
    "IMG_20260813_165818_724.jpeg",
    "IMG_20260814_153927_299.jpeg",
    "IMG_20260814_163356_740.jpeg",
    "IMG_20260814_164841_565.jpeg",
    "IMG_20260814_174727_492.jpeg",
    "IMG_20260814_175734_824.jpeg",
    "IMG_20260814_182427_663.jpeg",
    "IMG_20260817_160025_278.jpeg",
    "IMG_20260817_163836_655.jpeg",
    "IMG_20260817_170302_430.jpeg",
    "IMG_20260817_170407_940.jpeg",
    "IMG_20260817_172505_968.jpeg",
    "IMG_20260817_174948_241.jpeg",
    "IMG_20260817_175324_085.jpeg",
    "IMG_20260817_180441_351.jpeg",
]:
    raise ValueError(
        "These historical patches are only for the original 17 photographs."
    )
for p in paths:
    with Image.open(p) as im:
        if im.size != (2000, 2000):
            raise ValueError(
                "Historical patches require the original 2000x2000 exports."
            )
for k, p in enumerate(paths, 1):
    im = Image.open(p).convert("RGB")
    mp = root / "masks" / f"{p.stem}.png"
    m = Image.open(mp).convert("L")
    d = ImageDraw.Draw(m)
    if k in polys:
        d.polygon([(int(x * 2000), int(y * 2000)) for x, y in polys[k]], fill=0)
    # Tiny lettering on the visibly occluding photographer/hand region is not sky.
    if k in [1, 2, 3, 4, 5, 7, 11, 12, 13, 17]:
        d.rectangle((810, 1820, 1220, 1920), fill=255)
    m.save(mp)
    a = np.array(im, dtype=np.float32)
    obs = np.array(m) > 127
    a[obs] = a[obs] * 0.58 + np.array([255, 65, 50]) * 0.42
    Image.fromarray(a.astype("uint8")).resize((1000, 1000)).save(
        root / "overlays" / f"{p.stem}.jpg", quality=88
    )
# The standalone editor is in the parent mask_annotation folder.
rows = json.loads((root / "manifest.json").read_text())
for k, row in enumerate(rows, 1):
    row["status"] = "DRAFT_REQUIRES_FULL_HUMAN_REVIEW"
    row["manual_sky_interior_patch"] = k in polys
    row["uncertainty_note"] = (
        "Uncertainty is from initial classifier, before manual patches; not calibrated accuracy."
    )
(root / "manifest.json").write_text(json.dumps(rows, indent=2))
sheet = Image.new("RGB", (1200, 6 * 225), "white")
d = ImageDraw.Draw(sheet)
for k, p in enumerate(sorted((root / "overlays").glob("*.jpg"))):
    x = k % 3 * 400
    y = k // 3 * 225
    im = Image.open(p)
    im.thumbnail((195, 195))
    sheet.paste(im, (x, y + 22))
    m = Image.open(root / "masks" / f"{p.stem}.png")
    m.thumbnail((195, 195))
    sheet.paste(m, (x + 200, y + 22))
    d.text((x, y + 3), f"{k+1:02d} " + p.stem, fill="black")
sheet.save(root / "preview.jpg", quality=90)
