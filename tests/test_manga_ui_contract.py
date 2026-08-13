from pathlib import Path
from html.parser import HTMLParser
import re
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / "index.html").read_text(encoding="utf-8")
ACCOUNT_SYNC = (ROOT / "account-sync.js").read_text(encoding="utf-8")


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


ACCOUNT_MODAL_HARNESS = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('let accountReturnFocus=');
const end = script.indexOf('async function signInAccount(', start);
assert.notEqual(start, -1, 'account modal controller must keep a return-focus target');
assert.notEqual(end, -1, 'account modal controller must expose global auth actions');

const focused=[];
const app={inert:false,attrs:{},setAttribute(key,value){this.attrs[key]=value;},removeAttribute(key){delete this.attrs[key];}};
const opener={focus(){focused.push('opener');}};
const first={hidden:false,offsetParent:{},focus(){focused.push('first');}};
const close={hidden:false,offsetParent:{},focus(){focused.push('close');}};
const modal={hidden:true,attrs:{},contains(node){return node===close;},querySelectorAll(){return [first,close];},setAttribute(key,value){this.attrs[key]=value;},removeAttribute(key){delete this.attrs[key];}};
const elements=new Map([['accountModal',modal],['accountClose',close]]);
const document={activeElement:opener,body:{style:{}},querySelector(selector){return selector==='.app'?app:null;},getElementById(id){return elements.get(id);}};
const context={document,renderAccountPanel(){},abortAccountReconciliation(){},cancelStartEmpty(){},LiangliAccountSync:{createAccountReconciliationGate(){return {acquire(){return {};},owns(){return true;},release(){return true;}};}},setTimeout(fn){fn();}};
vm.createContext(context);
vm.runInContext(`${script.slice(start,end)}\n;globalThis.accountModal={openAccountPanel,closeAccountPanel,accountModalKeydown};`,context);

context.accountModal.openAccountPanel();
assert.equal(modal.hidden,false, 'opening makes the global account dialog visible');
assert.equal(app.inert,true, 'opening makes the application background inert');
assert.equal(app.attrs['aria-hidden'],'true');
assert.equal(focused.at(-1),'close', 'opening moves focus into the dialog');

let escaped=false;
context.accountModal.accountModalKeydown({key:'Escape',preventDefault(){escaped=true;}});
assert.equal(escaped,true, 'Escape is handled by the dialog controller');
assert.equal(modal.hidden,true, 'Escape closes the dialog');
assert.equal(app.inert,false, 'closing restores background interaction');
assert.equal(app.attrs['aria-hidden'],undefined);
assert.equal(focused.at(-1),'opener', 'closing restores focus to the opener');

context.accountModal.openAccountPanel();
document.activeElement=first;let shiftTrapped=false;
context.accountModal.accountModalKeydown({key:'Tab',shiftKey:true,preventDefault(){shiftTrapped=true;}});
assert.equal(shiftTrapped,true, 'Shift+Tab from the first ordinary-dialog control is trapped');
assert.equal(focused.at(-1),'close', 'Shift+Tab moves focus to the last ordinary-dialog control');
document.activeElement=close;let forwardTrapped=false;
context.accountModal.accountModalKeydown({key:'Tab',shiftKey:false,preventDefault(){forwardTrapped=true;}});
assert.equal(forwardTrapped,true, 'Tab from the last ordinary-dialog control is trapped');
assert.equal(focused.at(-1),'first', 'Tab moves focus to the first ordinary-dialog control');
"""

WELCOME_MODAL_HARNESS = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('let welcomeReturnFocus=');
const end = script.indexOf('function coreId(', start);
assert.notEqual(start, -1, 'welcome modal must own focus restoration');
assert.notEqual(end, -1);
const focused=[],storage=new Map();
const app={inert:false,attrs:{},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];}};
const opener={focus(){focused.push('opener');}},first={focus(){focused.push('first');}},last={focus(){focused.push('last');}};
const welcome={hidden:true,querySelectorAll(){return [first,last];}};
const account={hidden:true};
const elements=new Map([['accountWelcome',welcome],['accountModal',account]]);
const document={activeElement:opener,body:{style:{}},querySelector(s){return s==='.app'?app:null;},getElementById(id){return elements.get(id);}};
const context={document,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},LiangliAccountSync:{createCoreRecoveryStore(){return {list(){return [];},restore(){},save(){}};}},setTimeout:fn=>fn(),renderAccountPanel(){}};
vm.createContext(context);
vm.runInContext(`${script.slice(start,end)}\n;globalThis.welcome={showAccountWelcome,continueOnThisDevice,welcomeModalKeydown,openAccountPanel};`,context);
context.welcome.showAccountWelcome();
assert.equal(welcome.hidden,false);assert.equal(app.inert,true);assert.equal(focused.at(-1),'first');
document.activeElement=first;let reverseTrapped=false;context.welcome.welcomeModalKeydown({key:'Tab',shiftKey:true,preventDefault(){reverseTrapped=true;}});
assert.equal(reverseTrapped,true);assert.equal(focused.at(-1),'last');
document.activeElement=last;let trapped=false;context.welcome.welcomeModalKeydown({key:'Tab',shiftKey:false,preventDefault(){trapped=true;}});
assert.equal(trapped,true);assert.equal(focused.at(-1),'first');
let escaped=false;context.welcome.welcomeModalKeydown({key:'Escape',preventDefault(){escaped=true;}});
assert.equal(escaped,true);assert.equal(storage.get('ll_accountWelcomeSeen'),'1');assert.equal(welcome.hidden,true);assert.equal(app.inert,false);assert.equal(focused.at(-1),'opener');
storage.delete('ll_accountWelcomeSeen');context.welcome.showAccountWelcome();context.welcome.openAccountPanel();assert.equal(account.hidden,true,'account modal cannot open behind welcome');
"""

ACCOUNT_STATUS_HARNESS = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('let accountReturnFocus=');
const end = script.indexOf('async function beginAccountFirstLogin(', start);
const status={textContent:''};
const ids=['accountEmail','accountPassword','accountSignIn','accountSignUp','accountRecover','accountSignOut','accountSyncNow','copyLocalFlashcards','accountFirstLoginChoices','accountPasswordReset','accountUpdatePassword','coreRecoveryItems'];
const elements=new Map(ids.map(id=>[id,{disabled:false,hidden:false,textContent:'',innerHTML:'',setAttribute(){}}]));
elements.set('accountSyncStatus',status);
const document={body:{style:{}},activeElement:null,querySelector(){return {inert:false,setAttribute(){},removeAttribute(){}};},getElementById:id=>elements.get(id)};
const context={document,navigator:{onLine:true},AccountClient:{generation:1,session:{user:{id:'u1',email:'owner@example.test'}},isConfigured(){return true;}},LiangliAccountSync:{createAccountReconciliationGate(){return {acquire(){return {};},owns(){return true;},release(){return true;}};},createCoreRecoveryStore(){return {list(){return [];},restore(){},save(){}};}},T:key=>key,esc:value=>String(value),setTimeout(){}};
vm.createContext(context);
vm.runInContext(`${script.slice(start,end)}\n;globalThis.accountStatus={setAccountPanelError,renderAccountPanel};`,context);
context.accountStatus.setAccountPanelError('cloud validation failed');
context.accountStatus.renderAccountPanel();
assert.equal(status.textContent,'cloud validation failed','rendering the signed-in panel preserves an explicit initialized-login error in its live region');
"""

ACCOUNT_UNCONFIGURED_HARNESS = r"""
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const start = script.indexOf('let accountReturnFocus=');
const end = script.indexOf('async function beginAccountFirstLogin(', start);
const ids=['accountEmail','accountPassword','accountSignIn','accountSignUp','accountRecover','accountSignOut','accountSyncNow','copyLocalFlashcards','accountFirstLoginChoices','accountPasswordReset','accountUpdatePassword','coreRecoveryItems','accountSyncStatus'];
const elements=new Map(ids.map(id=>[id,{disabled:false,hidden:false,textContent:'',innerHTML:'',setAttribute(){}}]));
const document={body:{style:{}},activeElement:null,querySelector(){return {inert:false,setAttribute(){},removeAttribute(){}};},getElementById:id=>elements.get(id)};
const context={document,navigator:{onLine:true},AccountClient:{generation:0,session:null,isConfigured(){return false;}},LiangliAccountSync:{createAccountReconciliationGate(){return {acquire(){return {};},owns(){return true;},release(){return true;}};},createCoreRecoveryStore(){return {list(){return [];},restore(){},save(){}};}},T:key=>key,esc:value=>String(value),setTimeout(){}};
vm.createContext(context);
vm.runInContext(`${script.slice(start,end)}\n;globalThis.renderAccountPanel=renderAccountPanel;`,context);
context.renderAccountPanel();
assert.equal(elements.get('accountEmail').disabled,false,'email stays editable so users can prepare account credentials');
assert.equal(elements.get('accountPassword').disabled,false,'password stays editable so users can prepare account credentials');
assert.equal(elements.get('accountSignIn').disabled,true,'network auth remains unavailable until a backend is configured');
assert.equal(elements.get('accountSignUp').disabled,true,'registration remains unavailable until a backend is configured');
"""


class MangaUIContractTests(unittest.TestCase):
    def test_user_visible_brand_is_powy_while_storage_protocol_stays_compatible(self):
        self.assertIn('<title>Powy</title>', HTML)
        self.assertIn('<div class="logo"><img src="powy-power-192.png" alt=""></div>', HTML)
        self.assertIn('<h1 id="appName">Powy</h1>', HTML)
        self.assertNotIn('量力', HTML)
        self.assertIn('LiangliAccountSync', HTML)
        self.assertIn('liangli-flashcards-v1', HTML)

    def test_nutrition_summary_prioritizes_remaining_calories(self):
        for element_id in ('calorieRemainingValue', 'calorieConsumedValue', 'calorieTargetValue'):
            self.assertIn(f'id="{element_id}"', HTML)
        compact = HTML.replace(' ', '')
        self.assertIn("calorieRemainingValue').textContent=String(summary.remaining)", compact)
        self.assertIn("classList.toggle('is-negative',summary.remaining<0)", compact)

    def test_profile_appearance_controls_are_local_and_accessible(self):
        for element_id in ('profileAvatar', 'avatarFile', 'wallpaperFile', 'resetAvatar', 'resetWallpaper', 'appearanceStatus'):
            self.assertIn(f'id="{element_id}"', HTML)
        self.assertRegex(HTML, r'id="avatarFile"[^>]*accept="image/\*"')
        self.assertRegex(HTML, r'id="wallpaperFile"[^>]*accept="image/\*"')
        for fragment in ('powy-profile-v1', 'indexedDB.open', 'new Image()', 'image.naturalWidth', 'URL.revokeObjectURL'):
            self.assertIn(fragment, HTML)

    def test_account_field_translation_does_not_delete_inputs(self):
        self.assertIn('<label for="accountEmail"><span data-i="emailLabel">', HTML)
        self.assertIn('<label for="accountPassword"><span data-i="passwordLabel">', HTML)
        self.assertNotIn('<label for="accountEmail" data-i=', HTML)

    def test_ipad_layout_fills_viewport_and_uses_landscape_columns(self):
        compact = re.sub(r'\s+', '', HTML)
        self.assertIn('@media(min-width:768px)', compact)
        self.assertIn('.app{max-width:none;', compact)
        self.assertIn('@media(min-width:1024px)and(orientation:landscape)', compact)
        self.assertIn('#lifeNutrition{grid-template-columns:minmax(0,1fr)minmax(0,1fr)', compact)

    def test_document_declares_a_favicon(self):
        self.assertRegex(
            HTML,
            r'<link\s+rel="icon"\s+href="powy-power-192\.png">',
        )
        self.assertIn('<link rel="manifest" href="manifest.json?v=13">', HTML)

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
        self.assertIn("constSUPABASE_URL='https://rczhmavbzppssffgdnoh.supabase.co'", compact)
        self.assertRegex(compact, r"constSUPABASE_ANON_KEY='eyJ[A-Za-z0-9_.-]{100,}'")
        self.assertNotIn("service_role", HTML.lower())
        self.assertIn('id="accountModal"', HTML)
        self.assertIn('id="accountSyncNow"', HTML)
        self.assertNotIn('id="flashcardAccountPanel"', HTML)
        self.assertNotIn("cdn.jsdelivr.net", HTML)
        self.assertIn('Content-Security-Policy', HTML)
        for method in ("isConfigured", "restoreSession", "signIn", "signUp", "signOut"):
            self.assertRegex(HTML, rf"\b{method}\(")
        self.assertIn("AccountClient.configure", HTML)
        self.assertIn("createOwnerRestClient", HTML)
        self.assertIn("async recover", ACCOUNT_SYNC)
        self.assertIn("async consumeAuthRedirect", ACCOUNT_SYNC)
        self.assertIn("liangli-auth-refresh", ACCOUNT_SYNC)
        self.assertIn("helperRefs", HTML)
        self.assertIn("flashCopyMap_", HTML)
        self.assertIn("addEventListener('storage'", HTML)
        self.assertIn("passwordRecovery_", HTML)
        self.assertIn("readAccountRecoveryMode(session)", HTML)
        self.assertRegex(HTML, r"handleAccountSessionChange\(session\)[\s\S]{0,400}accountRecoveryMode=session\?readAccountRecoveryMode\(session\):false")
        self.assertIn("writeAccountRecoveryMode(AccountClient.session,false)", HTML)

    def test_global_account_onboarding_is_accessible_and_bilingual(self):
        for element_id in (
            'accountAvatar', 'accountWelcome', 'accountWelcomeContinue', 'accountModal',
            'accountClose', 'accountEmail', 'accountPassword', 'accountSignIn',
            'accountSignUp', 'accountRecover', 'accountSignOut', 'accountSyncStatus',
            'accountPasswordReset', 'accountNewPassword', 'accountUpdatePassword',
            'accountFirstLoginChoices', 'accountStartEmptyConfirm', 'coreRecoveryList',
        ):
            self.assertIn(f'id="{element_id}"', HTML)
        self.assertRegex(HTML, r'<button\b(?=[^>]*\bid="accountAvatar")(?=[^>]*\baria-label=)[^>]*>')
        self.assertRegex(HTML, r'<label\b[^>]*\bfor="accountEmail"')
        self.assertRegex(HTML, r'<label\b[^>]*\bfor="accountPassword"')
        self.assertRegex(HTML, r'<label\b[^>]*\bfor="accountNewPassword"')
        self.assertIn('role="dialog"', HTML)
        self.assertIn('aria-modal="true"', HTML)
        start_empty = re.search(r'function chooseStartEmpty\(\)[\s\S]*?\n}', HTML)
        self.assertIsNotNone(start_empty)
        self.assertNotIn('confirm(', start_empty.group(0))
        for key in ('accountWelcomeTitle', 'continueOnDevice', 'accountTitle', 'recoverPassword',
                    'resetPasswordTitle', 'updatePassword', 'passwordUpdated',
                    'uploadThisDevice', 'startEmpty', 'restoreToDevice'):
            self.assertEqual(len(re.findall(rf"\b{key}:", HTML)), 2)
        compact = HTML.replace(' ', '')
        for function_name in ('openAccountPanel', 'closeAccountPanel', 'signInAccount',
                              'signUpAccount', 'recoverAccount', 'signOutAccount',
                              'updateAccountPassword', 'initializeAccount',
                              'chooseUploadDevice', 'chooseStartEmpty', 'restoreCoreRecovery'):
            self.assertIn(f'function{function_name}(', compact)

    def test_global_account_modal_keyboard_behavior(self):
        result = subprocess.run(
            ['node', '-e', ACCOUNT_MODAL_HARNESS], cwd=ROOT, text=True,
            capture_output=True, timeout=5, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_unconfigured_account_fields_remain_editable(self):
        result = subprocess.run(
            ['node', '-e', ACCOUNT_UNCONFIGURED_HARNESS], cwd=ROOT, text=True,
            capture_output=True, timeout=5, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_welcome_modal_keyboard_behavior(self):
        result = subprocess.run(['node', '-e', WELCOME_MODAL_HARNESS], cwd=ROOT, text=True,
                                capture_output=True, timeout=5, check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_initialized_login_error_survives_account_panel_render(self):
        result = subprocess.run(['node', '-e', ACCOUNT_STATUS_HARNESS], cwd=ROOT, text=True,
                                capture_output=True, timeout=5, check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

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
