"""Map sky directions to an upward-facing circular 180-degree fisheye disk.

Image top is not automatically North. north_offset_deg specifies the position of
North clockwise from image top. Handedness is explicit because upward views and
camera exports can be mirrored. No arbitrary crop/resize/rotation is performed.
"""

import numpy as np
from .schema import SolarSettings


class SkyMask:
    def __init__(self, mask, settings: SolarSettings):
        self.mask = np.asarray(mask)
        if self.mask.ndim != 2 or min(self.mask.shape) < 64:
            raise ValueError("Use a grayscale binary mask at least 64×64 pixels.")
        if not np.isin(self.mask, [0, 255]).all():
            raise ValueError(
                "Mask must contain only black 0 (sky) and white 255 (obstacle)."
            )
        self.settings = settings
        h, w = self.mask.shape
        self.cx = settings.center_x * (w - 1)
        self.cy = settings.center_y * (h - 1)
        self.radius = settings.radius * (min(w, h) - 1)
        if self.radius < 16:
            raise ValueError("Horizon radius is too small.")
        # The entire horizon must be present: never silently treat unseen sky as clear.
        if min(self.cx, self.cy, w - 1 - self.cx, h - 1 - self.cy) < self.radius - 1e-6:
            raise ValueError(
                "The full horizon circle must fit inside the image. Correct the center/radius or use a complete 180° export."
            )

    def project(self, zenith_deg, azimuth_deg):
        theta = np.deg2rad(np.asarray(zenith_deg))
        if self.settings.projection == "equisolid":
            radial = self.radius * np.sin(theta / 2) / np.sin(np.pi / 4)
        else:
            radial = self.radius * theta / (np.pi / 2)
        sign = 1 if self.settings.azimuth_clockwise else -1
        angle = np.deg2rad(
            self.settings.north_offset_deg + sign * np.asarray(azimuth_deg)
        )
        return self.cx + radial * np.sin(angle), self.cy - radial * np.cos(angle)

    def visible(self, zenith_deg, azimuth_deg):
        zenith, azimuth = np.broadcast_arrays(zenith_deg, azimuth_deg)
        x, y = self.project(zenith, azimuth)
        good = (zenith >= 0) & (zenith <= 90) & np.isfinite(x) & np.isfinite(y)
        # Index clipping only handles numerical edge rounding; circle fit is validated.
        ix = np.clip(np.rint(x).astype(int), 0, self.mask.shape[1] - 1)
        iy = np.clip(np.rint(y).astype(int), 0, self.mask.shape[0] - 1)
        return good & (self.mask[iy, ix] == 0)


def direction_vectors(zenith_deg, azimuth_deg):
    """East, North, Up unit vectors. Panel normal uses tilt as its zenith."""
    z, a = np.deg2rad(zenith_deg), np.deg2rad(azimuth_deg)
    return np.stack([np.sin(z) * np.sin(a), np.sin(z) * np.cos(a), np.cos(z)], axis=-1)


def sky_quadrature(sky: SkyMask, step=3):
    """Midpoint solid-angle quadrature; uniform sky radiance = DHI/pi.

    This is angular integration, NOT a fisheye pixel-area fraction.
    """
    edges = np.arange(0, 90 + step, step, dtype=float)
    azimuth = np.arange(step / 2, 360, step)
    zenith = (edges[:-1] + edges[1:]) / 2
    z, a = np.meshgrid(zenith, azimuth, indexing="ij")
    solid_angle = np.repeat(
        (np.cos(np.deg2rad(edges[:-1])) - np.cos(np.deg2rad(edges[1:])))
        * np.deg2rad(step),
        len(azimuth),
    )
    z, a = z.ravel(), a.ravel()
    return direction_vectors(z, a), solid_angle / np.pi * sky.visible(z, a)
