"""API contract tests; no trained checkpoint or reference dataset required."""

import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from fastapi.testclient import TestClient
from PIL import Image
import backend


class BackendContractTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path_patch = patch.object(
            backend, "MODEL_PATH", Path(self.temp.name) / "missing.pt"
        )
        self.path_patch.start()
        backend.state.update(model=None, checkpoint=None, error=None)
        self.client = TestClient(backend.app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        backend.state.update(model=None, checkpoint=None, error=None)
        self.path_patch.stop()
        self.temp.cleanup()

    def test_missing_model_is_reported(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "model_missing")
        self.assertFalse(response.json()["model_loaded"])

    def test_missing_model_returns_503(self):
        response = self.client.post(
            "/segment", files={"photo": ("site.png", b"abc", "image/png")}
        )
        self.assertEqual(response.status_code, 503)

    def test_invalid_image_returns_400_when_model_is_ready(self):
        backend.state.update(model=object(), checkpoint={"epoch": 1, "size": 64})
        response = self.client.post(
            "/segment", files={"photo": ("site.png", b"invalid", "image/png")}
        )
        self.assertEqual(response.status_code, 400)

    def test_segment_contract_with_stub_prediction(self):
        # Stub verifies transport/geometry, NOT trained model accuracy.
        backend.state.update(model=object(), checkpoint={"epoch": 1, "size": 64})
        image = Image.new("RGB", (40, 30), "blue")
        content = io.BytesIO()
        image.save(content, format="PNG")
        with patch.object(
            backend, "predict", return_value=(Image.new("L", image.size, 0), None)
        ):
            response = self.client.post(
                "/segment",
                files={"photo": ("site.png", content.getvalue(), "image/png")},
            )
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual((result["width"], result["height"]), (40, 30))
        self.assertEqual(result["filename"], "site_predicted.png")
        self.assertTrue(result["mask"].startswith("data:image/png;base64,"))
        self.assertEqual(result["labels"], {"0": "sky", "255": "obstacle"})

    def test_default_path_is_relative_to_backend_file(self):
        # Independent of this test's deliberately patched MODEL_PATH.
        self.assertEqual(backend.PROJECT_ROOT, Path(backend.__file__).resolve().parent)


if __name__ == "__main__":
    unittest.main()
