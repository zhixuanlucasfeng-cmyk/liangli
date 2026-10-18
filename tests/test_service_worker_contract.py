from pathlib import Path
import json
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
SW = (ROOT / "sw.js").read_text(encoding="utf-8")
MANIFEST = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))


class ServiceWorkerContractTests(unittest.TestCase):
    def test_shell_cache_version_tracks_account_clarity_release(self):
        self.assertIn("const VERSION = 'liangli-v25'", SW)

    def test_manifest_uses_powy_brand(self):
        self.assertEqual(MANIFEST["name"], "Powvy Habit")
        self.assertEqual(MANIFEST["short_name"], "Powvy Habit")
        self.assertEqual(MANIFEST["icons"][0]["src"], "app-icon.png")

    def test_manifest_allows_ipad_rotation(self):
        self.assertNotIn("orientation", MANIFEST)

    def test_account_sync_module_is_precached_with_the_same_origin_shell(self):
        assets = SW.split("const ASSETS =", 1)[1].split("];", 1)[0]
        self.assertIn("'./account-sync.js'", assets)

    def test_versioned_manifest_request_is_precached_exactly(self):
        assets = SW.split("const ASSETS =", 1)[1].split("];", 1)[0]
        self.assertIn("'./manifest.json?v=25'", assets)
        self.assertNotIn("'./manifest.json',", assets)

    def test_cross_origin_api_requests_are_never_cached(self):
        compact = SW.replace(" ", "")
        self.assertIn("if(url.origin!==self.location.origin)return", compact)

    def test_clean_assets_are_precached(self):
        for file in ("workspace.css", "workspace.js", "theme.js", "app-icon.png"):
            self.assertIn(file, SW)
        self.assertNotIn("assets/power-", SW)

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
        self.assertEqual(MANIFEST["background_color"], "#ded9cd")
        self.assertEqual(MANIFEST["theme_color"], "#ded9cd")


if __name__ == "__main__":
    unittest.main()
