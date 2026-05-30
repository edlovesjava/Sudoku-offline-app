# Undo/Redo and Savepoint Design

Date: 2026-05-29
Status: Approved for planning
Parent specs:
- `docs/superpowers/specs/2026-05-29-sudoku-mobile-pwa-enhancement-design.md`
- `docs/superpowers/specs/2026-05-29-hint-overlay-and-transcript-addendum.md`

## 1) Purpose

Add user-facing undo/redo/savepoint controls while keeping transcript as the source of truth for state reconstruction.

## 2) Product Decisions Captured

- Include both `Undo` and `Redo` in v1.
- `Undo` is one atomic board-changing step.
- Redo uses single linear history only.
- New board action after undo clears redo path (no branching).
- Savepoint is single-slot in v1 (one active savepoint max).
- Savepoint anchors to board events only, not UI/config events.

## 3) Event-Sourced Model

### 3.1 Transcript as source of truth

- Board state is reconstructed from transcript replay.
- Undo/redo does not mutate historical events; it moves a replay cursor across board events.

### 3.2 Event classes

Every event includes `eventClass`:

- `board` -> undoable/redoable (value entry, note toggle, erase, bulk board actions)
- `ui` -> non-undoable (mode toggles, hint overlay toggle, display-only selections/preferences)

Undo/redo traversal uses `board` events only.

### 3.3 Board revision and cursor

- Add `boardRevision` that increments only when `eventClass == "board"`.
- Maintain `currentBoardEventId` cursor indicating current replay position.
- Redo availability exists when cursor is behind latest board event.

## 4) Savepoint Model

### 4.1 Single savepoint

- Store one nullable marker: `savepointBoardEventId`.
- Setting a new savepoint overwrites existing savepoint.

### 4.2 Savepoint operations

- `Savepoint`: set marker to current board-event cursor.
- `Undo to Savepoint`: move cursor backward to marker and replay.
- `Clear Savepoint`: set marker to null.

### 4.3 Scope rules

- Savepoint references board events only.
- UI/config events are ignored by savepoint traversal semantics.

## 5) Undo/Redo Semantics

### 5.1 Atomic actions

Each board-changing operation is recorded as one board event and one undo step:

- single value entry
- single notes toggle
- erase action
- multi-select bulk board action

### 5.2 Redo invalidation

If cursor is behind head and a new board event is appended:

- all redo-forward board events beyond cursor are discarded,
- timeline remains linear.

### 5.3 Replay behavior

- Undo: move cursor to previous board event and replay state.
- Redo: move cursor to next board event and replay state.
- Replay excludes applying UI-only events to board state.

## 6) Storage and Performance

### 6.1 Run state extensions

Extend `sudoku_run` with:

- `currentBoardEventId`
- `savepointBoardEventId`
- transcript events with `eventClass` and `boardRevision`

### 6.2 Snapshot acceleration

- Keep periodic board snapshots to avoid replaying from event 0 every time.
- Replay strategy: nearest snapshot + subsequent board events up to cursor.

### 6.3 Determinism

- Replay from same snapshot + board-event sequence must produce identical board.
- This is required for future analytics and coaching consistency.

## 7) UI and Controls

Add controls:

- `Undo` (counter-clockwise icon)
- `Redo` (clockwise icon)
- `Savepoint`
- `Undo to Savepoint`
- `Clear Savepoint`

Button enablement rules:

- `Undo`: enabled when previous board event exists.
- `Redo`: enabled when next board event exists.
- `Undo to Savepoint`: enabled when savepoint exists and lies before current cursor.
- `Clear Savepoint`: enabled when savepoint exists.

Feedback examples:

- "Undid 1 move"
- "Redid 1 move"
- "Returned to savepoint"
- "Redo history cleared"

## 8) Testing Expectations

- Replay tests proving deterministic board reconstruction from event stream.
- Undo/redo tests for single and bulk board actions.
- Redo invalidation test when new board action occurs after undo.
- Savepoint tests:
  - set/overwrite/clear,
  - undo-to-savepoint behavior,
  - disabled behavior when no marker.
- Event classification tests ensuring UI events never affect board replay.

## 9) Out of Scope

- Multiple simultaneous savepoints.
- Branching history UI.
- Time-travel visualization.
- Syncing history across accounts/devices.

## 10) Acceptance Summary

This design is accepted when:

1. Undo/redo controls work with linear board-event timeline.
2. Redo is cleared when new board action is made after undo.
3. Single savepoint can be set, used for undo-to-savepoint, and cleared.
4. Savepoint and undo traversal use board events only.
5. Replay remains deterministic with transcript as source of truth.
