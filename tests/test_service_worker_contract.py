from pathlib import Path
import json
import unittest


ROOT = Path(__file__).resolve().parents[1]
SW = (ROOT / "sw.js").read_text(encoding="utf-8")
MANIFEST = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))


class ServiceWorkerContractTests(unittest.TestCase):
    def test_posters_are_precached(self):
        for character in ("cat", "human"):
            for state in ("idle", "content", "tired", "exhausted"):
                self.assertIn(f"./assets/power-{character}/{state}.webp", SW)

    def test_mp4s_are_not_install_precached(self):
        assets = SW.split("const ASSETS =", 1)[1].split("];", 1)[0]
        self.assertNotIn(".mp4", assets)

    def test_runtime_video_cache_exists(self):
        self.assertIn("VIDEO_CACHE", SW)
        self.assertIn("endsWith('.mp4')", SW)

    def test_runtime_video_cache_normalizes_range_requests(self):
        self.assertIn("const videoRequest = new Request(e.request.url)", SW)
        self.assertIn("cache.match(videoRequest)", SW)
        self.assertIn("fetch(videoRequest)", SW)
        self.assertIn("cache.put(videoRequest", SW)

    def test_current_caches_survive_activation(self):
        self.assertIn("k !== VERSION && k !== VIDEO_CACHE", SW)

    def test_manifest_uses_ink_palette(self):
        self.assertEqual(MANIFEST["background_color"], "#0b0c0f")
        self.assertEqual(MANIFEST["theme_color"], "#0b0c0f")


if __name__ == "__main__":
    unittest.main()
