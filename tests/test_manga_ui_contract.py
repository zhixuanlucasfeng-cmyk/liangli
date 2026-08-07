from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "index.html").read_text(encoding="utf-8")


class MangaUIContractTests(unittest.TestCase):
    def test_load_thresholds_are_unchanged(self):
        self.assertIn(
            "used===0 ? 'idle' : used>max ? 'exhausted' : used>max*0.8 ? 'tired' : 'content'",
            HTML,
        )

    def test_all_five_views_have_manga_identity(self):
        for view in ("today", "pool", "goals", "focus", "journal"):
            self.assertRegex(HTML, rf'<section class="view manga-view [^"]*" id="v-{view}"')

    def test_visual_tokens_exist(self):
        compact = HTML.replace(" ", "")
        for token in (
            "--ink:#0b0c0f", "--paper:#ede6d8", "--blood:#d92d45",
            "--power-pink:#ff5f8f", "--warning:#f1c84b"
        ):
            self.assertIn(token, compact)

    def test_accessible_companion_stage_contract(self):
        companion_videos = re.findall(
            r'<video\b[^>]*\bclass="[^"]*\bcompanion-video\b[^"]*"', HTML
        )
        self.assertEqual(len(companion_videos), 2)
        self.assertIn('id="companionPoster"', HTML)
        self.assertIn('id="companionStatus"', HTML)
        self.assertIn('aria-live="polite"', HTML)

    def test_companion_video_matcher_allows_additional_classes(self):
        fixture = (
            '<video class="companion-video"></video>'
            '<video class="companion-video is-active"></video>'
        )
        companion_videos = re.findall(
            r'<video\b[^>]*\bclass="[^"]*\bcompanion-video\b[^"]*"', fixture
        )
        self.assertEqual(len(companion_videos), 2)

    def test_reduced_motion_css_contract(self):
        self.assertIn("@media(prefers-reduced-motion:reduce)", HTML.replace(" ", ""))

    def test_reduced_motion_playback_contract(self):
        self.assertIn("matchMedia('(prefers-reduced-motion: reduce)')", HTML)

    def test_manga_decorations_are_noninteractive(self):
        self.assertIn(".manga-decor{pointer-events:none", HTML.replace(" ", ""))
        self.assertIn('aria-hidden="true"', HTML)

    def test_keyframes_do_not_animate_clip_path(self):
        keyframe_bodies = re.findall(
            r"@keyframes\s+[\w-]+\s*\{((?:[^{}]|\{[^{}]*\})*)\}", HTML
        )
        self.assertTrue(keyframe_bodies)
        for body in keyframe_bodies:
            self.assertNotIn("clip-path", body)

    def test_view_has_one_transition_definition(self):
        view_transitions = re.findall(
            r"\.view\.active\s*\{[^}]*\banimation\s*:", HTML
        )
        self.assertEqual(len(view_transitions), 1)


if __name__ == "__main__":
    unittest.main()
