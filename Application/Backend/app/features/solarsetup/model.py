"""One binary DeepLabV3 model; sky=0, obstacle=1. No heuristic fallback."""

import io
import numpy as np
import torch
from PIL import Image
from torchvision.models.segmentation import (
    deeplabv3_resnet50,
    DeepLabV3_ResNet50_Weights,
)
from torchvision.transforms import functional as TF

MEAN = (0.485, 0.456, 0.406)
STD = (0.229, 0.224, 0.225)


def build_model(pretrained=False):
    if pretrained:
        model = deeplabv3_resnet50(weights=DeepLabV3_ResNet50_Weights.DEFAULT)
        model.classifier[4] = torch.nn.Conv2d(256, 2, 1)
        model.aux_classifier[4] = torch.nn.Conv2d(256, 2, 1)
    else:
        model = deeplabv3_resnet50(
            weights=None, weights_backbone=None, num_classes=2, aux_loss=True
        )
    return model


def tensor_image(image, size):
    return TF.normalize(
        TF.to_tensor(
            image.convert("RGB").resize((size, size), Image.Resampling.BILINEAR)
        ),
        MEAN,
        STD,
    )


def load_model(path_or_bytes, device="cpu"):
    source = (
        io.BytesIO(path_or_bytes) if isinstance(path_or_bytes, bytes) else path_or_bytes
    )
    ckpt = torch.load(source, map_location="cpu", weights_only=True)
    if ckpt.get("architecture") != "deeplabv3_resnet50_binary_v1" or ckpt.get(
        "classes"
    ) != ["sky", "obstacle"]:
        raise ValueError(
            "Choose best_model.pt created by the supplied training notebook."
        )
    model = build_model(False)
    model.load_state_dict(ckpt["state_dict"])
    model.to(device).eval()
    return model, ckpt


@torch.inference_mode()
def predict(model, image, size=512, device="cpu"):
    logits = model(tensor_image(image, size).unsqueeze(0).to(device))["out"]
    # Restore probability maps, then classify; preserve original geometry and dimensions.
    logits = torch.nn.functional.interpolate(
        logits, size=(image.height, image.width), mode="bilinear", align_corners=False
    )
    probability = logits.softmax(1)[0, 1].cpu().numpy()
    return Image.fromarray((probability >= 0.5).astype("uint8") * 255), probability


def overlay(image, mask):
    rgb = np.asarray(image.convert("RGB"), dtype=np.float32).copy()
    obs = np.asarray(mask) > 127
    rgb[obs] = rgb[obs] * 0.6 + np.array([255, 65, 45]) * 0.4
    return Image.fromarray(rgb.astype("uint8"))
