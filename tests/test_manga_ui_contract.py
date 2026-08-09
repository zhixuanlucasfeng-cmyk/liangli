from pathlib import Path
from html.parser import HTMLParser
import re
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "index.html").read_text(encoding="utf-8")


class HiddenAncestorParser(HTMLParser):
    VOID_ELEMENTS = {
        "area", "base", "br", "col", "embed", "hr", "img", "input",
        "link", "meta", "param", "source", "track", "wbr",
    }

    def __init__(self, target_id):
        super().__init__()
        self.target_id = target_id
        self.stack = []
        self.found = False
        self.hidden_ancestors = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if attributes.get("id") == self.target_id:
            self.found = True
            self.hidden_ancestors = [
                frame["id"] or frame["tag"]
                for frame in self.stack
                if frame["hidden"]
            ]
        if tag not in self.VOID_ELEMENTS:
            self.stack.append(
                {"tag": tag, "id": attributes.get("id"), "hidden": "hidden" in attributes}
            )

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID_ELEMENTS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index]["tag"] == tag:
                del self.stack[index:]
                return


def hidden_ancestors_for_id(markup, target_id):
    parser = HiddenAncestorParser(target_id)
    parser.feed(markup)
    if not parser.found:
        raise AssertionError(f"Missing target element: {target_id}")
    return parser.hidden_ancestors


LIFE_TAB_HARNESS = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('const LIFE_TABS=');
const end = script.indexOf('function go(', start);
assert.notEqual(start, -1, 'Life tab controller must exist');
assert.notEqual(end, -1, 'Life tab controller must precede primary navigation');

const names = ['nutrition', 'wallet', 'journal'];
const elements = new Map();
const focused = [];
for (const name of names) {
  const title = name[0].toUpperCase() + name.slice(1);
  const button = {
    id: `lifeTab${title}`,
    attributes: {},
    tabIndex: -1,
    setAttribute(key, value) { this.attributes[key] = value; },
    focus() { focused.push(this.id); },
  };
  const panel = {id: `life${title}`, hidden: true};
  elements.set(button.id, button);
  elements.set(panel.id, panel);
}
const document = {getElementById(id) { return elements.get(id); }};
const context = {document};
vm.createContext(context);
vm.runInContext(
  `${script.slice(start, end)}\n;globalThis.lifeTabs={setLifeTab,handleLifeTabKeydown};`,
  context,
);
const controller = context.lifeTabs;

function press(key) {
  const event = {key, prevented: 0, preventDefault() { this.prevented += 1; }};
  controller.handleLifeTabKeydown(event);
  return event;
}
function selected(name) {
  const title = name[0].toUpperCase() + name.slice(1);
  return elements.get(`lifeTab${title}`).attributes['aria-selected'];
}

controller.setLifeTab('nutrition', false);
let event = press('ArrowLeft');
assert.equal(event.prevented, 1, 'handled arrows prevent page scrolling');
assert.equal(selected('journal'), 'true', 'ArrowLeft wraps to the last tab');
assert.equal(focused.at(-1), 'lifeTabJournal');
assert.equal(elements.get('lifeJournal').hidden, false);

event = press('ArrowRight');
assert.equal(event.prevented, 1);
assert.equal(selected('nutrition'), 'true', 'ArrowRight wraps to the first tab');
assert.equal(focused.at(-1), 'lifeTabNutrition');

controller.setLifeTab('wallet', false);
event = press('End');
assert.equal(event.prevented, 1);
assert.equal(selected('journal'), 'true', 'End activates the last tab');
assert.equal(focused.at(-1), 'lifeTabJournal');

event = press('Home');
assert.equal(event.prevented, 1);
assert.equal(selected('nutrition'), 'true', 'Home activates the first tab');
assert.equal(focused.at(-1), 'lifeTabNutrition');

const focusCount = focused.length;
event = press('Tab');
assert.equal(event.prevented, 0, 'unhandled keys keep native behavior');
assert.equal(focused.length, focusCount);
assert.equal(selected('nutrition'), 'true');
"""


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

    def test_flashcard_overlay_is_accessible_and_complete(self):
        self.assertIn('id="flashcardOverlay"', HTML)
        self.assertIn('role="dialog"', HTML)
        self.assertIn('aria-modal="true"', HTML)
        for element_id in (
            "flashcardClose", "flashcardSyncBadge", "deckList", "deckName",
            "cardFront", "cardBack", "reviewPanel", "reviewFront", "reviewBack",
            "flashcardKeyboardHelp",
        ):
            self.assertIn(f'id="{element_id}"', HTML)
        for grade in ("again", "hard", "good", "easy"):
            self.assertIn(f'data-grade="{grade}"', HTML)
        for function_name in ("openFlashcards", "renderDecks", "startReview", "gradeCurrentCard"):
            self.assertIn(f"function {function_name}(", HTML)
        compact = HTML.replace(" ", "")
        self.assertIn("querySelector('.app').inert=true", compact)
        self.assertIn("querySelector('.app').inert=false", compact)
        self.assertIn("event.key==='Enter'&&event.target.id==='reviewCard'", compact)

    def test_flashcard_sync_is_optional_and_secret_safe(self):
        compact = HTML.replace(" ", "")
        self.assertIn("constSUPABASE_URL=''", compact)
        self.assertIn("constSUPABASE_ANON_KEY=''", compact)
        self.assertNotIn("service_role", HTML.lower())
        self.assertIn('id="flashcardAccountPanel"', HTML)
        self.assertIn('id="flashcardSyncNow"', HTML)
        self.assertNotIn("cdn.jsdelivr.net", HTML)
        self.assertIn('Content-Security-Policy', HTML)
        for method in ("isConfigured", "restoreSession", "signIn", "signUp", "signOut"):
            self.assertRegex(HTML, rf"\b{method}\(")
        self.assertIn("helperRefs", HTML)
        self.assertIn("flashCopyMap_", HTML)
        self.assertIn("liangli-auth-refresh", HTML)
        self.assertIn("addEventListener('storage'", HTML)

    def test_all_five_views_have_manga_identity(self):
        for view in ("today", "pool", "goals", "focus", "life"):
            self.assertRegex(HTML, rf'<section class="view manga-view [^"]*" id="v-{view}"')

    def test_life_hub_has_three_accessible_panels(self):
        self.assertIn(
            '<section class="view manga-view life-view" id="v-life">',
            HTML,
        )
        nav = re.search(r"<nav>([\s\S]*?)</nav>", HTML)
        self.assertIsNotNone(nav)
        self.assertEqual(len(re.findall(r"<button\b", nav.group(1))), 5)
        self.assertEqual(HTML.count('data-v="life"'), 1)
        self.assertNotIn('data-v="journal"', HTML)

        tabs = (
            ("lifeTabNutrition", "lifeNutrition"),
            ("lifeTabWallet", "lifeWallet"),
            ("lifeTabJournal", "lifeJournal"),
        )
        for tab_id, panel_id in tabs:
            self.assertRegex(
                HTML,
                rf'<button\b(?=[^>]*\bid="{tab_id}")(?=[^>]*\brole="tab")'
                rf'(?=[^>]*\baria-selected="(?:true|false)")'
                rf'(?=[^>]*\baria-controls="{panel_id}")'
                rf'(?=[^>]*\bonkeydown="handleLifeTabKeydown\(event\)")[^>]*>',
            )
            self.assertRegex(
                HTML,
                rf'<section\b(?=[^>]*\bid="{panel_id}")(?=[^>]*\brole="tabpanel")'
                rf'(?=[^>]*\baria-labelledby="{tab_id}")'
                rf'(?=[^>]*\btabindex="0")[^>]*>',
            )

        for journal_id in ("logText", "moodPick", "logList"):
            self.assertIn(f'id="{journal_id}"', HTML)
        for key in ("navLife", "nutritionTitle", "walletTitle"):
            self.assertEqual(len(re.findall(rf"\b{key}:", HTML)), 2)

        compact = HTML.replace(" ", "")
        for fragment in (
            ".life-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))",
            ".life-tab{min-height:44px",
            '.life-tab[aria-selected="true"]{background:#ff7f6b',
            "functionsetLifeTab(tab,focus=true)",
            "if(v==='life')setLifeTab(activeLifeTab,false)",
        ):
            self.assertIn(fragment, compact)

    def test_life_tab_keyboard_behavior(self):
        result = subprocess.run(
            ["node", "-e", LIFE_TAB_HARNESS],
            capture_output=True,
            check=False,
            text=True,
            timeout=5,
            cwd=ROOT,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_life_backup_controls_are_keyboard_accessible(self):
        for element_id in (
            "lifeBackupPanel", "lifeExportButton", "lifeImportButton", "lifeImportFile",
            "lifeImportPreview", "lifeImportConfirm", "lifeImportCancel", "lifeImportStatus",
        ):
            self.assertIn(f'id="{element_id}"', HTML)
        self.assertRegex(
            HTML,
            r'<button\b[^>]*\bid="lifeImportButton"[^>]*\bonclick="document\.getElementById\(\'lifeImportFile\'\)\.click\(\)"',
        )
        self.assertIn('data-i="lifeBackupTitle"', HTML)
        self.assertIn('data-i="importLifeData"', HTML)
        self.assertIn('role="status" aria-live="polite"', HTML)

    def test_nutrition_panel_contract(self):
        for element_id in (
            "calorieTarget", "foodName", "foodPortion", "foodCalories",
            "foodEatenAt", "foodTimeline", "nutritionPrevDate",
            "nutritionNextDate", "nutritionSummary", "foodEstimateControls",
        ):
            self.assertIn(f'id="{element_id}"', HTML)

        self.assertRegex(
            HTML,
            r'<input\b(?=[^>]*\bid="foodEatenAt")(?=[^>]*\btype="datetime-local")[^>]*>',
        )
        self.assertRegex(
            HTML,
            r'<div\b(?=[^>]*\bid="foodMode")(?=[^>]*\brole="radiogroup")'
            r'(?=[^>]*\baria-labelledby="foodModeLabel")[^>]*>',
        )
        for mode in ("manual", "estimate"):
            self.assertRegex(
                HTML,
                rf'<input\b(?=[^>]*\btype="radio")(?=[^>]*\bname="foodMode")'
                rf'(?=[^>]*\bvalue="{mode}")[^>]*>',
            )
        self.assertRegex(
            HTML,
            r'<[^>]+\bid="nutritionSummary"[^>]+\baria-live="polite"[^>]*>',
        )
        self.assertRegex(
            HTML,
            r'<div\b(?=[^>]*\bid="foodFormStatus")(?=[^>]*\brole="status")'
            r'(?=[^>]*\baria-live="polite")[^>]*>',
        )

        compact = HTML.replace(" ", "")
        for function_name in (
            "renderNutrition", "addFoodEntry", "deleteFoodEntry",
            "setFoodEntryForEdit", "applyFoodEstimate", "saveFavoriteFood",
        ):
            self.assertIn(f"function{function_name}(", compact)
        self.assertIn('<buttontype="button"class="food-action"', compact)
        self.assertNotIn('<divclass="food-action"', compact)

    def test_wallet_panel_contract(self):
        for element_id in (
            "budgetTotalAmount", "budgetSavingsPercent", "budgetStartDate",
            "budgetPeriodUnit", "budgetPeriodCount", "walletTotal",
            "walletSaved", "walletSpendable", "walletToday", "walletSpent",
            "expenseName", "expenseAmount", "expenseSpentAt", "expenseCategory",
            "expenseTimeline", "walletCycleEnd", "budgetCarryForward",
            "budgetRechargeTotal", "walletFormStatus", "walletExpenseAvailability",
        ):
            self.assertIn(f'id="{element_id}"', HTML)

        self.assertRegex(
            HTML,
            r'<input\b(?=[^>]*\bid="budgetSavingsPercent")'
            r'(?=[^>]*\btype="number")(?=[^>]*\bvalue="20")'
            r'(?=[^>]*\bmin="0")(?=[^>]*\bmax="100")[^>]*>',
        )
        self.assertRegex(
            HTML,
            r'<input\b(?=[^>]*\bid="budgetPeriodCount")'
            r'(?=[^>]*\btype="number")(?=[^>]*\bmin="1")[^>]*>',
        )
        self.assertRegex(
            HTML,
            r'<input\b(?=[^>]*\bid="expenseSpentAt")'
            r'(?=[^>]*\btype="datetime-local")[^>]*>',
        )
        self.assertRegex(
            HTML,
            r'<div\b(?=[^>]*\bid="walletFormStatus")(?=[^>]*\brole="status")'
            r'(?=[^>]*\baria-live="polite")[^>]*>',
        )
        self.assertRegex(
            HTML,
            r'<section\b(?=[^>]*\bid="walletCycleEnd")(?=[^>]*\bhidden)[^>]*>',
        )
        self.assertRegex(
            HTML,
            r'<[^>]+\bid="walletExpenseAvailability"[^>]+\brole="status"'
            r'[^>]+\baria-live="polite"[^>]*>',
        )
        for element_id in (
            "expenseName", "expenseAmount", "expenseSpentAt",
            "expenseCategory", "saveExpenseButton",
        ):
            self.assertRegex(
                HTML,
                rf'<[^>]+\bid="{element_id}"[^>]+\baria-describedby="walletExpenseAvailability"[^>]*>',
            )
        for mode in ("same", "recharge", "pause"):
            self.assertIn(f"renewBudgetCycle('{mode}'", HTML)

        compact = HTML.replace(" ", "")
        for function_name in (
            "createBudgetCycle", "renderWallet", "addExpense",
            "deleteExpense", "setExpenseForEdit", "renewBudgetCycle",
            "setExpenseControlsDisabled", "budgetRenewalStartDay",
        ):
            self.assertIn(f"function{function_name}(", compact)
        self.assertIn("newIntl.NumberFormat(", compact)
        self.assertIn("currency:'CNY'", compact)
        self.assertIn("moneyToCents(", compact)
        self.assertIn("DB.read('lifeState')", compact)
        self.assertRegex(compact, r"functionpersistWalletState\(\)\{\s*returnsaveLifeState\(\);\s*\}")

        wallet_controller = re.search(
            r"/\* ============ 钱包 ============ \*/(?P<body>[\s\S]*?)"
            r"/\* ============ 记录 ============ \*/",
            HTML,
        )
        self.assertIsNotNone(wallet_controller)
        self.assertNotRegex(wallet_controller.group("body"), r"\b(?:confirm|alert)\s*\(")

    def test_food_form_status_is_outside_initially_hidden_ancestors(self):
        self.assertEqual(hidden_ancestors_for_id(HTML, "foodFormStatus"), [])

        disclosure_start = HTML.index('id="foodEstimateControls"')
        disclosure_status = HTML.index('id="foodEstimateStatus"', disclosure_start)
        disclosure_status_end = HTML.index("</div>", disclosure_status) + len("</div>")
        disclosure_end = HTML.index("</div>", disclosure_status_end) + len("</div>")
        form_status = HTML.index('id="foodFormStatus"')
        self.assertLess(disclosure_end, form_status)

    def test_life_inputs_publish_canonical_bounds(self):
        bounds = {
            "calorieTarget": ('max="1000000"',),
            "foodCalories": ('max="1000000"',),
            "foodName": ('maxlength="500"',),
            "foodPortion": ('maxlength="500"',),
            "budgetTotalAmount": ('maxlength="14"',),
            "budgetRechargeTotal": ('maxlength="14"',),
            "budgetPeriodCount": ('max="10000"',),
            "expenseName": ('maxlength="500"',),
            "expenseAmount": ('maxlength="14"',),
            "expenseCategory": ('maxlength="120"',),
        }
        for element_id, attributes in bounds.items():
            tag = re.search(rf'<[^>]+\bid="{element_id}"[^>]*>', HTML)
            self.assertIsNotNone(tag, element_id)
            for attribute in attributes:
                self.assertIn(attribute, tag.group(0), f"{element_id} must expose {attribute}")

        for key in ("lifeStorageInvalid", "lifeStorageReadError"):
            self.assertIn(f'{key}:', HTML)

    def test_bilingual_catalogs_have_identical_keys(self):
        catalogs = re.search(
            r"const I18N=\{\s*zh:\{(?P<zh>[\s\S]*?)\},\s*en:\{(?P<en>[\s\S]*?)\}\s*\};",
            HTML,
        )
        self.assertIsNotNone(catalogs)

        def catalog_keys(source):
            return set(re.findall(r"(?:^|,)\s*([A-Za-z]\w*)\s*:", source))

        self.assertEqual(
            catalog_keys(catalogs.group("zh")),
            catalog_keys(catalogs.group("en")),
        )

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
