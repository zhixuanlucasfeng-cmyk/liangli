from pathlib import Path
import json
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]


class CompanionAssetTests(unittest.TestCase):
    def probe(self, path):
        result = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_streams", "-show_format",
                "-of", "json", str(path),
            ],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_every_character_state_has_a_crisp_square_silent_video(self):
        for character in ("human", "cat"):
            for state in ("idle", "content", "tired", "exhausted", "tap"):
                with self.subTest(character=character, state=state):
                    path = ROOT / "assets" / f"power-{character}" / f"{state}.mp4"
                    self.assertTrue(path.is_file(), f"missing companion video: {path}")
                    media = self.probe(path)
                    video = [stream for stream in media["streams"] if stream["codec_type"] == "video"]
                    audio = [stream for stream in media["streams"] if stream["codec_type"] == "audio"]
                    self.assertEqual(len(video), 1)
                    self.assertEqual(audio, [], f"{path} must not contain an audio track")
                    self.assertEqual(video[0]["width"], video[0]["height"])
                    self.assertGreaterEqual(video[0]["width"], 720)
                    duration = float(media["format"]["duration"])
                    self.assertGreaterEqual(duration, 2.0)
                    self.assertLessEqual(duration, 4.1)
                    self.assertLessEqual(int(media["format"]["size"]), 2_000_000)

    def test_human_idle_uses_high_frame_rate_for_smooth_looping(self):
        media = self.probe(ROOT / "assets" / "power-human" / "idle.mp4")
        video = next(
            stream for stream in media["streams"] if stream["codec_type"] == "video"
        )
        numerator, denominator = map(int, video["avg_frame_rate"].split("/"))
        self.assertGreaterEqual(numerator / denominator, 48)


if __name__ == "__main__":
    unittest.main()
