"""model.py - a pretrained ResNet backbone with two small output heads.

photo -> backbone -> 256-d features -> regression head  (health score, output percent; both 0..1)
                                    -> soiling head      (one logit; sigmoid gives the Y probability)

use_meta=False (default) is the image-only model. use_meta=True also feeds age and rated
capacity into the head, which is the ablation to compare against.
"""
import torch
import torch.nn as nn
from torchvision import models


def build_backbone(name, pretrained):
    if name == "resnet18":
        weights = models.ResNet18_Weights.IMAGENET1K_V1 if pretrained else None
        net, dim = models.resnet18(weights=weights), 512
    elif name == "resnet50":
        weights = models.ResNet50_Weights.IMAGENET1K_V2 if pretrained else None
        net, dim = models.resnet50(weights=weights), 2048
    else:
        raise ValueError(f"unknown backbone: {name}")
    net.fc = nn.Identity()   # drop the 1000-class ImageNet layer; keep the feature vector
    return net, dim


class PanelModel(nn.Module):
    def __init__(self, backbone="resnet18", use_meta=False, pretrained=True):
        super().__init__()
        self.backbone, dim = build_backbone(backbone, pretrained)
        self.use_meta = use_meta
        self.shared = nn.Sequential(
            nn.Linear(dim + (2 if use_meta else 0), 256),
            nn.ReLU(),
            nn.Dropout(0.3),
        )
        self.reg_head = nn.Linear(256, 2)    # [health score, output percent]
        self.soil_head = nn.Linear(256, 1)   # soiling logit

    def forward(self, img, meta=None):
        feats = self.backbone(img)
        if self.use_meta:
            feats = torch.cat([feats, meta], dim=1)
        h = self.shared(feats)
        return torch.sigmoid(self.reg_head(h)), self.soil_head(h).squeeze(1)
