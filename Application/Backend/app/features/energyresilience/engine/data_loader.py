"""Loads the settings file for the Energy Resilience feature."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]      # the energyresilience feature folder
ASSETS = ROOT / "assets"                        # config, solar profile, home-use profile, one-year results


def load_config(path=None):
    """Read assets/config.json (battery, PV, tariff, preference profiles)."""
    path = Path(path) if path else ASSETS / "config.json"
    with open(path) as f:
        return json.load(f)
