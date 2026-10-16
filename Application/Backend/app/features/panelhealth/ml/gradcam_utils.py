"""gradcam_utils.py - show WHERE on the panel the model found a problem (Grad-CAM).

The heat map explains what pulled the HEALTH SCORE DOWN: red areas lowered it most. Install the
library with   pip install grad-cam   (the PyPI name; you import it as pytorch_grad_cam).
Grad-CAM needs gradients, so call explain() outside torch.no_grad().
"""
import numpy as np
import torch.nn as nn
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.image import show_cam_on_image


class _HealthOnly(nn.Module):
    """Wraps PanelModel so it returns only the health score, as the one number Grad-CAM explains."""

    def __init__(self, model, meta=None):
        super().__init__()
        self.model = model
        self.meta = meta   # (1, 2) tensor with age and capacity when the model uses them, otherwise None

    def forward(self, x):
        meta = None if self.meta is None else self.meta.expand(x.shape[0], -1)
        reg, _ = self.model(x, meta)
        return reg[:, :1]  # shape (batch, 1): column 0 of the regression head is the health score


class _LowerScoreTarget:
    """Grad-CAM highlights what increases the target, so use the NEGATIVE health score:
    the bright areas are then the ones that pulled the score down."""

    def __call__(self, model_output):
        return -model_output[0]


def heatmap_overlay(model, input_tensor, panel_rgb_uint8, meta=None):
    """Return the panel photo with the heat map on it (RGB, uint8).

    model            a PanelModel in eval mode
    input_tensor     the normalised network input, shape (1, 3, H, W)
    panel_rgb_uint8  the same panel as a plain image, shape (H, W, 3), uint8
    meta             (1, 2) tensor with age and capacity, only if the model was trained with them
    """
    wrapper = _HealthOnly(model, meta).eval()
    target_layer = model.backbone.layer4[-1]     # the last block of the ResNet
    cam = GradCAM(model=wrapper, target_layers=[target_layer])
    heat = cam(input_tensor=input_tensor, targets=[_LowerScoreTarget()])[0]   # (H, W), values 0..1
    base = panel_rgb_uint8.astype(np.float32) / 255.0
    return show_cam_on_image(base, heat, use_rgb=True, image_weight=0.55)
