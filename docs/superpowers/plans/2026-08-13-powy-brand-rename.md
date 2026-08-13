# Powy Brand Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename every user-visible product label to Powy without changing persisted data or cloud protocol identifiers.

**Architecture:** Treat branding as presentation metadata only. Update HTML, manifest, documentation and the Service Worker release version; preserve all `LiangliAccountSync`, `liangli_*`, database, cache-family and backup-format identifiers for backward compatibility.

**Tech Stack:** Static HTML/CSS/JavaScript PWA, Web App Manifest, Service Worker, Python contract tests.

## Global Constraints

- The only user-visible product name is `Powy`.
- Persisted identifiers and Supabase schema names remain unchanged.
- Increment the application shell cache from `liangli-v9` to `liangli-v10`.

---

### Task 1: Rename presentation metadata

**Files:**
- Modify: `index.html`
- Modify: `manifest.json`
- Modify: `sw.js`
- Modify: `README.md`
- Test: `tests/test_manga_ui_contract.py`
- Test: `tests/test_service_worker_contract.py`

**Interfaces:**
- Consumes: Existing PWA manifest and Service Worker cache contract.
- Produces: User-visible `Powy` brand while retaining existing storage and cloud identifiers.

- [ ] **Step 1: Add failing brand assertions**

Assert that document title, header, manifest names and Service Worker release metadata use `Powy`, while `LiangliAccountSync` and `liangli-flashcards-v1` remain present.

- [ ] **Step 2: Verify the focused tests fail**

Run: `python3 -m unittest tests.test_manga_ui_contract tests.test_service_worker_contract -v`

Expected: FAIL because visible metadata still says `量力 Liangli`.

- [ ] **Step 3: Apply the minimal presentation rename**

Change visible labels to `Powy`, change the logo glyph to `P`, update the README heading and product prose, and increment `VERSION` to `liangli-v10`. Do not rename storage keys, schemas, RPCs, backup formats or JavaScript APIs.

- [ ] **Step 4: Run full verification**

Run the Python and Node suites, companion media verification, JavaScript syntax check and `git diff --check`.

Expected: all checks pass.

- [ ] **Step 5: Commit**

Commit the branding changes together after verification.

