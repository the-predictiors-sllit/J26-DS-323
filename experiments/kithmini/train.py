"""Train on 80 pairs; select on 21 validation pairs; evaluate test only by explicit command."""

import argparse, csv, json, random, hashlib, platform, time
from pathlib import Path
import numpy as np
from PIL import Image
import torch
from torch.utils.data import Dataset, DataLoader
from torchvision import transforms
from model import build_model, tensor_image

EXT = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}


class SkyDataset(Dataset):
    def __init__(self, root, split, size=512, augment=False):
        self.root = Path(root)
        self.size = size
        self.augment = augment
        self.jitter = transforms.ColorJitter(
            brightness=0.2, contrast=0.2, saturation=0.15, hue=0.02
        )
        image_dir = self.root / "Images" / split
        mask_dir = self.root / "Masks" / split
        if not image_dir.is_dir():
            raise ValueError(f"Missing folder: {image_dir}")

        if not mask_dir.is_dir():
            raise ValueError(f"Missing folder: {mask_dir}")

        def mapping(folder):
            result = {}
            for p in sorted(folder.iterdir()):
                if p.suffix.lower() in EXT:
                    if p.stem in result:
                        raise ValueError(f"Duplicate basename {p.stem} in {folder}")
                    result[p.stem] = p
            return result

        ims = mapping(image_dir)
        masks = mapping(mask_dir)
        if ims.keys() != masks.keys():
            raise ValueError(f"Unpaired files in {split}")
        if not ims:
            raise ValueError(f"No image pairs in {split}")
        self.pairs = [(p, masks[k]) for k, p in ims.items()]
        y, x = np.mgrid[:size, :size]
        self.valid = (x - (size - 1) / 2) ** 2 + (y - (size - 1) / 2) ** 2 <= (
            size / 2
        ) ** 2

    def __len__(self):
        return len(self.pairs)

    def __getitem__(self, i):
        p, m = self.pairs[i]
        with Image.open(p) as raw:
            im = raw.convert("RGB")
        with Image.open(m) as raw:
            mask = raw.convert("L")
            msize = mask.size
            mask = mask.resize((self.size, self.size), Image.Resampling.NEAREST)
        if im.size != msize:
            raise ValueError(f"Image/mask size mismatch: {p.name}")
        if im.width != im.height:
            raise ValueError(
                "Training images must use the supplied square fisheye disk export."
            )
        if self.augment:
            im = self.jitter(im)
        lab = (np.asarray(mask) > 127).astype("int64")
        lab[~self.valid] = 255
        return tensor_image(im, self.size), torch.from_numpy(lab), p.name


def metrics(cm):
    cm = np.asarray(cm, dtype="float64")
    tp = np.diag(cm)
    union = cm.sum(0) + cm.sum(1) - tp
    iou = np.divide(tp, union, out=np.full(2, np.nan), where=union > 0)
    denom = cm.sum(0) + cm.sum(1)
    f1 = np.divide(2 * tp, denom, out=np.full(2, np.nan), where=denom > 0)
    return {
        "pixel_accuracy": float(tp.sum() / max(1, cm.sum())),
        "sky_iou": float(iou[0]),
        "obstacle_iou": float(iou[1]),
        "miou": float(np.nanmean(iou)),
        "macro_f1": float(np.nanmean(f1)),
    }


def update_cm(cm, labels, pred):
    valid = labels != 255
    counts = torch.bincount((labels[valid] * 2 + pred[valid]).flatten(), minlength=4)
    cm += counts.reshape(2, 2).cpu().numpy()


@torch.inference_mode()
def evaluate(model, loader, device, per_image=False):
    model.eval()
    cm = np.zeros((2, 2), dtype=np.int64)
    records = []
    for x, y, names in loader:
        x = x.to(device)
        y = y.to(device)
        p = model(x)["out"].argmax(1)
        update_cm(cm, y, p)
        if per_image:
            for j, name in enumerate(names):
                one = np.zeros((2, 2), dtype=np.int64)
                update_cm(one, y[j], p[j])
                records.append({"image": name, **metrics(one)})
    return metrics(cm), cm.tolist(), records


def freeze_bn(model):
    # Batch size 2 and the pooled ASPP branch make fixed pretrained BN stats useful.
    for layer in model.modules():
        if isinstance(layer, torch.nn.modules.batchnorm._BatchNorm):
            layer.eval()


def check_splits(root):
    groups = {}
    report = {}
    for split in ["train", "val", "test"]:
        ds = SkyDataset(root, split, 64)
        report[split] = len(ds)
        for p, _ in ds.pairs:
            with Image.open(p) as im:
                digest = hashlib.sha256(im.convert("RGB").tobytes()).hexdigest()
            if digest in groups and groups[digest] != split:
                raise ValueError("Exact image duplicate across splits: " + p.name)
            groups[digest] = split
    return report


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--out", default="outputs")
    ap.add_argument("--epochs", type=int, default=40)
    ap.add_argument("--size", type=int, default=512)
    ap.add_argument("--batch", type=int, default=2)
    ap.add_argument("--patience", type=int, default=8)
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--evaluate", action="store_true")
    ap.add_argument("--resume", action="store_true")
    args = ap.parse_args()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    random.seed(42)
    np.random.seed(42)
    torch.manual_seed(42)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print("Device:", device, flush=True)
    if device == "cpu":
        print("CPU full training may be slow. Use Colab GPU.", flush=True)
    if args.evaluate:
        from model import load_model

        model, ck = load_model(out / "best_model.pt", device)
        ds = SkyDataset(args.data, "test", ck["size"])
        dl = DataLoader(ds, batch_size=args.batch, num_workers=args.workers)
        scores, cm, rows = evaluate(model, dl, device, True)
        payload = {
            "checkpoint_epoch": ck["epoch"],
            "checkpoint_validation_miou": ck["validation"]["miou"],
            "test_metrics": scores,
            "confusion_matrix_true_rows_pred_columns": cm,
            "class_order": ["sky", "obstacle"],
            "evaluation_resolution": ck["size"],
            "valid_region": "inscribed circular disk only",
            "per_image": rows,
        }
        (out / "test_metrics.json").write_text(json.dumps(payload, indent=2))
        print(json.dumps(scores, indent=2))
        return
    if (out / "last_model.pt").exists() and not args.resume:
        raise ValueError(
            "Output already has a run. Use --resume or a new --out directory."
        )
    report = check_splits(args.data)
    print("Paired images:", report, flush=True)
    config = {
        **vars(args),
        "splits": report,
        "seed": 42,
        "device": device,
        "torch": str(torch.__version__),
        "python": platform.python_version(),
        "labels": {"sky": 0, "obstacle": 1, "ignored_outside_disk": 255},
        "augmentation": "training-only colour jitter; no rotation or cropping",
        "initialization": "torchvision pretrained DeepLabV3 + new binary heads",
        "selection": "highest validation mean of two class IoUs; no test-driven tuning",
        "resolution_note": "metrics at chosen training resolution, not original boundary resolution",
    }
    (out / "config.json").write_text(json.dumps(config, indent=2))
    train = SkyDataset(args.data, "train", args.size, True)
    val = SkyDataset(args.data, "val", args.size)
    tr = DataLoader(
        train,
        batch_size=args.batch,
        shuffle=True,
        num_workers=args.workers,
        pin_memory=device == "cuda",
    )
    va = DataLoader(val, batch_size=args.batch, num_workers=args.workers)
    model = build_model(pretrained=not args.resume).to(device)
    opt = torch.optim.AdamW(
        [
            {"params": model.backbone.parameters(), "lr": 1e-5},
            {"params": model.classifier.parameters(), "lr": 1e-4},
            {"params": model.aux_classifier.parameters(), "lr": 1e-4},
        ],
        weight_decay=1e-4,
    )
    scaler = torch.amp.GradScaler("cuda", enabled=device == "cuda")
    loss_fn = torch.nn.CrossEntropyLoss(ignore_index=255)
    best = -1.0
    bad = 0
    start = 1
    history = []
    if args.resume:
        ck = torch.load(out / "last_model.pt", map_location=device, weights_only=True)
        if ck["size"] != args.size:
            raise ValueError("Resume size must match previous run.")
        model.load_state_dict(ck["state_dict"])
        opt.load_state_dict(ck["optimizer"])
        scaler.load_state_dict(ck["scaler"])
        best = ck["best"]
        bad = ck["bad"]
        start = ck["epoch"] + 1
        if (out / "history.json").exists():
            history = json.loads((out / "history.json").read_text())
    for epoch in range(start, args.epochs + 1):
        begin = time.time()
        model.train()
        freeze_bn(model)
        total = 0.0
        for x, y, _ in tr:
            x = x.to(device)
            y = y.to(device)
            opt.zero_grad(set_to_none=True)
            with torch.autocast(
                device_type=device, dtype=torch.float16, enabled=device == "cuda"
            ):
                pred = model(x)
                loss = loss_fn(pred["out"], y) + 0.4 * loss_fn(pred["aux"], y)
            if not torch.isfinite(loss):
                raise RuntimeError("Non-finite loss; stop and inspect inputs.")
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
            total += float(loss.detach()) * len(x)
        scores, _, _ = evaluate(model, va, device)
        row = {
            "epoch": epoch,
            "train_loss": total / len(train),
            **scores,
            "seconds": round(time.time() - begin, 2),
        }
        history.append(row)
        ck = {
            "architecture": "deeplabv3_resnet50_binary_v1",
            "classes": ["sky", "obstacle"],
            "state_dict": model.state_dict(),
            "size": args.size,
            "epoch": epoch,
            "validation": scores,
            "normalization": "ImageNet mean/std",
            "training_pairs": len(train),
        }
        if scores["miou"] > best:
            best = scores["miou"]
            bad = 0
            torch.save(ck, out / "best_model.pt")
        else:
            bad += 1
        torch.save(
            {
                **ck,
                "optimizer": opt.state_dict(),
                "scaler": scaler.state_dict(),
                "best": best,
                "bad": bad,
            },
            out / "last_model.pt",
        )
        (out / "history.json").write_text(json.dumps(history, indent=2))
        with (out / "history.csv").open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(row))
            w.writeheader()
            w.writerows(history)
        print(json.dumps(row), flush=True)
        if bad >= args.patience:
            print("Early stop based on validation mIoU.", flush=True)
            break
    print(
        "Best checkpoint saved. Freeze choices, then run --evaluate once.", flush=True
    )


if __name__ == "__main__":
    main()
