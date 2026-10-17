from pathlib import Path
import cv2, numpy as np
from PIL import Image, ImageDraw
import json

cv2.setNumThreads(4)
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
for k, p in enumerate(sorted((root / "originals").glob("*.jpeg")), 1):
    im = cv2.imread(str(p))
    small = cv2.resize(im, (768, 768), interpolation=cv2.INTER_AREA)
    mp = root / "masks" / f"{p.stem}.png"
    m = cv2.resize(cv2.imread(str(mp), 0), (768, 768), interpolation=cv2.INTER_NEAREST)
    # Sky is foreground for GrabCut. Eroded seeds leave boundary pixels editable by graph cut.
    sky = (m < 128).astype("uint8")
    obs = 1 - sky
    se = cv2.erode(sky, np.ones((31, 31), np.uint8))
    oe = cv2.erode(obs, np.ones((31, 31), np.uint8))
    gm = np.where(sky, cv2.GC_PR_FGD, cv2.GC_PR_BGD).astype("uint8")
    # Interior color errors must not become fixed non-sky seeds: constrain obstacle seeds to outer region.
    yy, xx = np.indices((768, 768))
    rad = np.sqrt((xx - 383.5) ** 2 + (yy - 383.5) ** 2) / 768
    gm[(oe > 0) & (rad > 0.38)] = cv2.GC_BGD
    gm[se > 0] = cv2.GC_FGD
    cv2.grabCut(
        small, gm, None, np.zeros((1, 65)), np.zeros((1, 65)), 3, cv2.GC_INIT_WITH_MASK
    )
    out = np.where((gm == cv2.GC_FGD) | (gm == cv2.GC_PR_FGD), 0, 255).astype("uint8")
    full = cv2.resize(out, (2000, 2000), interpolation=cv2.INTER_NEAREST)
    Image.fromarray(full).save(mp)
    rgb = np.array(Image.open(p).convert("RGB"), dtype=np.float32)
    obs = full > 127
    rgb[obs] = rgb[obs] * 0.58 + np.array([255, 65, 50]) * 0.42
    Image.fromarray(rgb.astype("uint8")).resize((1000, 1000)).save(
        root / "overlays" / f"{p.stem}.jpg", quality=88
    )
    print("refined", k, flush=True)
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
