"""report.py - builds the PDF analysis report for one panel health result.

Nothing is stored: the page sends the finished result (and the images it already holds), this module draws the PDF in
memory, and the Backend returns the bytes. Uses only fpdf2 and Pillow. The library is imported when a report is
requested, so a missing package can never stop the Backend from starting.

Text uses the PDF standard Helvetica font, which covers Latin-1 only; _t() replaces anything else, so odd characters in
the data can never break a report. (Sinhala and Tamil would need an embedded Unicode font with text shaping.)

The wording in LIMITS describes how the model performed in testing. Update it when the model changes.
"""
import base64
import binascii
import io
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional, Tuple

try:
    from .ml.advice import OUTPUT_CUTS            # the same cut-offs the condition is decided with (see advice.py)
except ImportError:                               # report.py used on its own
    OUTPUT_CUTS = (75.0, 60.0, 40.0)

# Sri Lanka has no daylight saving, so a fixed offset is always right
SL_TZ = timezone(timedelta(hours=5, minutes=30))

# Same tier colours as the page (accent, soft background, dark text), as RGB.
TIER_COLOURS = {
    "Healthy":  {"accent": (16, 185, 129), "soft": (236, 253, 245), "dark": (6, 95, 70)},
    "Early":    {"accent": (245, 158, 11), "soft": (255, 251, 235), "dark": (146, 64, 14)},
    "Moderate": {"accent": (249, 115, 22), "soft": (255, 247, 237), "dark": (154, 52, 18)},
    "Severe":   {"accent": (239, 68, 68),  "soft": (254, 242, 242), "dark": (153, 27, 27)},
}
TIER_LABEL = {"Healthy": "Healthy", "Early": "Early degradation",
              "Moderate": "Moderate degradation", "Severe": "Severe degradation"}

INK, MUTED, SLATE = (15, 23, 42), (100, 116, 139), (51, 65, 85)
LINE, PANEL = (226, 232, 240), (248, 250, 252)

LIMITS = [
    "This is an automated estimate from one photo. It is not a measurement of the panel, a warranty assessment or a "
    "certified inspection.",
    "Real output also depends on sunlight, temperature and shade. Ask a qualified installer before replacing or "
    "removing panels.",
]

_healthy_min, _early_min, _moderate_min = OUTPUT_CUTS
CONDITION_RULE = (f"The condition is based on the predicted output compared with the panel's rated capacity: "
                  f"Healthy {_healthy_min:g}% or more; Early degradation {_early_min:g}% to under {_healthy_min:g}%; "
                  f"Moderate degradation {_moderate_min:g}% to under {_early_min:g}%; Severe degradation under {_moderate_min:g}%.")

MAX_TEXT = 700          # longest text accepted for any one field
MAX_IMAGE_PIXELS = 4000 * 4000
LOGO_PATH = Path(__file__).resolve().parents[4] / "frontend" / "public" / "SOLAI-logo-short.png"


class ReportError(ValueError):
    """The data sent for the report cannot be used (the Backend answers 422)."""


class MissingPackage(RuntimeError):
    """fpdf2 is not installed (the Backend answers 503 with the install command)."""


def _t(value: object, limit: int = MAX_TEXT) -> str:
    """Text the standard PDF font can draw: common typographic marks become plain ones, the rest becomes '?'."""
    text = "" if value is None else str(value)
    for old, new in {"\u2013": "-", "\u2014": "-", "\u2212": "-", "\u2018": "'", "\u2019": "'", "\u201c": '"',
                     "\u201d": '"', "\u2022": "-", "\u2026": "...", "\u00a0": " ", "\u2192": "->"}.items():
        text = text.replace(old, new)
    text = "".join(ch if ch.isprintable() or ch ==
                   "\n" else " " for ch in text)
    return text.encode("latin-1", "replace").decode("latin-1")[:limit]


def decode_image(data: Optional[bytes], max_side: int = 700) -> Optional[bytes]:
    """Check an image and re-encode it as a compact RGB JPEG that fpdf2 can embed. Returns None when there is no image."""
    if not data:
        return None
    from PIL import Image
    try:
        with Image.open(io.BytesIO(data)) as im:
            if im.width * im.height > MAX_IMAGE_PIXELS:
                raise ReportError("An image is too large.")
            im = im.convert("RGB")
            im.thumbnail((max_side, max_side))
            out = io.BytesIO()
            im.save(out, "JPEG", quality=86, optimize=True)
            return out.getvalue()
    except ReportError:
        raise
    except Exception as exc:                                  # not an image, truncated, and so on
        raise ReportError("An image in the report could not be read.") from exc


def heatmap_bytes(b64: Optional[str]) -> Optional[bytes]:
    if not b64:
        return None
    try:
        return base64.b64decode(b64, validate=False)
    except (binascii.Error, ValueError) as exc:
        raise ReportError("The heat map is not valid base64.") from exc


def _surface_text(deposit: bool, note: Optional[str]) -> Tuple[str, str]:
    """(headline, detail) exactly as the page words it."""
    if deposit:
        return ("Surface deposit detected",
                note or "A removable deposit (dust, droppings or stains) was found on the glass. It may be causing part of "
                        "the lost output.")
    return "No surface deposit detected", "No removable dirt was found on the glass."


def make_report_id(now: datetime) -> str:
    return f"PH-{now:%Y%m%d-%H%M}-{secrets.token_hex(2).upper()}"


def build_pdf(*, health_score: float, tier: str, recommendation: str, deposit: bool, observation: Optional[str],
              output_range_w: List[int], output_range_pct: List[float], rated_capacity_w: int, note: str,
              age_years: float, photo_name: str, crop_jpg: Optional[bytes], heatmap_jpg: Optional[bytes],
              now: Optional[datetime] = None, report_id: Optional[str] = None) -> bytes:
    """Draw the report and return the PDF bytes. Raises MissingPackage if fpdf2 is not installed."""
    try:
        from fpdf import FPDF
        from fpdf.enums import MethodReturnValue
    except ModuleNotFoundError as exc:
        raise MissingPackage(
            "The PDF package is not installed. In Application/Backend/app run: uv add fpdf2") from exc
    from PIL import Image

    if tier not in TIER_COLOURS:
        raise ReportError("Unknown degradation category.")
    colours = TIER_COLOURS[tier]
    now = (now or datetime.now(SL_TZ)).astimezone(SL_TZ)
    report_id = report_id or make_report_id(now)
    score = max(0.0, min(100.0, float(health_score)))
    low_w, high_w = (int(output_range_w[0]), int(output_range_w[1]))
    low_pct, high_pct = (
        float(output_range_pct[0]), float(output_range_pct[1]))

    class Doc(FPDF):
        def footer(self) -> None:
            self.set_y(-14)
            self.set_draw_color(*LINE)
            self.line(self.l_margin, self.get_y(),
                      self.w - self.r_margin, self.get_y())
            self.set_font("Helvetica", "", 7.5)
            self.set_text_color(*MUTED)
            self.set_y(-11)
            self.cell(
                120, 5, "PanelScan experimental estimate - not a certified inspection", align="L")
            self.cell(
                0, 5, f"{report_id}   |   Page {self.page_no()} of {{nb}}", align="R")

    pdf = Doc(orientation="P", unit="mm", format="A4")
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.set_margins(15, 15, 15)
    pdf.set_title("Solar Panel Health Report")
    pdf.set_author("PanelScan")
    pdf.set_creator("PanelScan")
    pdf.set_subject(f"Photo-based panel health estimate {report_id}")
    pdf.set_creation_date(now)
    pdf.add_page()
    # 180 mm of usable width
    W = pdf.w - pdf.l_margin - pdf.r_margin
    X0 = pdf.l_margin

    def lines(width: float, text: str, size: float, style: str = "") -> List[str]:
        pdf.set_font("Helvetica", style, size)
        return pdf.multi_cell(width, 4, text, align="L", dry_run=True, output=MethodReturnValue.LINES)

    def fit(text: str, width: float, size: float, style: str = "B") -> str:
        """Shorten one line of text with '...' until it fits in `width` mm at this font size."""
        pdf.set_font("Helvetica", style, size)
        if pdf.get_string_width(text) <= width:
            return text
        while text and pdf.get_string_width(text + "...") > width:
            text = text[:-1]
        return text + "..."

    def need(height: float) -> None:
        if pdf.get_y() + height > pdf.page_break_trigger:
            pdf.add_page()

    def heading(text: str, y: Optional[float] = None, x: Optional[float] = None) -> None:
        pdf.set_xy(X0 if x is None else x, pdf.get_y() if y is None else y)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(0, 4, _t(text).upper())

    # ------------------------------------------------------------------ header band
    pdf.set_fill_color(*INK)
    pdf.rect(0, 0, pdf.w, 26, style="F")
    if LOGO_PATH.is_file():
        pdf.image(str(LOGO_PATH), x=X0, y=5.5, w=13, h=13)
    pdf.set_xy(X0 + 17, 7)
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(93, 9, "Solar Panel Health Report")
    pdf.set_xy(X0 + 17, 16.5)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(203, 213, 225)
    pdf.cell(93, 5, "PanelScan photo-based estimate")
    pdf.set_xy(pdf.w - pdf.r_margin - 62, 6.5)
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(148, 163, 184)
    pdf.cell(62, 4, "REPORT ID", align="R")
    pdf.set_xy(pdf.w - pdf.r_margin - 62, 11)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(62, 5, report_id, align="R")
    pdf.set_xy(pdf.w - pdf.r_margin - 62, 17)
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(203, 213, 225)
    pdf.cell(62, 4, now.strftime("%d %b %Y, %H:%M") +
             " (Sri Lanka time)", align="R")

    # ------------------------------------------------------------------ details box
    y = 31
    pdf.set_fill_color(*PANEL)
    pdf.set_draw_color(*LINE)
    pdf.rect(X0, y, W, 16, style="DF", round_corners=True, corner_radius=2)
    cols = [("Rated capacity", f"{rated_capacity_w} W"), ("Panel age", f"{age_years:.1f} years"),
            ("Photo analysed", _t(photo_name or "uploaded photo", 120))]
    colw = W / 3
    for i, (label, value) in enumerate(cols):
        pdf.set_xy(X0 + 5 + i * colw, y + 3)
        pdf.set_font("Helvetica", "B", 7)
        pdf.set_text_color(*MUTED)
        pdf.cell(colw - 6, 3.5, label.upper())
        pdf.set_xy(X0 + 5 + i * colw, y + 7.8)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(*INK)
        pdf.cell(colw - 6, 6, fit(value, colw - 9, 11))

    # ------------------------------------------------------------------ result: score card + condition and output range
    y = 52
    card_w, gap = 62, 6
    pdf.set_fill_color(*INK)
    pdf.rect(X0, y, card_w, 44, style="F", round_corners=True, corner_radius=3)
    pdf.set_xy(X0 + 6, y + 5)
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(148, 163, 184)
    pdf.cell(card_w - 12, 4, "VISUAL HEALTH SCORE")
    shown = f"{round(score)}"
    pdf.set_font("Helvetica", "B", 38)
    # measured with the big font
    score_w = pdf.get_string_width(shown)
    pdf.set_xy(X0 + 6, y + 10)
    pdf.set_text_color(255, 255, 255)
    pdf.cell(score_w + 1, 16, shown)
    pdf.set_font("Helvetica", "", 13)
    pdf.set_text_color(148, 163, 184)
    pdf.set_xy(X0 + 6 + score_w + 3, y + 16)
    pdf.cell(20, 8, "/ 100")
    gx, gy, gw, gh = X0 + 6, y + 29, card_w - 12, 3.2
    pdf.set_fill_color(*SLATE)
    pdf.rect(gx, gy, gw, gh, style="F",
             round_corners=True, corner_radius=gh / 2)
    fill_w = max(gh, gw * score / 100)
    pdf.set_fill_color(*colours["accent"])
    pdf.rect(gx, gy, fill_w, gh, style="F",
             round_corners=True, corner_radius=gh / 2)
    pdf.set_xy(X0 + 6, y + 35)
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(148, 163, 184)
    pdf.cell(card_w - 12, 4, "Estimated from the photo. Higher is healthier.")

    rx, rw = X0 + card_w + gap, W - card_w - gap
    heading("Condition", y=y + 0.5, x=rx)
    label = TIER_LABEL[tier]
    pdf.set_font("Helvetica", "B", 10)
    pill_w = pdf.get_string_width(label) + 10
    pdf.set_fill_color(*colours["soft"])
    pdf.set_draw_color(*colours["accent"])
    pdf.rect(rx, y + 6, pill_w, 8, style="DF",
             round_corners=True, corner_radius=4)
    pdf.set_xy(rx, y + 6)
    pdf.set_text_color(*colours["dark"])
    pdf.cell(pill_w, 8, label, align="C")

    heading("Predicted output range", y=y + 19, x=rx)
    pdf.set_xy(rx, y + 24)
    pdf.set_font("Helvetica", "B", 17)
    pdf.set_text_color(*INK)
    pdf.cell(rw, 8, f"{low_w} W - {high_w} W")
    by = y + 34
    pdf.set_fill_color(*LINE)
    pdf.rect(rx, by, rw, 3.2, style="F", round_corners=True, corner_radius=1.6)
    seg_x = rx + rw * max(0.0, min(low_pct, 100.0)) / 100
    seg_w = max(1.6, rw * (max(0.0, min(high_pct, 100.0)) -
                max(0.0, min(low_pct, 100.0))) / 100)
    pdf.set_fill_color(*colours["accent"])
    pdf.rect(seg_x, by, seg_w, 3.2, style="F",
             round_corners=True, corner_radius=1.6)
    pdf.set_font("Helvetica", "", 7)
    pdf.set_text_color(*MUTED)
    pdf.set_xy(rx, by + 4.2)
    pdf.cell(rw / 2, 4, "0 W")
    pdf.cell(rw / 2, 4, f"{rated_capacity_w} W (rated)", align="R")
    pdf.set_xy(rx, by + 4.2)

    # ------------------------------------------------------------------ images
    y = 102
    box_w, box_h = (W - 6) / 2, 54
    for i, (png, caption, missing) in enumerate([
            (crop_jpg, "Straightened panel (what the model saw)",
             "Straightened panel image not included"),
            (heatmap_jpg, "Heat map: red areas lowered the score most", "Heat map not available for this photo")]):
        bx = X0 + i * (box_w + 6)
        pdf.set_fill_color(*PANEL)
        pdf.set_draw_color(*LINE)
        pdf.rect(bx, y, box_w, box_h, style="DF",
                 round_corners=True, corner_radius=2)
        if png:
            with Image.open(io.BytesIO(png)) as im:
                iw, ih = im.size
            scale = min((box_w - 6) / iw, (box_h - 6) / ih)
            w_mm, h_mm = iw * scale, ih * scale
            pdf.image(io.BytesIO(png), x=bx + (box_w - w_mm) / 2,
                      y=y + (box_h - h_mm) / 2, w=w_mm, h=h_mm)
        else:
            pdf.set_xy(bx, y + box_h / 2 - 3)
            pdf.set_font("Helvetica", "", 8.5)
            pdf.set_text_color(*MUTED)
            pdf.cell(box_w, 6, missing, align="C")
        pdf.set_xy(bx, y + box_h + 1.5)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(box_w, 4, caption, align="C")

    # ------------------------------------------------------------------ surface observation
    pdf.set_y(y + box_h + 8)
    headline, detail = _surface_text(deposit, observation)
    body = lines(W, _t(detail), 9)
    need(14 + 4.3 * len(body))
    heading("Surface observation")
    pdf.set_xy(X0, pdf.get_y() + 5)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*INK)
    pdf.cell(W, 5, headline)
    pdf.set_xy(X0, pdf.get_y() + 6)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(W, 4.3, _t(detail), align="L")

    # ------------------------------------------------------------------ recommendation
    rec = lines(W - 14, _t(recommendation), 10)
    box = 13 + 5 * len(rec)
    pdf.ln(3)
    need(box + 2)
    ry = pdf.get_y()
    pdf.set_fill_color(*colours["soft"])
    pdf.set_draw_color(*colours["accent"])
    pdf.rect(X0, ry, W, box, style="DF", round_corners=True, corner_radius=2.5)
    pdf.set_fill_color(*colours["accent"])
    pdf.rect(X0, ry + 1.5, 1.8, box - 3, style="F")
    pdf.set_xy(X0 + 7, ry + 3.5)
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(*INK)
    pdf.cell(W - 14, 5, "Recommendation")
    pdf.set_xy(X0 + 7, ry + 9.5)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*colours["dark"])
    pdf.multi_cell(W - 14, 5, _t(recommendation), align="L")
    pdf.set_y(ry + box + 4)

    # ------------------------------------------------------------------ how to read this
    read = _t("The health score is the visual score from the photo, including dirt. " + CONDITION_RULE + " The range is the "
              "output expected at good sunlight for a panel that looks like this. " + (note or ""))
    read_lines = lines(W, read, 8.5)
    need(10 + 4 * len(read_lines))
    heading("How to read this")
    pdf.set_xy(X0, pdf.get_y() + 5)
    pdf.set_font("Helvetica", "", 8.5)
    pdf.set_text_color(*SLATE)
    pdf.multi_cell(W, 4, read, align="L")
    pdf.ln(3)

    # ------------------------------------------------------------------ limits
    limit_lines = [lines(W - 16, _t(item), 7.5) for item in LIMITS]
    height = 13 + sum(3.7 * len(ls) + 1.4 for ls in limit_lines)
    need(height + 2)
    ly = pdf.get_y()
    pdf.set_fill_color(*PANEL)
    pdf.set_draw_color(*LINE)
    pdf.rect(X0, ly, W, height, style="DF",
             round_corners=True, corner_radius=2)
    pdf.set_xy(X0 + 6, ly + 3.5)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*INK)
    pdf.cell(W - 12, 5, "Important limits")
    cy = ly + 10
    for item, ls in zip(LIMITS, limit_lines):
        pdf.set_xy(X0 + 6, cy)
        pdf.set_font("Helvetica", "B", 7.5)
        pdf.set_text_color(*MUTED)
        pdf.cell(4, 3.7, "-")
        pdf.set_xy(X0 + 10, cy)
        pdf.set_font("Helvetica", "", 7.5)
        pdf.set_text_color(*SLATE)
        pdf.multi_cell(W - 16, 3.7, _t(item), align="L")
        cy += 3.7 * len(ls) + 1.4

    return bytes(pdf.output())
