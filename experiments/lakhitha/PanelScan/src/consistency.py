"""consistency.py - make sure the app prepares photos exactly the way the model was trained.

The files that decide what the model sees (preprocessing.py, dataset.py, model.py) live in
experiments/.../src and are COPIED into the Backend (sync_to_backend.py). train_final.py stores a
fingerprint of each in the saved model; the Backend checks them when it loads the model. If a copy
was edited or not refreshed, loading stops with a clear message instead of silently giving wrong answers.
Plain Python only.
"""
import hashlib
from pathlib import Path

SHARED_FILES = ["preprocessing.py", "dataset.py", "model.py"]


def _digest(path):
    # line endings are ignored, so Windows and Linux copies of the same file match
    text = Path(path).read_text(encoding="utf-8").replace("\r\n", "\n")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def file_hashes(directory, names=None):
    """{file name: fingerprint} for the given files in a folder."""
    return {n: _digest(Path(directory) / n) for n in (names or SHARED_FILES)}


def mismatched_files(saved, directory):
    """Names of the files whose fingerprint differs from the one stored with the model."""
    current = file_hashes(directory, list(saved))
    return [n for n in saved if saved[n] != current[n]]
