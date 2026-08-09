# Task 3 report — persist and normalize Life state

## Status

Completed and committed.

## Changes

- Added local Life state for calorie targets, food history, favorite foods, budget cycles, expenses, and the active budget cycle.
- Added `normalizeBudgetCycle` and `normalizeExpense`; malformed records are discarded and valid records receive safe defaults for optional budget values.
- Added `saveLifeState()`, which writes exactly the six Life-local keys, and invoked it from `renderAll()` so normalized state is retained.
- Kept food and budget data outside `syncFlashcards()` and out of `migrateDailyState()`.
- Added the Life storage contract test.

## Approved contract-boundary correction

The original test sliced from `syncFlashcards()` through `normalizeTaskDays`. That range included Task 1's pure nutrition helper `foodEntriesForDay`, even though it is not sync behavior. The user approved checking the real sync region only: the contract now ends the slice at `const OFFLINE_FOODS=`. Task 1's four nutrition functions remain in their approved position before `normalizeTaskDays`.

## RED

Before implementation:

```text
$ python3 -m unittest tests.test_life_store_contract -v
test_life_state_is_namespaced_and_local_only (tests.test_life_store_contract.LifeStoreContractTests.test_life_state_is_namespaced_and_local_only) ... FAIL

AssertionError: "DB.get('calorieTarget'" not found in index.html

Ran 1 test in 0.004s

FAILED (failures=1)
```

## GREEN — required verification

```text
$ python3 -m unittest tests.test_life_store_contract tests.test_manga_ui_contract -v && node tests/test_task_helpers.js
test_life_state_is_namespaced_and_local_only (tests.test_life_store_contract.LifeStoreContractTests.test_life_state_is_namespaced_and_local_only) ... ok
test_accessible_companion_stage_contract (tests.test_manga_ui_contract.MangaUIContractTests.test_accessible_companion_stage_contract) ... ok
test_all_five_views_have_manga_identity (tests.test_manga_ui_contract.MangaUIContractTests.test_all_five_views_have_manga_identity) ... ok
test_companion_playback_behavior (tests.test_manga_ui_contract.MangaUIContractTests.test_companion_playback_behavior) ... ok
test_companion_status_localizes_character_and_state (tests.test_manga_ui_contract.MangaUIContractTests.test_companion_status_localizes_character_and_state) ... ok
test_companion_video_matcher_allows_additional_classes (tests.test_manga_ui_contract.MangaUIContractTests.test_companion_video_matcher_allows_additional_classes) ... ok
test_daily_energy_uses_local_calendar_and_lifecycle_checks (tests.test_manga_ui_contract.MangaUIContractTests.test_daily_energy_uses_local_calendar_and_lifecycle_checks) ... ok
test_daily_rollover_behavior (tests.test_manga_ui_contract.MangaUIContractTests.test_daily_rollover_behavior) ... ok
test_document_declares_a_favicon (tests.test_manga_ui_contract.MangaUIContractTests.test_document_declares_a_favicon) ... ok
test_flashcard_overlay_is_accessible_and_complete (tests.test_manga_ui_contract.MangaUIContractTests.test_flashcard_overlay_is_accessible_and_complete) ... ok
test_flashcard_sync_is_optional_and_secret_safe (tests.test_manga_ui_contract.MangaUIContractTests.test_flashcard_sync_is_optional_and_secret_safe) ... ok
test_goal_cards_have_deterministic_visible_chapters (tests.test_manga_ui_contract.MangaUIContractTests.test_goal_cards_have_deterministic_visible_chapters) ... ok
test_growth_pool_entry_stacks_without_shrinking_touch_targets (tests.test_manga_ui_contract.MangaUIContractTests.test_growth_pool_entry_stacks_without_shrinking_touch_targets) ... ok
test_interactive_choices_and_rendered_actions_are_semantic (tests.test_manga_ui_contract.MangaUIContractTests.test_interactive_choices_and_rendered_actions_are_semantic) ... ok
test_keyframes_do_not_animate_clip_path (tests.test_manga_ui_contract.MangaUIContractTests.test_keyframes_do_not_animate_clip_path) ... ok
test_load_state_is_visible_and_localized (tests.test_manga_ui_contract.MangaUIContractTests.test_load_state_is_visible_and_localized) ... ok
test_load_thresholds_are_unchanged (tests.test_manga_ui_contract.MangaUIContractTests.test_load_thresholds_are_unchanged) ... ok
test_manga_decorations_are_noninteractive (tests.test_manga_ui_contract.MangaUIContractTests.test_manga_decorations_are_noninteractive) ... ok
test_media_paths_keep_stable_names (tests.test_manga_ui_contract.MangaUIContractTests.test_media_paths_keep_stable_names) ... ok
test_mood_choices_include_localized_visible_names (tests.test_manga_ui_contract.MangaUIContractTests.test_mood_choices_include_localized_visible_names) ... ok
test_overload_animation_runs_only_on_state_entry (tests.test_manga_ui_contract.MangaUIContractTests.test_overload_animation_runs_only_on_state_entry) ... ok
test_playback_controller_is_race_safe (tests.test_manga_ui_contract.MangaUIContractTests.test_playback_controller_is_race_safe) ... ok
test_playback_invalidates_before_active_source_fast_path (tests.test_manga_ui_contract.MangaUIContractTests.test_playback_invalidates_before_active_source_fast_path) ... ok
test_pomodoro_completion_has_short_reduced_motion_safe_burst (tests.test_manga_ui_contract.MangaUIContractTests.test_pomodoro_completion_has_short_reduced_motion_safe_burst) ... ok
test_reduced_motion_css_contract (tests.test_manga_ui_contract.MangaUIContractTests.test_reduced_motion_css_contract) ... ok
test_reduced_motion_playback_contract (tests.test_manga_ui_contract.MangaUIContractTests.test_reduced_motion_playback_contract) ... ok
test_standalone_mode_has_standard_and_apple_metadata (tests.test_manga_ui_contract.MangaUIContractTests.test_standalone_mode_has_standard_and_apple_metadata) ... ok
test_task_entry_has_optional_time_and_study_helpers (tests.test_manga_ui_contract.MangaUIContractTests.test_task_entry_has_optional_time_and_study_helpers) ... ok
test_theme_color_matches_manga_ink (tests.test_manga_ui_contract.MangaUIContractTests.test_theme_color_matches_manga_ink) ... ok
test_view_has_one_transition_definition (tests.test_manga_ui_contract.MangaUIContractTests.test_view_has_one_transition_definition) ... ok
test_visual_tokens_exist (tests.test_manga_ui_contract.MangaUIContractTests.test_visual_tokens_exist) ... ok

Ran 31 tests in 0.221s

OK
task helper behavior: ok
```

## Full regression verification

```text
$ python3 -m unittest discover -s tests -p 'test_*.py' -v
Ran 53 tests in 0.468s
OK

$ for test_file in tests/*.js; do node "$test_file"; done
allowance budget behavior: ok
companion playback behavior: ok
daily rollover behavior: ok
flashcard import/export: ok
flashcard REST client: ok
flashcard scheduler: ok
flashcard sync merge: ok
nutrition tracker behavior: ok
service worker behavior: ok
task helper behavior: ok

$ git diff --check
(exit 0)
```

## Commit

`feat: persist local life tracking data`

## Self-review

- `saveLifeState()` contains only the six required local keys; `syncFlashcards()` contains none of the Life state names.
- The daily rollover still migrates only task/idea/energy state; food history and budget cycles persist across calendar rollover.
- Budget cycles require a nonempty ID, valid positive date span, nonnegative safe-integer total, valid savings basis points, and safe-integer carry. Expenses require an ID, nonnegative safe-integer amount, and valid timestamps.
- Existing Task 1 nutrition behavior, Task 2 budget behavior, Task helper behavior, and the entire Python/Node suite passed.

## Concerns

No known code concerns. `tests/__pycache__/` was already untracked and was not included in this task.
