from pathlib import Path
import zipfile, io, json
import numpy as np
from PIL import Image, ImageDraw
from scipy.ndimage import gaussian_filter, uniform_filter
from sklearn.ensemble import ExtraTreesClassifier
from threadpoolctl import threadpool_limits

threadpool_limits(4)
rng = np.random.default_rng(42)


def features(im):
    a = np.asarray(im, dtype=np.float32) / 255
    R, G, B = a.transpose(2, 0, 1)
    bright = a.mean(2)
    mx = a.max(2)
    mn = a.min(2)
    fs = [R, G, B, mx, mn, mx - mn, B - R, B - G, G - R, B / (a.sum(2) + 1e-4)]
    for scale in [2, 7, 20]:
        for ch in [R, G, B]:
            fs.append(gaussian_filter(ch, scale))
        mean = uniform_filter(bright, 2 * scale + 1)
        fs.append(
            np.sqrt(
                np.maximum(
                    0, uniform_filter(bright * bright, 2 * scale + 1) - mean * mean
                )
            )
        )
    return np.stack(fs, axis=-1).reshape(-1, len(fs))


import argparse

parser = argparse.ArgumentParser(
    description="Generate NEW annotation drafts, not ground truth."
)
parser.add_argument(
    "--cnn", type=Path, required=True, help="Original reference CNN.zip"
)
parser.add_argument(
    "--originals",
    type=Path,
    required=True,
    help="Folder containing the 17 original JPEGs",
)
parser.add_argument(
    "--out", type=Path, required=True, help="New, empty generation workspace"
)
args = parser.parse_args()
if not args.originals.is_dir() or not list(args.originals.glob("*.jpeg")):
    parser.error("Originals folder must contain .jpeg files.")
if args.out.exists() and any(args.out.iterdir()):
    parser.error("Choose an empty output folder to preserve existing masks.")
X = []
Y = []
with zipfile.ZipFile(args.cnn) as z:
    names = z.namelist()
    imgs = [n for n in names if "/Images/train/" in n and not n.endswith("/")]
    masks = {
        Path(n).stem: n for n in names if "/Masks/train/" in n and not n.endswith("/")
    }
    for n in imgs:
        im = Image.open(io.BytesIO(z.read(n))).convert("RGB").resize((512, 512))
        mask = np.asarray(
            Image.open(io.BytesIO(z.read(masks[Path(n).stem])))
            .convert("L")
            .resize((512, 512), Image.Resampling.NEAREST)
        )
        yy, xx = np.indices((512, 512))
        valid = ((xx - 255.5) ** 2 + (yy - 255.5) ** 2 < 249**2).ravel()
        inds = rng.choice(np.flatnonzero(valid), 1800, replace=False)
        X.append(features(im)[inds])
        Y.append((mask.ravel()[inds] > 127).astype("uint8"))
clf = ExtraTreesClassifier(
    n_estimators=48,
    max_depth=18,
    min_samples_leaf=5,
    n_jobs=4,
    random_state=42,
    class_weight="balanced",
)
clf.fit(np.concatenate(X), np.concatenate(Y))
print("Draft classifier trained on CNN training split only", flush=True)
root = args.out
for d in ["masks", "overlays", "uncertain", "originals"]:
    (root / d).mkdir(parents=True, exist_ok=True)
rows = []
for k, p in enumerate(sorted(args.originals.glob("*.jpeg"))):
    im = Image.open(p).convert("RGB")
    small = im.resize((768, 768), Image.Resampling.LANCZOS)
    proba = clf.predict_proba(features(small))[:, 1].reshape(768, 768)
    # Classification is an annotation draft, not geometric calibration.
    m = Image.fromarray(((proba >= 0.5) * 255).astype("uint8")).resize(
        im.size, Image.Resampling.NEAREST
    )
    u = Image.fromarray(
        (((proba > 0.25) & (proba < 0.75)) * 255).astype("uint8")
    ).resize(im.size, Image.Resampling.NEAREST)
    m.save(root / "masks" / f"{p.stem}.png")
    u.save(root / "uncertain" / f"{p.stem}.png")
    (root / "originals" / p.name).write_bytes(p.read_bytes())
    a = np.array(im, dtype=np.float32)
    obs = np.array(m) > 127
    a[obs] = a[obs] * 0.58 + np.array([255, 65, 50]) * 0.42
    Image.fromarray(a.astype("uint8")).resize((1000, 1000)).save(
        root / "overlays" / f"{p.stem}.jpg", quality=88
    )
    rows.append(
        {
            "file": p.name,
            "mask": p.stem + ".png",
            "status": "UNREVIEWED_AUTOMATIC_DRAFT",
            "uncertain_percent": round(float((np.array(u) > 0).mean() * 100), 1),
        }
    )
    print(k + 1, p.name, rows[-1]["uncertain_percent"], flush=True)
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
