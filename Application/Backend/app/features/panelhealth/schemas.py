"""schemas.py - the shape of the panel health answer (shows up in the API docs at /docs)."""
from typing import List, Literal, Optional

from pydantic import BaseModel


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
