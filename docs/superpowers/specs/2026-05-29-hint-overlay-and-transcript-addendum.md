# Hint Overlay and Gameplay Transcript Addendum

Date: 2026-05-29
Status: Approved for planning
Parent spec: `docs/superpowers/specs/2026-05-29-sudoku-mobile-pwa-enhancement-design.md`

## 1) Purpose

This addendum refines the v1 hint experience based on usage feedback and adds a lightweight event transcript foundation for future coaching and competition analysis.

## 2) Scope Changes

### 2.1 Replace one-shot hint UX

- Remove existing one-shot hint functionality from the visible UI.
- Remove hint text panel output in gameplay UI.
- Replace with a single `Hint Overlay` toggle.

### 2.2 New hint overlay behavior

- `Hint Overlay` defaults to `OFF`.
- When `Hint Overlay` is `ON` and exactly one editable cell is selected:
  - compute legal candidates for that cell,
  - dim numpad digits that are not legal candidates.
- Dimmed digits remain tappable (teaching aid, not input lockout).
- For no selection, fixed-cell selection, or multi-select, numpad stays neutral (no overlay dimming).

### 2.3 Future hint model split

- In-grid hinting remains lightweight visual guidance only.
- Advanced tactical guidance (for example X-Wing, hidden pair, strategy prompts) moves to a future chat-coach experience.

## 3) State and Data Model Updates

### 3.1 Runtime state

- Add `hintOverlayEnabled: boolean` (default `false`).
- Remove one-shot hint request pathway from interaction model.

### 3.2 Persistence

- Persist `hintOverlayEnabled` with local game/session state so preference survives reload.

### 3.3 Run metadata policy

- One-shot hint counters (`hintsUsed`) and assisted-run toggles tied to explicit hint requests are removed from this UX path.
- Keep schema versioning and extension points to support future chat-coach analytics without rework.

## 4) Gameplay Transcript Foundation (v1)

### 4.1 Capture policy

- Capture gameplay transcript by default for every run.
- Store locally only in v1.

### 4.2 Transcript format

Use an append-only, versioned event stream per run. Each event includes:

- `schemaVersion`
- `runId`
- `puzzleId`
- `eventType`
- `eventTime` (wall clock) and `elapsedMs` (run-relative)
- event payload (`cell`, `cells`, `value`, `mode`, `overlayEnabled`, etc.)

### 4.3 Event types (initial set)

- `run_started`, `run_completed`
- `cell_selected`
- `value_entered`
- `note_toggled`
- `erase_applied`
- `mode_toggled`
- `overlay_toggled`
- `new_game_requested`

### 4.4 Storage boundaries

- Keep transcript bounded (event cap and/or max serialized size) to prevent unbounded local growth.
- If limits are reached, truncate oldest transcript segments with metadata flag indicating truncation.

## 5) Testing Expectations

- Unit tests for overlay candidate mapping (selected cell -> dimmed digits).
- UI tests for overlay ON/OFF behavior and neutral state under fixed-cell/no-selection/multi-select.
- Regression test ensuring dimmed digits are still tappable.
- Storage tests for transcript append behavior, schema validity, and bounds/truncation policy.

## 6) Out of Scope (for this addendum)

- Chat-coach UI and prompt orchestration.
- Strategy solver beyond candidate filtering.
- Remote transcript sync, accounts, or leaderboard integration.
- Scoring logic derived from transcript (deferred).

## 7) Acceptance Summary

This addendum is accepted when:

1. One-shot hint UI is removed.
2. `Hint Overlay` toggle exists and defaults OFF.
3. Overlay dims only invalid digits for a single editable selected cell.
4. Dimmed digits remain tappable.
5. Transcript capture is on by default and stored locally with bounded growth.
