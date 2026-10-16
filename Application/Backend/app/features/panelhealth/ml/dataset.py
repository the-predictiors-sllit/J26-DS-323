"""dataset.py - turns rows of the clean CSV into (image, extras, targets) for PyTorch.

Targets for each photo:
  * health score   = (100 - severity) / 100        (your hand score, flipped so higher = healthier)
  * output percent = Health_Percentage / 100       (measured output / rated capacity)
  * soiling        = 1 if Surface_Soiling_Flag_YN is "Y" else 0
Extras (age, rated capacity) are returned too, but the image-only model ignores them.
"""
import albumentations as A
import numpy as np
import torch
from albumentations.pytorch import ToTensorV2
from torch.utils.data import Dataset

AGE_SCALE = 15.0        # years  -> roughly 0..1
CAPACITY_SCALE = 700.0  # watts  -> roughly 0..1


def get_transforms(train):
    """Training photos get small random changes; test photos are only normalised."""
    if train:
        return A.Compose([
            A.RandomBrightnessContrast(brightness_limit=0.2, contrast_limit=0.2, p=0.5),
            A.Rotate(limit=10, p=0.5),
            A.HorizontalFlip(p=0.5),
            A.Normalize(),      # ImageNet mean/std, matching the pretrained backbone
            ToTensorV2(),
        ])
    return A.Compose([A.Normalize(), ToTensorV2()])


class PanelDataset(Dataset):
    def __init__(self, df, cache, train):
        self.df = df.reset_index(drop=True)
        self.cache = cache          # {image path: preprocessed RGB array}
        self.tf = get_transforms(train)
        self.reg = np.stack([self.df.Health_Score_0_100.values / 100.0,
                             self.df.Health_Percentage.values / 100.0], axis=1).astype("float32")
        self.soil = self.df.Soiling_Target.values.astype("float32")
        self.meta = np.stack([self.df.Age_Years.values / AGE_SCALE,
                              self.df.Rated_Capacity_W.values / CAPACITY_SCALE], axis=1).astype("float32")

    def __len__(self):
        return len(self.df)

    def __getitem__(self, i):
        img = self.cache[self.df.Image_Path.iloc[i]]
        img = self.tf(image=img)["image"]
        return (img,
                torch.from_numpy(self.meta[i]),
                torch.from_numpy(self.reg[i]),
                torch.tensor(self.soil[i]))
