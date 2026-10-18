"""schemas.py - the shape of the panel health answer (shows up in the API docs at /docs)."""
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


class PredictionResponse(BaseModel):
    health_score: float                                   # 0-100, higher is healthier
    degradation_category: Literal["Healthy", "Early", "Moderate", "Severe"]
    recommendation: str
    surface_deposit_detected: bool                        # a removable deposit (dust, droppings, stains) was found
    surface_observation: Optional[str] = None             # the note to show for it, when it does not change the advice
    soiling_probability: float
    predicted_output_pct: float                           # predicted output as a percentage of the rated capacity
    output_range_pct: List[float]                         # [low, high]
    output_range_w: List[int]                             # [low, high] in watts
    rated_capacity_w: int
    note: str
    heatmap_png_base64: Optional[str] = None              # Grad-CAM overlay, when asked for and available
    heatmap_error: Optional[str] = None


class ReportRequest(BaseModel):
    """What the page sends to POST /report: the finished result plus the details that are not in it. Nothing is stored."""
    report: PredictionResponse
    age_years: float = Field(ge=0, le=40)
    photo_name: str = Field(default="", max_length=120)
    crop_jpeg_base64: Optional[str] = Field(default=None, max_length=7_000_000)     # the straightened panel, about 5 MB at most
