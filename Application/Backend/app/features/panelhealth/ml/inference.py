"""inference.py - load the saved model and answer for one photo. Used by the web service (api/panel_api.py).

    from inference import Predictor
    p = Predictor("checkpoints/panelscan.pt")
    report = p.predict(photo_rgb, corners, rated_capacity_w=325, age_years=8)

The photo is cut out and prepared by preprocessing.prepare_image with the settings stored in the
checkpoint, so it is exactly the pipeline the model was trained with.
"""
import os
from pathlib import Path

import torch

# Inside the Backend this file is part of a package (app.features.panelhealth.ml) and uses relative imports;
# run from experiments/.../src it is a plain script and uses absolute ones.
if __package__:
    from .advice import build_report
    from .consistency import mismatched_files
    from .dataset import AGE_SCALE, CAPACITY_SCALE, get_transforms
    from .model import PanelModel
    from .preprocessing import PANEL_ASPECT, prepare_image
else:
    from advice import build_report
    from consistency import mismatched_files
    from dataset import AGE_SCALE, CAPACITY_SCALE, get_transforms
    from model import PanelModel
    from preprocessing import PANEL_ASPECT, prepare_image


class Predictor:
    def __init__(self, checkpoint="checkpoints/panelscan.pt", device=None):
        self.device = torch.device(device or ("cuda" if torch.cuda.is_available() else "cpu"))
        ckpt = torch.load(checkpoint, map_location=self.device)
        self.cfg = ckpt["config"]
        saved_hashes = self.cfg.get("source_hashes")
        if saved_hashes and not os.environ.get("PANELHEALTH_SKIP_SOURCE_CHECK"):
            bad = mismatched_files(saved_hashes, Path(__file__).resolve().parent)
            if bad:
                raise RuntimeError(
                    f"{', '.join(bad)} here differ from the versions the model was trained with, so photos could be "
                    "prepared differently from training. Run  python src/sync_to_backend.py  in experiments/.../PanelScan "
                    "to refresh the copies, or retrain with train_final.py. (If you only edited comments, set "
                    "PANELHEALTH_SKIP_SOURCE_CHECK=1 to skip this check.)")
        if abs(self.cfg["panel_aspect"] - PANEL_ASPECT) > 1e-6:
            raise RuntimeError(
                f"The model was trained with PANEL_ASPECT={self.cfg['panel_aspect']} but preprocessing.py now says "
                f"{PANEL_ASPECT}. Set it back (or retrain) so the app crops the same way as training.")
        if abs(self.cfg["age_scale"] - AGE_SCALE) > 1e-6 or abs(self.cfg["capacity_scale"] - CAPACITY_SCALE) > 1e-6:
            raise RuntimeError("AGE_SCALE / CAPACITY_SCALE in dataset.py changed since training.")
        self.model = PanelModel(self.cfg["backbone"], use_meta=self.cfg["use_meta"], pretrained=False)
        self.model.load_state_dict(ckpt["state_dict"])
        self.model.to(self.device).eval()
        self.transform = get_transforms(train=False)

    def _prepare(self, photo_rgb, corners, rated_capacity_w, age_years):
        panel = prepare_image(photo_rgb, size=self.cfg["img_size"], use_clahe=self.cfg["use_clahe"], corners=corners)
        tensor = self.transform(image=panel)["image"].unsqueeze(0).to(self.device)
        meta = torch.tensor([[age_years / AGE_SCALE, rated_capacity_w / CAPACITY_SCALE]],
                            dtype=torch.float32, device=self.device)
        return panel, tensor, meta

    def predict(self, photo_rgb, corners, rated_capacity_w, age_years):
        """photo_rgb: the uploaded photo as an RGB array. corners: 8 fractions, top-left first, clockwise."""
        _, tensor, meta = self._prepare(photo_rgb, corners, rated_capacity_w, age_years)
        with torch.no_grad():
            reg, soil_logit = self.model(tensor, meta)
        return build_report(
            health_score=float(reg[0, 0]) * 100,
            output_pct=float(reg[0, 1]) * 100,
            soiling_prob=float(torch.sigmoid(soil_logit)[0]),
            rated_capacity_w=rated_capacity_w,
            output_margin_pct=self.cfg["output_margin"],
            soiling_threshold=self.cfg["soiling_threshold"],
        )

    def explain(self, photo_rgb, corners, rated_capacity_w, age_years):
        """The panel with a Grad-CAM heat map on it (RGB, uint8)."""
        # imported here so predict() works without the grad-cam package
        if __package__:
            from .gradcam_utils import heatmap_overlay
        else:
            from gradcam_utils import heatmap_overlay
        panel, tensor, meta = self._prepare(photo_rgb, corners, rated_capacity_w, age_years)
        return heatmap_overlay(self.model, tensor, panel, meta if self.cfg["use_meta"] else None)
