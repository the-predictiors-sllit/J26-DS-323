"""sync_to_backend.py - copy the files the Backend needs from this experiment into the panelhealth feature.

Run it from experiments/lakhitha/PanelScan whenever you change any of the shared files:
    python src/sync_to_backend.py                 copy the shared files
    python src/sync_to_backend.py --check         only compare (exit code 1 if any copy is out of date)
    python src/sync_to_backend.py --with-model    also copy checkpoints/panelscan.pt to the Backend

The shared files are written to  Application/Backend/app/features/panelhealth/ml/  and the model to
Application/Backend/app/features/panelhealth/models/panelscan.pt  (the repo's .gitignore should skip *.pt).
The experiment is the single source of truth: edit the files HERE, never the copies in the Backend.
"""
import argparse
import shutil
import sys
from pathlib import Path

SHARED = ["advice.py", "consistency.py", "corners.py", "dataset.py", "gradcam_utils.py",
          "inference.py", "model.py", "preprocessing.py"]
FEATURE = Path("Application") / "Backend" / "app" / "features" / "panelhealth"


def find_repo_root(start):
    for parent in [start, *start.parents]:
        if (parent / FEATURE).is_dir():
            return parent
    return None


def same(a, b):
    return a.exists() and b.exists() and a.read_bytes() == b.read_bytes()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="only compare; do not copy")
    ap.add_argument("--with-model", action="store_true", help="also copy checkpoints/panelscan.pt")
    ap.add_argument("--repo-root", default=None, help="the folder that contains Application/ (found automatically)")
    args = ap.parse_args()

    src_dir = Path(__file__).resolve().parent
    experiment = src_dir.parent
    root = Path(args.repo_root).resolve() if args.repo_root else find_repo_root(src_dir)
    if root is None or not (root / FEATURE).is_dir():
        sys.exit(f"Could not find {FEATURE} above {src_dir}. Pass --repo-root <the J26-DS-323 folder>.")

    ml_dir = root / FEATURE / "ml"
    models_dir = root / FEATURE / "models"
    out_of_date = []
    for name in SHARED:
        a, b = src_dir / name, ml_dir / name
        if not a.exists():
            sys.exit(f"{a} is missing.")
        if same(a, b):
            print(f"  up to date   {name}")
            continue
        out_of_date.append(name)
        if args.check:
            print(f"  OUT OF DATE  {name}")
        else:
            ml_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(a, b)
            print(f"  copied       {name}")
    if not args.check:
        init = ml_dir / "__init__.py"
        if not init.exists():
            init.write_text('"""Model code copied from experiments/ by sync_to_backend.py. Do not edit here."""\n')
            print("  created      __init__.py")

    if args.with_model:
        ckpt = experiment / "checkpoints" / "panelscan.pt"
        if not ckpt.exists():
            sys.exit(f"{ckpt} not found. Train it first with train_final.py.")
        if args.check:
            print(f"  model {'up to date' if same(ckpt, models_dir / 'panelscan.pt') else 'OUT OF DATE'}")
            if not same(ckpt, models_dir / "panelscan.pt"):
                out_of_date.append("panelscan.pt")
        else:
            models_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ckpt, models_dir / "panelscan.pt")
            print(f"  copied       panelscan.pt ({ckpt.stat().st_size / 1e6:.0f} MB)")

    if args.check:
        if out_of_date:
            print(f"\n{len(out_of_date)} file(s) out of date. Run: python src/sync_to_backend.py")
            sys.exit(1)
        print("\neverything is in sync.")


if __name__ == "__main__":
    main()
