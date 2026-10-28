"""advice.py - turn the model's raw numbers into what the user reads. Plain Python, no PyTorch.

Inputs come from the model: a health score (0-100, higher = healthier), the measured-output
percentage it predicts, and the probability that a removable surface deposit is on the panel.

The rules are the ones agreed for this project:
  * The CONDITION (Healthy / Early / Moderate / Severe) comes from the PREDICTED OUTPUT, as a percentage of the
    panel's rated capacity: Healthy >= 75, Early >= 60, Moderate >= 40, otherwise Severe. These are the same cut-offs
    as the Category_From_Output column in the dataset (see category_from_output.py), so the app and the labels
    use one definition, based on measured output and not on a hand-typed score.
  * The health score is still reported (it is the visual score from the photo), but it no longer decides the condition.
  * Each condition has its own advice, about OUTPUT LOSS.
  * Surface deposit is reported separately. It only changes the advice when the condition is
    Moderate or Severe: then the user is first told to clean the panel and scan again, instead
    of being told to replace it (a very dusty panel can lose a lot of output without being damaged).
  * The watt range is the predicted output percentage of the panel's own rated capacity,
    plus or minus a margin taken from the leave-one-site-out test error.
"""

TIERS = ["Healthy", "Early", "Moderate", "Severe"]

TIER_ADVICE = {
    "Healthy": "No action needed.",
    "Early": "Output is lower than expected. Show the panel to your supplier or installer to review.",
    "Moderate": "Output is significantly lower. A supplier or installer inspection is recommended.",
    "Severe": "Very large power loss. Replacement is likely, so contact your supplier.",
}

SURFACE_MESSAGE = "Surface deposit detected. If it is still there after heavy rain, clean the panel."

CLEAN_FIRST_ADVICE = ("Very low output, and a surface deposit was detected. Clean the panel and scan again. "
                      "If the output is still low, have your supplier check it.")

DISCLAIMER = "This is an estimate from one photo, not a measurement of the panel."


# Minimum predicted output (% of the rated capacity) for each condition. Below the last one the condition is Severe.
OUTPUT_CUTS = (75.0, 60.0, 40.0)          # Healthy, Early, Moderate


def tier_from_output(output_pct, cuts=OUTPUT_CUTS):
    """Healthy >= 75%, Early >= 60%, Moderate >= 40%, otherwise Severe (output as a % of the rated capacity)."""
    healthy_min, early_min, moderate_min = cuts
    if output_pct >= healthy_min:
        return "Healthy"
    if output_pct >= early_min:
        return "Early"
    if output_pct >= moderate_min:
        return "Moderate"
    return "Severe"


def tier_from_health(health_score):
    """The OLD rule, kept for comparison only: Healthy >= 80, Early >= 40, Moderate >= 15 (severity 20 / 60 / 85).
    build_report no longer uses it."""
    if health_score >= 80:
        return "Healthy"
    if health_score >= 40:
        return "Early"
    if health_score >= 15:
        return "Moderate"
    return "Severe"


def _round_half_up(x):
    """Whole number, with .5 rounded up (Python's round() sends 292.5 to 292)."""
    return int(float(x) + 0.5)


def _clip(value, low, high):
    return max(low, min(high, float(value)))


def build_report(health_score, output_pct, soiling_prob, rated_capacity_w,
                 output_margin_pct=10.0, soiling_threshold=0.5):
    """Everything the app shows for one photo, as plain numbers and text (safe to send as JSON).

    health_score      predicted health score, 0-100 (shown to the user, but it does not decide the condition)
    output_pct        predicted output as a percentage of the rated capacity (0-100); this decides the condition
    soiling_prob      probability (0-1) that a removable surface deposit is present
    rated_capacity_w  the panel's rated capacity in watts, as typed by the user
    output_margin_pct plus/minus this many percentage points around the predicted output
                      (use the output-percent error from the leave-one-site-out results)
    """
    health = _clip(health_score, 0, 100)
    out = _clip(output_pct, 0, 100)
    tier = tier_from_output(out)
    deposit = float(soiling_prob) >= soiling_threshold

    advice = TIER_ADVICE[tier]
    surface_note = None
    if deposit:
        if tier in ("Moderate", "Severe"):
            advice = CLEAN_FIRST_ADVICE
        else:
            surface_note = SURFACE_MESSAGE

    low_pct = _clip(out - output_margin_pct, 0, 100)
    high_pct = _clip(out + output_margin_pct, 0, 100)
    rated = float(rated_capacity_w)

    return {
        "health_score": round(health, 1),
        "degradation_category": tier,
        "recommendation": advice,
        "surface_deposit_detected": bool(deposit),
        "surface_observation": surface_note,
        "soiling_probability": round(float(soiling_prob), 2),
        "predicted_output_pct": round(out, 1),
        "output_range_pct": [round(low_pct, 1), round(high_pct, 1)],
        "output_range_w": [_round_half_up(rated * low_pct / 100), _round_half_up(rated * high_pct / 100)],
        "rated_capacity_w": _round_half_up(rated),
        "note": DISCLAIMER,
    }
