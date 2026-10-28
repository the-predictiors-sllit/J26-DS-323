r"""category_from_output.py - add ONE new column, Category_From_Output, to your dataset, and check it.

    python src\category_from_output.py                        # preview: cut-offs 75 / 60 / 40, writes a copy with the new column
    python src\category_from_output.py --in-place             # add the column to the file itself (a backup is made first)
    python src\category_from_output.py --csv data\panel_dataset_log_v3.csv --in-place
    python src\category_from_output.py --cuts 80 65 45 --shift 5

What it does
  1. Adds a new column  Category_From_Output  using fixed cut-offs on Health_Percentage
     (Health_Percentage = measured peak output / rated capacity x 100, from the inverter data).
  2. Compares it with your hand category (counts, confusion table, agreement, Cohen's kappa, weighted kappa) and
     lists the photos where the two disagree.
  3. Sensitivity check: moves all the cut-offs together, and each one on its own, by +/- SHIFT points and shows how
     many photos change category.

What it does NOT do
  It does not change any other column, any Site_ID, any spacing, the line endings or the column order. The new column is
  simply added at the end of every line; every existing character stays exactly as it was. After writing, the script
  re-reads the file and checks this, and tells you the result. Site IDs are shown exactly as they are in your file.
  Needs only pandas and numpy.

IMPORTANT - what the cut-offs mean: Health_Percentage is a measured number, but it also depends on weather, temperature,
the time of the measurement and the panel's age. The cut-offs are a DESIGN CHOICE: write down where they came from and
keep the sensitivity table in your report.
"""
import argparse
import csv
import io
import re
import shutil
from pathlib import Path

import numpy as np
import pandas as pd

COL = "Category_From_Output"
NAMES = ["Healthy", "Early Degradation", "Moderate Degradation", "Severe Degradation"]
SHORT = {"Healthy": "Healthy", "Early Degradation": "Early", "Moderate Degradation": "Moderate", "Severe Degradation": "Severe"}


def categorize(output_pct, cuts):
    """cuts = (healthy_min, early_min, moderate_min). Returns the four category names as an array."""
    h, e, m = cuts
    o = np.asarray(output_pct, float)
    return np.where(o >= h, NAMES[0], np.where(o >= e, NAMES[1], np.where(o >= m, NAMES[2], NAMES[3])))


def normalise_hand(value):
    """Map whatever is typed in the hand column to one of the four names (None if it is blank or unknown)."""
    s = str(value).strip().lower()
    for key, name in (("healthy", NAMES[0]), ("early", NAMES[1]), ("moderate", NAMES[2]), ("severe", NAMES[3])):
        if s.startswith(key):
            return name
    return None


def _codes(a):
    return pd.Series(list(a)).map({n: i for i, n in enumerate(NAMES)}).to_numpy(float)


def cohen_kappa(a, b):
    a, b = pd.Series(list(a)).reset_index(drop=True), pd.Series(list(b)).reset_index(drop=True)
    po = float((a == b).mean())
    pe = float(sum((a == n).mean() * (b == n).mean() for n in NAMES))
    return float("nan") if pe == 1 else (po - pe) / (1 - pe)


def weighted_kappa(a, b):
    """Quadratic-weighted kappa: a disagreement of 2 levels costs 4x a disagreement of 1 level."""
    x, y = _codes(a), _codes(b)
    observed = ((x - y) ** 2).sum()
    expected = ((x[:, None] - y[None, :]) ** 2).sum() / len(x)
    return float("nan") if expected == 0 else 1 - observed / expected


def counts(cat):
    return pd.Series(list(cat)).value_counts().reindex(NAMES, fill_value=0)


# ---------------------------------------------------------------------------------------------- reading and writing the file
def read_text(path):
    """Returns (text, encoding, had_bom). Tries utf-8 first, then Windows-1252."""
    raw = Path(path).read_bytes()
    had_bom = raw.startswith(b"\xef\xbb\xbf")
    for enc in ("utf-8", "cp1252"):
        try:
            text = raw.decode(enc)
            return (text.lstrip("\ufeff") if had_bom else text), enc, had_bom
        except UnicodeDecodeError:
            continue
    raise SystemExit(f"could not read {path} as utf-8 or windows-1252")


LINE = re.compile(r"[^\r\n]*(?:\r\n|\n|\r)|[^\r\n]+$")


def split_lines(text):
    return LINE.findall(text)


def split_terminator(line):
    for t in ("\r\n", "\n", "\r"):
        if line.endswith(t):
            return line[: -len(t)], t
    return line, ""


def write_with_new_column(text, values, existing_col_index=None):
    """Return the new file text. values[i] is the new value for data row i (header excluded).

    Normal case: the column does not exist yet, and every line is one record -> each line just gets ',value' added at its end,
    so every other character is untouched. If the column already exists (a re-run), only that cell is replaced.
    """
    lines = split_lines(text)
    records = list(csv.reader(io.StringIO(text, newline="")))
    if len(lines) != len(records):
        raise SystemExit("this csv has cells that contain line breaks, which this script does not handle safely. "
                         "Nothing was written.")
    out = []
    for i, line in enumerate(lines):
        body, term = split_terminator(line)
        if i == 0:
            if existing_col_index is None:
                body = f"{body},{COL}"
        else:
            v = values[i - 1] if i - 1 < len(values) else ""
            if existing_col_index is None:
                body = f"{body},{v}"
            else:
                rec = records[i]
                if rec:
                    rec = list(rec)
                    rec[existing_col_index] = v
                    buf = io.StringIO()
                    csv.writer(buf, lineterminator="").writerow(rec)
                    body = buf.getvalue()
        out.append(body + term)
    return "".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", default="data/panel_dataset_clean.csv", help="the dataset to add the column to")
    ap.add_argument("--in-place", action="store_true", help="add the column to the file itself (a backup copy is made first)")
    ap.add_argument("--out", default=None, help="where to write the copy when not using --in-place (default: <name>_v4.csv)")
    ap.add_argument("--results-dir", default="results")
    ap.add_argument("--cuts", type=float, nargs=3, default=[75, 60, 40], metavar=("HEALTHY", "EARLY", "MODERATE"),
                    help="minimum output %% for Healthy, Early and Moderate (below the last one is Severe)")
    ap.add_argument("--shift", type=float, default=5.0, help="how far to move the cut-offs in the sensitivity check (points)")
    ap.add_argument("--hand-col", default=None, help="the hand category column (default: Degradation_Category_Hand, else Degradation_Category)")
    ap.add_argument("--no-backup", action="store_true", help="with --in-place, do not make a backup copy")
    args = ap.parse_args()

    cuts = tuple(args.cuts)
    if not cuts[0] > cuts[1] > cuts[2] > 0:
        raise SystemExit(f"cut-offs must go down, for example 75 60 40 (you gave {cuts})")
    path = Path(args.csv)
    if not path.exists():
        raise SystemExit(f"{path} not found. Run this from the PanelScan folder, or pass --csv with the full path.")
    text, enc, had_bom = read_text(path)

    # every cell is read as TEXT, so nothing is converted or reformatted
    df = pd.read_csv(io.StringIO(text), dtype=str, keep_default_na=False, skip_blank_lines=False)
    for col in ("Health_Percentage", "Site_ID"):
        if col not in df.columns:
            raise SystemExit(f"column '{col}' is not in {path}. Columns: {list(df.columns)}")
    hand_col = args.hand_col or next((c for c in ("Degradation_Category_Hand", "Degradation_Category") if c in df.columns), None)
    if hand_col is None or hand_col not in df.columns:
        raise SystemExit("no hand category column found (looked for Degradation_Category_Hand and Degradation_Category). Use --hand-col.")

    out = pd.to_numeric(df.Health_Percentage.str.strip(), errors="coerce")
    has_output = out.notna()
    hand = df[hand_col].map(normalise_hand)
    site = df.Site_ID.str.strip()
    rule = pd.Series(pd.NA, index=df.index, dtype=object)
    rule[has_output] = categorize(out[has_output], cuts)
    comparable = has_output & hand.notna()
    unknown = sorted(set(df.loc[has_output & hand.isna(), hand_col]))

    pd.set_option("display.width", 200)
    pd.set_option("display.max_columns", 30)
    n = int(comparable.sum())
    print(f"file: {path} | rows: {len(df)} | rows with a measured output: {int(has_output.sum())} | compared with hand category: {n} | sites: {site[has_output].nunique()}")
    if unknown:
        print(f"note: {len(unknown)} hand-category value(s) were not recognised and are left out of the comparison: {unknown}")
    print(f"measured output %: min {out.min():.1f}, median {out.median():.1f}, max {out.max():.1f}")
    print(f"\nRULE:  Healthy >= {cuts[0]:g}%   Early >= {cuts[1]:g}%   Moderate >= {cuts[2]:g}%   Severe < {cuts[2]:g}%")
    print("       (Health_Percentage = measured peak output / rated capacity x 100)")

    r, h = rule[comparable], hand[comparable]
    print("\n=== 1. HOW MANY PHOTOS IN EACH CATEGORY ===")
    print(pd.DataFrame({"from_output_rule": counts(r), "hand": counts(h)}).to_string())

    print("\n=== 2. RULE (rows) VERSUS YOUR HAND CATEGORY (columns) ===")
    ct = pd.crosstab(r, h).reindex(index=NAMES, columns=NAMES, fill_value=0)
    ct.index, ct.columns = [SHORT[x] for x in NAMES], [SHORT[x] for x in NAMES]
    print(ct.to_string())
    print(f"\nagreement:               {(r == h).mean():.0%}  ({int((r == h).sum())} of {n} photos)")
    print(f"Cohen's kappa:           {cohen_kappa(r, h):.2f}")
    print(f"weighted kappa (quad.):  {weighted_kappa(r, h):.2f}   (1.0 = identical, 0 = no better than chance)")
    diff = _codes(r) - _codes(h)
    print(f"rule is stricter (worse category) than hand for {int((diff > 0).sum())} photos, kinder for {int((diff < 0).sum())}")

    print("\n=== 3. WHERE THE TWO DISAGREE, BY SITE ===")
    bad = comparable & (rule != hand)
    dis = pd.DataFrame({"Photo_Filename": df["Photo_Filename"] if "Photo_Filename" in df.columns else "", "Site_ID": site,
                        "Health_Percentage": out, "hand": hand.map(SHORT), "rule": rule.map(SHORT)})[bad]
    if "Severity_Score_0_100" in df.columns:
        dis["severity"] = df.loc[bad, "Severity_Score_0_100"]
    print(dis.groupby(["Site_ID", "hand", "rule"]).size().rename("photos").reset_index().to_string(index=False) if len(dis) else "no disagreements")

    print("\n=== 4. RULE CATEGORY BY SITE ===")
    bysite = pd.crosstab(site[has_output], rule[has_output]).reindex(columns=NAMES, fill_value=0)
    bysite.columns = [SHORT[x] for x in NAMES]
    print(bysite.to_string())

    print(f"\n=== 5. SENSITIVITY: HOW MUCH DOES THE ANSWER MOVE IF THE CUT-OFFS MOVE BY +/-{args.shift:g} POINTS? ===")
    variants = [("base", cuts)]
    for d in (-args.shift, -args.shift / 2, args.shift / 2, args.shift):
        variants.append((f"all cut-offs {d:+g}", tuple(c + d for c in cuts)))
    for i, nm in enumerate(("Healthy", "Early", "Moderate")):
        for d in (-args.shift, args.shift):
            v = list(cuts)
            v[i] += d
            if v[0] > v[1] > v[2] > 0:
                variants.append((f"{nm} cut-off {d:+g}", tuple(v)))
    o_c = out[comparable]
    rows, every = [], {}
    for name, cv in variants:
        cat = pd.Series(categorize(o_c, cv), index=o_c.index)
        every[name] = cat
        c = counts(cat)
        rows.append({"variant": name, "cut-offs": "/".join(f"{x:g}" for x in cv), "Healthy": c[NAMES[0]], "Early": c[NAMES[1]],
                     "Moderate": c[NAMES[2]], "Severe": c[NAMES[3]], "photos_changed_vs_base": int((cat != r).sum()),
                     "agree_with_hand": round(float((cat == h).mean()), 2), "weighted_kappa": round(weighted_kappa(cat, h), 2)})
    sens = pd.DataFrame(rows)
    print(sens.to_string(index=False))
    stable = pd.concat(every, axis=1).nunique(axis=1) == 1
    near = pd.Series(False, index=o_c.index)
    for c_ in cuts:
        near |= (o_c - c_).abs() <= args.shift / 2
    print(f"\nphotos whose category never changes in any variant above: {int(stable.sum())} of {n} ({stable.mean():.0%})")
    print(f"photos within +/-{args.shift / 2:g} points of a cut-off (borderline): {int(near.sum())} of {n}")
    print("RULE OF THUMB: if moving a cut-off by a few points changes a large share of photos, the cut-offs need a strong justification.")

    # ---------------------------------------------------------------------------------------------- write the file
    values = ["" if pd.isna(v) else v for v in rule.tolist()]
    existing = list(df.columns).index(COL) if COL in df.columns else None
    new_text = write_with_new_column(text, values, existing)
    if args.in_place:
        target = path
        backup = path.with_name(path.name + ".before_category.bak")
        if not args.no_backup and not backup.exists():
            shutil.copy2(path, backup)
    else:
        target = Path(args.out) if args.out else path.with_name(re.sub(r"_v\d+$", "", path.stem) + "_v4" + path.suffix)
    target.parent.mkdir(parents=True, exist_ok=True)
    raw_out = new_text.encode(enc)
    target.write_bytes((b"\xef\xbb\xbf" + raw_out) if had_bom else raw_out)

    # ---------------------------------------------------------------------------------------------- check that nothing else changed
    new_read = read_text(target)[0]
    after = pd.read_csv(io.StringIO(new_read), dtype=str, keep_default_na=False, skip_blank_lines=False)
    same = all(after[c].equals(df[c]) for c in df.columns if c != COL) and len(after) == len(df)
    old_lines, new_lines = split_lines(text), split_lines(new_read)
    prefix_ok = existing is not None or all(nl.startswith(split_terminator(ol)[0]) for ol, nl in zip(old_lines, new_lines))
    eol_same = [split_terminator(a)[1] for a in old_lines] == [split_terminator(b)[1] for b in new_lines]
    print("\n=== CHECK: nothing else was changed ===")
    print(f"rows: {len(after)} (was {len(df)}) | every other column identical: {same} | every line starts exactly as before: {prefix_ok} | line endings kept: {eol_same}")
    if not (same and prefix_ok and eol_same):
        print("WARNING: the check failed. Do not use the new file; tell me what this printed.")
    res = Path(args.results_dir)
    res.mkdir(parents=True, exist_ok=True)
    sens.to_csv(res / "category_sensitivity.csv", index=False)
    ct.to_csv(res / "category_vs_hand_crosstab.csv")
    dis.sort_values(["Site_ID", "Health_Percentage"]).to_csv(res / "category_disagreements.csv", index=False)
    print(f"\nwrote: {target}  (new column: {COL}{' - updated' if existing is not None else ''}; nothing else changed)")
    if args.in_place and not args.no_backup:
        print(f"backup of the original: {backup}")
    print(f"also: {res / 'category_sensitivity.csv'}, {res / 'category_vs_hand_crosstab.csv'}, {res / 'category_disagreements.csv'}")


if __name__ == "__main__":
    main()
