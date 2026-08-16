from pathlib import Path
import json
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
SW = (ROOT / "sw.js").read_text(encoding="utf-8")
MANIFEST = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))


class ServiceWorkerContractTests(unittest.TestCase):
    def test_shell_cache_version_tracks_account_clarity_release(self):
        self.assertIn("const VERSION = 'liangli-v19'", SW)

    def test_manifest_uses_powy_brand(self):
        self.assertEqual(MANIFEST["name"], "Powy")
        self.assertEqual(MANIFEST["short_name"], "Powy")
        self.assertEqual(MANIFEST["icons"][0]["src"], "powy-power-192.png")
        self.assertEqual(MANIFEST["icons"][1]["src"], "powy-power-512.png")
        self.assertEqual(MANIFEST["icons"][2]["src"], "powy-power-maskable-512.png")

    def test_manifest_allows_ipad_rotation(self):
        self.assertNotIn("orientation", MANIFEST)

    def test_account_sync_module_is_precached_with_the_same_origin_shell(self):
        assets = SW.split("const ASSETS =", 1)[1].split("];", 1)[0]
        self.assertIn("'./account-sync.js'", assets)

    def test_versioned_manifest_request_is_precached_exactly(self):
        assets = SW.split("const ASSETS =", 1)[1].split("];", 1)[0]
        self.assertIn("'./manifest.json?v=14'", assets)
        self.assertNotIn("'./manifest.json',", assets)

    def test_cross_origin_api_requests_are_never_cached(self):
        compact = SW.replace(" ", "")
        self.assertIn("if(url.origin!==self.location.origin)return", compact)

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
        self.assertIn("const videoRequest = new Request(request.url)", SW)
        self.assertIn("cache.match(videoRequest)", SW)
        self.assertIn("fetch(videoRequest)", SW)
        self.assertIn("cache.put(videoRequest", SW)

    def test_service_worker_behavior(self):
        result = subprocess.run(
            ["node", str(ROOT / "tests" / "test_service_worker.js")],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_manifest_uses_ink_palette(self):
        self.assertEqual(MANIFEST["background_color"], "#0b0c0f")
        self.assertEqual(MANIFEST["theme_color"], "#0b0c0f")


if __name__ == "__main__":
    unittest.main()
