# Task Time and Study Helpers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional start/end times and a selectable study helper to each local task without making quick task entry slower.

**Architecture:** Preserve the single-file app. Extend the task schema through a normalization function, expose optional controls in a deterministic expandable panel, and route helper actions through one `openTaskHelper(taskId)` dispatcher.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, localStorage through `DB`, Node behavior tests, Python contract tests.

## Global Constraints

- Task name remains the only required field.
- Both times are optional; when both exist, end must be later than start.
- Cross-midnight tasks are rejected in this version.
- Task, time, energy, quiz, and checklist data remain local-only.
- Helpers are exactly `none`, `pomodoro`, `flashcards`, `quiz`, and `checklist`.
- Any `index.html` change increments the shell cache version.

---

### Task 1: Define task migration and validation

**Files:** Create `tests/test_task_helpers.js`; modify `tests/test_manga_ui_contract.py`; modify `index.html`.

**Interfaces:** Produces `normalizeTask(task, fallbackDay): Task`, `validateTaskTimes(startTime, endTime): boolean`.

- [ ] Write a Node test that expects a legacy task to gain `startTime:null`, `endTime:null`, `helper:'none'`, `helperRef:null`, and `pomodoroCount:0`; expect `validateTaskTimes('', '')` and `validateTaskTimes('09:00','10:00')` to pass and `validateTaskTimes('10:00','09:00')` to fail.
- [ ] Run `node tests/test_task_helpers.js`; confirm failure because the functions do not exist.
- [ ] Add the two pure functions before `S` initialization and normalize every loaded task.
- [ ] Run the Node test and full Python suite; expect PASS.
- [ ] Commit with `git commit -m "feat: migrate tasks for study helpers"`.

### Task 2: Build the optional task controls

**Files:** Modify `index.html`; modify `tests/test_manga_ui_contract.py`.

**Interfaces:** Consumes `validateTaskTimes`; produces form ids `taskStartTime`, `taskEndTime`, `taskHelper`, and `taskMore`.

- [ ] Add failing DOM assertions for a “更多安排” disclosure, two `type="time"` inputs, and a helper `<select>` containing all five stable values.
- [ ] Run the focused Python test; confirm it fails on missing controls.
- [ ] Add a collapsed manga panel below the energy chooser; reveal it with a semantic button and `aria-expanded`.
- [ ] Update `addTask()` to validate times, preserve input on failure, and store the normalized helper fields.
- [ ] Add matching Chinese/English strings and verify I18N key parity.
- [ ] Run the full suite and commit with `git commit -m "feat: add optional task time and helper fields"`.

### Task 3: Route helper actions and pomodoro attribution

**Files:** Modify `index.html`; modify `tests/test_task_helpers.js`.

**Interfaces:** Produces `openTaskHelper(taskId): void`, `activeTaskId: number|null`.

- [ ] Add failing tests that `openTaskHelper` selects the configured helper and that a completed pomodoro increments only the active task's `pomodoroCount`.
- [ ] Add a helper button and time label to task cards only when relevant.
- [ ] Route pomodoro tasks to the Focus view and persist `activeTaskId`; route other helpers to their local overlays.
- [ ] Update `finishPomo()` to increment the active task safely without changing global statistics behavior.
- [ ] Verify task CRUD, rollover, and timer tests; commit with `git commit -m "feat: connect tasks to study helpers"`.

### Task 4: Release verification

**Files:** Modify `sw.js`; modify `README.md`.

- [ ] Add a failing service-worker version assertion, then bump the shell cache by one.
- [ ] Document optional task times, local-only data, and helper routing.
- [ ] Run all Python/Node tests, inline JS syntax, `git diff --check`, and mobile browser QA at 375/390/440px.
- [ ] Commit with `git commit -m "docs: explain task study helpers"`.

