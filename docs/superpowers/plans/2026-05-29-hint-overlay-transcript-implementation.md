# Hint Overlay and Transcript Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace one-shot hints with a toggleable numpad hint overlay and add default-on bounded gameplay transcript capture for future analysis.

**Architecture:** Keep existing modular frontend boundaries and implement this as a UI/input/state change in `app.js` plus focused helper modules. Reuse candidate logic in `rules.js` for overlay dimming, remove explicit hint-run counters, and add a dedicated transcript utility that appends bounded local events to run state. Keep backend unchanged.

**Tech Stack:** FastAPI (unchanged), vanilla JS modules, localStorage, Playwright frontend tests, pytest.

---

## File Structure and Responsibilities

- Modify: `src/sudoku/static/js/app.js`
  - Remove one-shot hint UI flow, add `Hint Overlay` toggle behavior, and wire transcript events from gameplay actions.
- Modify: `src/sudoku/static/js/rules.js`
  - Keep candidate calculation and expose helper to compute dimmable digits for selected cell.
- Modify: `src/sudoku/static/js/storage.js`
  - Remove explicit one-shot hint counters from run metadata path, persist overlay preference, and save bounded transcript with run state.
- Create: `src/sudoku/static/js/transcript.js`
  - Append-only bounded event stream helpers (`create`, `append`, `truncate`, `serialize`).
- Modify: `tests/test_frontend_mobile.py`
  - Replace one-shot hint tests with overlay dimming and transcript assertions.
- Optional docs touch: `docs/superpowers/specs/2026-05-29-hint-overlay-and-transcript-addendum.md`
  - Keep aligned with implementation details if identifiers are adjusted.

### Task 1: Replace One-Shot Hint UI with Hint Overlay Toggle

**Files:**
- Modify: `src/sudoku/static/js/app.js`
- Test: `tests/test_frontend_mobile.py`

- [ ] **Step 1: Write the failing UI test for overlay toggle default/state**

```python
@pytest.mark.asyncio
async def test_hint_overlay_toggle_defaults_off_and_toggles(page):
    await page.goto("http://127.0.0.1:8000/")
    toggle = page.get_by_role("button", name="Hint Overlay")
    assert await toggle.get_attribute("aria-pressed") == "false"
    await toggle.click()
    assert await toggle.get_attribute("aria-pressed") == "true"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py::test_hint_overlay_toggle_defaults_off_and_toggles -v`
Expected: FAIL because button does not exist yet.

- [ ] **Step 3: Implement minimal overlay toggle and remove one-shot hint controls**

```js
// app.js
const overlayBtn = document.createElement("button");
overlayBtn.textContent = "Hint Overlay";
overlayBtn.className = "hint-overlay-toggle";
overlayBtn.setAttribute("aria-pressed", "false");

let hintOverlayEnabled = false;
overlayBtn.addEventListener("click", () => {
  hintOverlayEnabled = !hintOverlayEnabled;
  overlayBtn.setAttribute("aria-pressed", String(hintOverlayEnabled));
  overlayBtn.classList.toggle("active", hintOverlayEnabled);
  renderGrid();
});

// Remove creation/wiring of legacy "Hint" button and hint text output
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py::test_hint_overlay_toggle_defaults_off_and_toggles -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sudoku/static/js/app.js tests/test_frontend_mobile.py
git commit -m "feat: replace one-shot hint with overlay toggle"
```

### Task 2: Implement Numpad Dimming for Selected Editable Cell

**Files:**
- Modify: `src/sudoku/static/js/rules.js`
- Modify: `src/sudoku/static/js/app.js`
- Test: `tests/test_frontend_mobile.py`

- [ ] **Step 1: Write failing dimming behavior test**

```python
@pytest.mark.asyncio
async def test_overlay_dims_invalid_digits_but_keeps_them_tappable(page):
    await page.goto("http://127.0.0.1:8000/")
    await page.get_by_role("button", name="Hint Overlay").click()
    await page.locator("#grid .cell:not(.fixed)").first.click()
    dimmed_count = await page.locator("#numpad button.dimmed").count()
    assert dimmed_count > 0
    await page.locator("#numpad button.dimmed").first.click()
    assert True
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py::test_overlay_dims_invalid_digits_but_keeps_them_tappable -v`
Expected: FAIL because dimming class behavior is missing.

- [ ] **Step 3: Implement overlay candidate->numpad mapping**

```js
// rules.js
export function getInvalidDigitsForCell(board, row, col) {
  const candidates = new Set(getCellCandidates(board, row, col));
  return [1,2,3,4,5,6,7,8,9].filter((n) => !candidates.has(n));
}

// app.js (inside updateNumpad/render path)
const shouldOverlay = hintOverlayEnabled && selected.length === 1;
const invalid = shouldOverlay
  ? new Set(getInvalidDigitsForCell(board, selected[0].row, selected[0].col))
  : new Set();

for (let n = 1; n <= 9; n++) {
  numButtons[n]?.classList.toggle("dimmed", invalid.has(n));
}
```

- [ ] **Step 4: Run focused tests to verify pass**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py::test_overlay_dims_invalid_digits_but_keeps_them_tappable -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sudoku/static/js/rules.js src/sudoku/static/js/app.js tests/test_frontend_mobile.py
git commit -m "feat: dim invalid numpad digits for hint overlay"
```

### Task 3: Persist Overlay Preference and Remove Legacy Hint-Usage Counters

**Files:**
- Modify: `src/sudoku/static/js/storage.js`
- Modify: `src/sudoku/static/js/app.js`
- Test: `tests/test_frontend_mobile.py`

- [ ] **Step 1: Write failing persistence and migration tests**

```python
@pytest.mark.asyncio
async def test_overlay_preference_persists_across_reload(page):
    await page.goto("http://127.0.0.1:8000/")
    toggle = page.get_by_role("button", name="Hint Overlay")
    await toggle.click()
    await page.reload()
    assert await toggle.get_attribute("aria-pressed") == "true"
```

```python
@pytest.mark.asyncio
async def test_run_state_no_longer_tracks_legacy_hint_counters(page):
    await page.goto("http://127.0.0.1:8000/")
    run_state = await page.evaluate("JSON.parse(localStorage.getItem('sudoku_run') || '{}')")
    assert "hintsUsed" not in run_state
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py -k "overlay_preference_persists or legacy_hint_counters" -v`
Expected: FAIL before implementation.

- [ ] **Step 3: Implement storage updates**

```js
// storage.js
const PREFS_KEY = "sudoku_prefs";
export function loadPrefs() {
  return JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
}
export function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function createRunState(input) {
  return {
    schemaVersion: 2,
    runId: input.runId,
    puzzleId: input.puzzleId,
    transcript: input.transcript || [],
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py -k "overlay_preference_persists or legacy_hint_counters" -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sudoku/static/js/storage.js src/sudoku/static/js/app.js tests/test_frontend_mobile.py
git commit -m "refactor: persist overlay preference and drop legacy hint counters"
```

### Task 4: Add Default-On Bounded Gameplay Transcript

**Files:**
- Create: `src/sudoku/static/js/transcript.js`
- Modify: `src/sudoku/static/js/app.js`
- Modify: `src/sudoku/static/js/storage.js`
- Test: `tests/test_frontend_mobile.py`

- [ ] **Step 1: Write failing transcript tests**

```python
@pytest.mark.asyncio
async def test_transcript_records_core_events(page):
    await page.goto("http://127.0.0.1:8000/")
    await page.locator("#grid .cell:not(.fixed)").first.click()
    await page.get_by_role("button", name="1").click()
    events = await page.evaluate("JSON.parse(localStorage.getItem('sudoku_run') || '{}').transcript")
    types = [e["eventType"] for e in events]
    assert "cell_selected" in types and "value_entered" in types
```

```python
@pytest.mark.asyncio
async def test_transcript_is_bounded(page):
    await page.goto("http://127.0.0.1:8000/")
    await page.evaluate("window.__sudokuDebug.emitTranscriptSpamForTest(2500)")
    count = await page.evaluate("(JSON.parse(localStorage.getItem('sudoku_run') || '{}').transcript || []).length")
    assert count <= 1000
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py -k "transcript_records_core_events or transcript_is_bounded" -v`
Expected: FAIL before transcript implementation.

- [ ] **Step 3: Implement transcript utility and app event hooks**

```js
// transcript.js
export const MAX_TRANSCRIPT_EVENTS = 1000;

export function appendTranscriptEvent(transcript, event) {
  const next = [...(transcript || []), event];
  if (next.length <= MAX_TRANSCRIPT_EVENTS) return { transcript: next, truncated: false };
  return { transcript: next.slice(next.length - MAX_TRANSCRIPT_EVENTS), truncated: true };
}

export function makeEvent(base, eventType, payload = {}) {
  return { ...base, eventType, ...payload };
}
```

```js
// app.js (representative hooks)
recordEvent("run_started", {});
recordEvent("cell_selected", { row, col });
recordEvent("value_entered", { row, col, value: n, mode: noteMode ? "notes" : "number" });
recordEvent("overlay_toggled", { enabled: hintOverlayEnabled });
recordEvent("new_game_requested", {});
```

- [ ] **Step 4: Run transcript tests and full frontend suite**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sudoku/static/js/transcript.js src/sudoku/static/js/app.js src/sudoku/static/js/storage.js tests/test_frontend_mobile.py
git commit -m "feat: add default-on bounded gameplay transcript"
```

### Task 5: End-to-End Verification and Cleanup

**Files:**
- Modify: as needed from failures

- [ ] **Step 1: Run backend tests**

Run: `.venv/bin/python -m pytest tests/test_sudoku.py -v`
Expected: PASS.

- [ ] **Step 2: Run frontend tests**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py -v`
Expected: PASS.

- [ ] **Step 3: Run docs tests**

Run: `.venv/bin/python -m pytest tests/test_docs_mobile.py -v`
Expected: PASS.

- [ ] **Step 4: Run full suite**

Run: `.venv/bin/python -m pytest -v`
Expected: PASS.

- [ ] **Step 5: Commit final stabilization (if needed)**

```bash
git add -A
git commit -m "chore: stabilize hint overlay and transcript implementation"
```

## Self-Review

- Spec coverage: plan includes one-shot hint removal, overlay toggle default OFF, dim-but-tappable behavior, and bounded default-on transcript capture.
- Placeholder scan: no TBD/TODO steps; each task has explicit files, commands, and sample code.
- Type consistency: uses `hintOverlayEnabled`, `eventType`, and `transcript` consistently across tasks.
