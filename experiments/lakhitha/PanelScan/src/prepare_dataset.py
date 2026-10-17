"""
prepare_dataset.py - check the dataset CSV against the photo folder and write a clean CSV.

Run from the PanelScan folder:
    python src/prepare_dataset.py --csv data/panel_dataset_log_v3.csv --images data/raw --out data/panel_dataset_clean.csv

What it does
  1. drops blank rows and strips stray spaces ("CRN  45073" -> "CRN 45073")
  2. rejects filenames that are not exactly IMG_#### (e.g. "IMG_2821 or 18") and duplicate rows
  3. matches each row to a photo in --images (any extension, any upper/lower case)
  4. adds the columns the training code needs: Health_Score_0_100, Rated_Capacity_kW, Soiling_Target, Image_Path
  5. adds Tier_From_Score (severity bands 20/60/85) and keeps your typed column as Degradation_Category_Hand
"""
import argparse
import sys
from pathlib import Path

import pandas as pd

IMG_EXT = {".jpg", ".jpeg", ".png", ".heic"}
NAME_RE = r"IMG_\d{4}"


def tier_from_severity(sev):
    """Tier from the severity score (0 = clean, 100 = severe): 20 / 60 / 85 bands."""
    if sev <= 20:
        return "Healthy"
    if sev <= 60:
        return "Early"
    if sev <= 85:
        return "Moderate"
    return "Severe"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv", required=True)
    ap.add_argument("--images", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args()

    problems = 0
    df = pd.read_csv(a.csv)
    n_read = len(df)
    df = df.dropna(subset=["Photo_Filename"]).copy()
    print(f"rows read: {n_read} | blank rows dropped: {n_read - len(df)}")

    # 1. tidy text columns
    for c in df.columns:
        if pd.api.types.is_string_dtype(df[c]) or df[c].dtype == object:
            df[c] = df[c].str.strip().str.replace(r"\s+", " ", regex=True)

    # 2. filenames and duplicates
    bad = df[~df.Photo_Filename.str.fullmatch(NAME_RE)]
    if len(bad):
        problems += len(bad)
        print("\nFILENAMES TO FIX BY HAND (excluded from output):")
        print(bad[["Photo_Filename", "Site_ID"]].to_string())
    df = df[df.Photo_Filename.str.fullmatch(NAME_RE)]

    exact_dup = df.duplicated(keep="first")
    if exact_dup.any():
        print(f"\nexact duplicate rows dropped: {df[exact_dup].Photo_Filename.tolist()}")
    df = df[~exact_dup]

    clash = df[df.Photo_Filename.duplicated(keep=False)]
    if len(clash):
        problems += len(clash)
        print("\nSAME FILENAME BUT DIFFERENT DETAILS (excluded - fix by hand):")
        print(clash[["Photo_Filename", "Site_ID", "Severity_Score_0_100"]].to_string())
        df = df[~df.Photo_Filename.duplicated(keep=False)]

    # 3. match rows to image files
    files = {}
    for p in Path(a.images).rglob("*"):
        if p.suffix.lower() in IMG_EXT:
            files.setdefault(p.stem.lower(), p)
    df["Image_Path"] = df.Photo_Filename.str.lower().map(lambda s: files[s].as_posix() if s in files else None)

    missing = df[df.Image_Path.isna()]
    if len(missing):
        problems += len(missing)
        print(f"\nCSV ROWS WITH NO PHOTO IN {a.images} (excluded): {missing.Photo_Filename.tolist()}")
    extra = sorted(set(files) - set(df.Photo_Filename.str.lower()))
    if extra:
        print(f"\nphotos in the folder that are not in the CSV: {len(extra)} (first few: {extra[:8]})")
    df = df[df.Image_Path.notna()].copy()

    exts = sorted({Path(p).suffix.lower() for p in df.Image_Path})
    print(f"\nrows with a matching photo: {len(df)} | extensions: {exts}")
    if ".heic" in exts:
        print("NOTE: OpenCV cannot read HEIC. Convert those photos to JPG first (e.g. with pillow-heif).")

    # 4. columns the pipeline needs
    df["Health_Score_0_100"] = 100 - df.Severity_Score_0_100
    df["Rated_Capacity_kW"] = df.Rated_Capacity_W / 1000.0
    df["Soiling_Target"] = (df.Surface_Soiling_Flag_YN == "Y").astype(int)

    # 5. score tier. Your typed column follows a dirt-or-damage rule, so it is kept
    #    separately and is expected to differ from the score tier on some rows.
    df = df.rename(columns={"Degradation_Category": "Degradation_Category_Hand"})
    df["Tier_From_Score"] = df.Severity_Score_0_100.map(tier_from_severity)
    print("\nscore tiers (severity 20 / 60 / 85):", df.Tier_From_Score.value_counts().to_dict())
    print("soiling flag:", df.Surface_Soiling_Flag_YN.value_counts().to_dict())

    print("\nper-site summary:")
    print(
        df.groupby("Site_ID")
        .agg(photos=("Photo_Filename", "count"), age=("Age_Years", "first"),
             capacity_W=("Rated_Capacity_W", "first"), mean_health=("Health_Score_0_100", "mean"))
        .round(1).to_string()
    )

    df.to_csv(a.out, index=False)
    print(f"\nwrote {len(df)} rows to {a.out}")
    if problems:
        print(f"{problems} row(s) need attention above - fix the CSV or add the missing photos, then run again.")
        sys.exit(1)
    print("OK - every row has a photo.")


if __name__ == "__main__":
    main()
