# Undo/Redo and Savepoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add transcript-driven undo/redo and single savepoint controls that operate only on board events and preserve linear history semantics.

**Architecture:** Keep transcript as source of truth and introduce explicit board-vs-ui event classes plus board revision metadata. Implement replay-cursor-based undo/redo/savepoint in the frontend runtime, with storage support for cursor/savepoint metadata and deterministic replay. UI controls and tests are added incrementally with TDD.

**Tech Stack:** Vanilla JS modules (`app.js`, `storage.js`, `transcript.js`, `rules.js`), localStorage, Playwright/pytest frontend tests.

---

## File Structure and Responsibilities

- Modify: `src/sudoku/static/js/transcript.js`
  - Event helpers and utilities for filtering board events and bounding transcript.
- Modify: `src/sudoku/static/js/storage.js`
  - Persist run cursor/savepoint metadata and normalize schema.
- Modify: `src/sudoku/static/js/app.js`
  - Emit `eventClass` and `boardRevision`, add replay cursor mechanics, wire Undo/Redo/Savepoint controls.
- Modify: `tests/test_frontend_mobile.py`
  - Add deterministic tests for undo/redo semantics, savepoint operations, and redo invalidation.

### Task 1: Add Event Classification and Board Revision Metadata

**Files:**
- Modify: `src/sudoku/static/js/app.js`
- Modify: `src/sudoku/static/js/storage.js`
- Test: `tests/test_frontend_mobile.py`

- [ ] **Step 1: Write failing metadata test**

```python
def test_transcript_board_events_include_class_and_revision(page, live_server):
    page.goto(live_server)
    page.locator("#grid .cell:not(.fixed)").first.click()
    page.get_by_role("button", name="1").click()

    events = page.evaluate("JSON.parse(localStorage.getItem('sudoku_run') || '{}').transcript || []")
    board_events = [e for e in events if e.get("eventClass") == "board"]
    assert board_events
    assert all("boardRevision" in e for e in board_events)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py::test_transcript_board_events_include_class_and_revision -v`
Expected: FAIL because `eventClass` / `boardRevision` are missing.

- [ ] **Step 3: Implement minimal metadata emission**

```js
// app.js, inside recordEvent
const isBoardEvent = ["value_entered", "note_toggled", "erase_applied", "bulk_applied"].includes(eventType);
const nextBoardRevision = isBoardEvent ? (runState.boardRevision || 0) + 1 : (runState.boardRevision || 0);

const nextEvent = {
  schemaVersion: 2,
  runId: runState.runId,
  puzzleId: runState.puzzleId,
  eventClass: isBoardEvent ? "board" : "ui",
  boardRevision: nextBoardRevision,
  eventTime: new Date().toISOString(),
  elapsedMs: getElapsedMs(),
  eventType,
  payload,
};
```

```js
// storage.js normalizeRunState
boardRevision: Number.isFinite(raw?.boardRevision) ? Math.max(0, Math.floor(raw.boardRevision)) : 0,
currentBoardEventId: raw?.currentBoardEventId ?? null,
savepointBoardEventId: raw?.savepointBoardEventId ?? null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py::test_transcript_board_events_include_class_and_revision -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sudoku/static/js/app.js src/sudoku/static/js/storage.js tests/test_frontend_mobile.py
git commit -m "feat: classify transcript events and add board revision metadata"
```

### Task 2: Implement Replay Cursor and Linear Undo/Redo

**Files:**
- Modify: `src/sudoku/static/js/app.js`
- Modify: `src/sudoku/static/js/transcript.js`
- Test: `tests/test_frontend_mobile.py`

- [ ] **Step 1: Write failing undo/redo tests**

```python
def test_undo_redo_replays_board_events_only(page, live_server):
    page.goto(live_server)
    editable = page.locator("#grid .cell:not(.fixed)").first
    editable.click()
    page.get_by_role("button", name="1").click()
    page.get_by_role("button", name="Undo").click()
    assert editable.text_content().strip() in {"", "?"}
    page.get_by_role("button", name="Redo").click()
    assert editable.text_content().strip() == "1"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py::test_undo_redo_replays_board_events_only -v`
Expected: FAIL because controls/replay cursor do not exist.

- [ ] **Step 3: Implement undo/redo cursor mechanics**

```js
// transcript.js helpers
export function getBoardEvents(transcript) {
  return (Array.isArray(transcript) ? transcript : []).filter((e) => e?.eventClass === "board");
}
```

```js
// app.js
function moveUndoCursorBackward() { /* set currentBoardEventId to previous board event id */ }
function moveUndoCursorForward() { /* set currentBoardEventId to next board event id */ }
function replayBoardToCursor() { /* rebuild board from nearest snapshot + board events */ }
```

- [ ] **Step 4: Run focused tests to verify pass**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py::test_undo_redo_replays_board_events_only -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sudoku/static/js/app.js src/sudoku/static/js/transcript.js tests/test_frontend_mobile.py
git commit -m "feat: add transcript cursor undo and redo"
```

### Task 3: Add Single Savepoint and Undo-to-Savepoint

**Files:**
- Modify: `src/sudoku/static/js/app.js`
- Modify: `src/sudoku/static/js/storage.js`
- Test: `tests/test_frontend_mobile.py`

- [ ] **Step 1: Write failing savepoint tests**

```python
def test_savepoint_set_undo_to_savepoint_and_clear(page, live_server):
    page.goto(live_server)
    editable = page.locator("#grid .cell:not(.fixed)").first
    editable.click()
    page.get_by_role("button", name="1").click()
    page.get_by_role("button", name="Savepoint").click()
    page.get_by_role("button", name="2").click()
    page.get_by_role("button", name="Undo to Savepoint").click()
    assert editable.text_content().strip() == "1"
    page.get_by_role("button", name="Clear Savepoint").click()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py::test_savepoint_set_undo_to_savepoint_and_clear -v`
Expected: FAIL before savepoint controls/logic.

- [ ] **Step 3: Implement single savepoint model**

```js
// app.js
function setSavepoint() {
  runState.savepointBoardEventId = runState.currentBoardEventId;
}

function undoToSavepoint() {
  runState.currentBoardEventId = runState.savepointBoardEventId;
  replayBoardToCursor();
}

function clearSavepoint() {
  runState.savepointBoardEventId = null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py::test_savepoint_set_undo_to_savepoint_and_clear -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sudoku/static/js/app.js src/sudoku/static/js/storage.js tests/test_frontend_mobile.py
git commit -m "feat: add single savepoint and undo-to-savepoint"
```

### Task 4: Redo Invalidation and UI Enablement Rules

**Files:**
- Modify: `src/sudoku/static/js/app.js`
- Test: `tests/test_frontend_mobile.py`

- [ ] **Step 1: Write failing redo invalidation test**

```python
def test_new_board_action_after_undo_clears_redo_path(page, live_server):
    page.goto(live_server)
    editable = page.locator("#grid .cell:not(.fixed)").first
    editable.click()
    page.get_by_role("button", name="1").click()
    page.get_by_role("button", name="Undo").click()
    page.get_by_role("button", name="2").click()
    assert page.get_by_role("button", name="Redo").is_disabled()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py::test_new_board_action_after_undo_clears_redo_path -v`
Expected: FAIL before invalidation logic.

- [ ] **Step 3: Implement redo invalidation + button state updates**

```js
// app.js
function appendBoardEvent(event) {
  if (hasFutureBoardEvents(runState.currentBoardEventId, runState.transcript)) {
    runState.transcript = dropFutureBoardEvents(runState.currentBoardEventId, runState.transcript);
  }
  runState.transcript = appendTranscriptEvent(runState.transcript, event).transcript;
  runState.currentBoardEventId = event.eventId;
}
```

```js
// app.js button enablement
undoBtn.disabled = !canUndo();
redoBtn.disabled = !canRedo();
undoToSavepointBtn.disabled = !canUndoToSavepoint();
clearSavepointBtn.disabled = !Boolean(runState.savepointBoardEventId);
```

- [ ] **Step 4: Run targeted tests to verify pass**

Run: `.venv/bin/python -m pytest tests/test_frontend_mobile.py -k "redo_path|savepoint|undo_redo_replays" -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/sudoku/static/js/app.js tests/test_frontend_mobile.py
git commit -m "feat: enforce linear redo invalidation and control states"
```

### Task 5: Full Verification

**Files:**
- Modify: as needed from any verification failure

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

- [ ] **Step 5: Commit stabilization changes (if required)**

```bash
git add -A
git commit -m "chore: stabilize undo redo savepoint implementation"
```

## Self-Review

- Spec coverage: tasks cover board/ui event classes, board revision, replay cursor undo/redo, single savepoint operations, redo invalidation, deterministic replay tests, and control enablement.
- Placeholder scan: no TBD/TODO markers; each task contains concrete commands and code snippets.
- Type consistency: uses `eventClass`, `boardRevision`, `currentBoardEventId`, and `savepointBoardEventId` consistently across tasks.
