from pathlib import Path
import re
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "index.html").read_text(encoding="utf-8")


class MangaUIContractTests(unittest.TestCase):
    def test_document_declares_a_favicon(self):
        self.assertRegex(
            HTML,
            r'<link\s+rel="icon"\s+href="icon-192\.png">',
        )

    def test_standalone_mode_has_standard_and_apple_metadata(self):
        self.assertIn('<meta name="mobile-web-app-capable" content="yes">', HTML)
        self.assertIn('<meta name="apple-mobile-web-app-capable" content="yes">', HTML)

    def test_companion_playback_behavior(self):
        result = subprocess.run(
            ["node", str(ROOT / "tests" / "test_companion_playback.js")],
            capture_output=True,
            check=False,
            text=True,
            timeout=5,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_load_thresholds_are_unchanged(self):
        self.assertIn(
            "used===0 ? 'idle' : used>max ? 'exhausted' : used>max*0.8 ? 'tired' : 'content'",
            HTML,
        )

    def test_daily_energy_uses_local_calendar_and_lifecycle_checks(self):
        compact = HTML.replace(" ", "")
        self.assertNotIn("newDate().toISOString().slice(0,10)", compact)
        for fragment in (
            "functionlocalDayKey",
            "functionrolloverIfNeeded",
            "functionscheduleNextRollover",
            "visibilitychange",
            "addEventListener('focus'",
            "dayKey:currentDayKey",
        ):
            self.assertIn(fragment, compact)

    def test_daily_rollover_behavior(self):
        result = subprocess.run(
            ["node", str(ROOT / "tests" / "test_daily_rollover.js")],
            capture_output=True,
            check=False,
            text=True,
            timeout=5,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_task_entry_has_optional_time_and_study_helpers(self):
        self.assertIn('id="taskMore"', HTML)
        self.assertIn('aria-controls="taskSchedule"', HTML)
        self.assertIn('id="taskSchedule"', HTML)
        self.assertRegex(HTML, r'<input\b[^>]*id="taskStartTime"[^>]*type="time"')
        self.assertRegex(HTML, r'<input\b[^>]*id="taskEndTime"[^>]*type="time"')
        self.assertIn('id="taskHelper"', HTML)
        for helper in ("none", "pomodoro", "flashcards", "quiz", "checklist"):
            self.assertIn(f'value="{helper}"', HTML)

    def test_all_five_views_have_manga_identity(self):
        for view in ("today", "pool", "goals", "focus", "journal"):
            self.assertRegex(HTML, rf'<section class="view manga-view [^"]*" id="v-{view}"')

    def test_growth_pool_entry_stacks_without_shrinking_touch_targets(self):
        compact = HTML.replace(" ", "")
        self.assertIn(".pool-entry-panel.row{flex-direction:column}", compact)
        self.assertIn(".pool-entry-panel.row.btn{width:100%}", compact)
        self.assertIn("button,input,textarea,select{min-height:44px}", compact)

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

    def test_playback_controller_is_race_safe(self):
        compact = HTML.replace(" ", "")
        for fragment in (
            "letcompanionRequestId=0",
            "constrequestId=++companionRequestId",
            "if(requestId!==companionRequestId)return",
            "canplay", "150", "stopLayer",
        ):
            self.assertIn(fragment, compact)

    def test_media_paths_keep_stable_names(self):
        self.assertIn("assets/power-${companion}/${state}.${extension}", HTML)

    def test_companion_status_localizes_character_and_state(self):
        compact = HTML.replace(" ", "")
        for key in ("companionIdle", "companionContent", "companionTired", "companionExhausted"):
            self.assertEqual(len(re.findall(rf"\b{key}:", HTML)), 2)
        self.assertIn("T(companion==='human'?'companionHuman':'companionCat')", compact)
        self.assertIn("T(companionStateKeys[state])", compact)

    def test_playback_invalidates_before_active_source_fast_path(self):
        compact = HTML.replace(" ", "")
        for fragment in (
            "functioncancelCompanionTransition()",
            "constrequestId=++companionRequestId",
            "cancelCompanionTransition()",
            "next._companionRequestId!==requestId",
            "catch(e)",
            "pendingCompanionSrc=''",
            "stopLayer(next)",
        ):
            self.assertIn(fragment, compact)
        self.assertNotIn(
            "if(requestId!==companionRequestId)returnstopLayer(next)", compact
        )

    def test_overload_animation_runs_only_on_state_entry(self):
        compact = HTML.replace(" ", "")
        for fragment in (
            "letpreviousCompanionState=null",
            "previousCompanionState!=='exhausted'",
            "classList.add('bursting')",
            "animationend",
            "classList.remove('bursting')",
        ):
            self.assertIn(fragment, compact)
        self.assertIn(
            "if(state!=='exhausted')warning.classList.remove('bursting')", compact
        )

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

    def test_theme_color_matches_manga_ink(self):
        self.assertIn('<meta name="theme-color" content="#0b0c0f">', HTML)

    def test_interactive_choices_and_rendered_actions_are_semantic(self):
        self.assertIn('id="energyPick" role="radiogroup" aria-labelledby="energyLabel"', HTML)
        self.assertIn('id="moodPick" role="radiogroup" aria-labelledby="moodLabel"', HTML)
        self.assertNotRegex(HTML, r'<div\b[^>]*\bdata-(?:e|m)=')
        for marker in ('class="chk"', 'class="x"'):
            self.assertNotIn(f'<div {marker}', HTML)
            self.assertIn(f'<button type="button" {marker}', HTML)
        self.assertIn("aria-checked", HTML)

    def test_mood_choices_include_localized_visible_names(self):
        for key in ('moodAwful', 'moodLow', 'moodNeutral', 'moodGood', 'moodGreat'):
            self.assertEqual(len(re.findall(rf"\b{key}:", HTML)), 2)
            self.assertIn(f'data-i="{key}"', HTML)

    def test_load_state_is_visible_and_localized(self):
        self.assertIn('id="loadState"', HTML)
        compact = HTML.replace(' ', '')
        self.assertIn("getElementById('loadState').textContent=T(companionStateKeys[state])", compact)

    def test_pomodoro_completion_has_short_reduced_motion_safe_burst(self):
        self.assertIn('id="pomoBurst"', HTML)
        self.assertIn("functiontriggerPomoBurst()", HTML.replace(' ', ''))
        self.assertRegex(HTML.replace(' ', ''), r"setTimeout\([^,]+,[1-4]\d\d\)")
        self.assertIn("if(reducedMotion.matches)return", HTML.replace(' ', ''))

    def test_goal_cards_have_deterministic_visible_chapters(self):
        compact = HTML.replace(' ', '')
        self.assertIn("S.goals.map((g,index)=>", compact)
        self.assertIn("String(index+1).padStart(2,'0')", compact)
        self.assertIn('class="chapter-number"', HTML)


if __name__ == "__main__":
    unittest.main()
