# Number Availability Highlight Design

## Goal

Add a visual hint mode (triggered by selecting a fixed number) that keeps existing same-number highlighting and additionally shades blank cells where that number cannot be legally placed. This should leave only legally placeable blank cells in the normal background.

## Scope

In scope:
- Use current Sudoku legality only (row/column/box), not solution values.
- Keep same-number highlighting behavior for cells that already contain the selected number.
- Add unavailable-cell shading for blank, non-fixed cells that cannot take the selected number.
- Gate the feature behind a frontend flag that defaults to enabled.

Out of scope:
- Solver-based hinting.
- Auto-updating notes.
- Backend/API changes.

## Current Behavior

- Clicking a fixed cell toggles `highlightNum`.
- `renderGrid()` adds `.same-number` when a cell value equals `highlightNum`.
- No availability overlay currently exists for blank cells.

## Proposed Design

### 1) Add legality helper

Add a helper in frontend game logic:

- `canPlaceNumber(row, col, n)`

Behavior:
- Returns `true` only if placing `n` at `(row, col)` does not duplicate `n` in row, column, or 3x3 box.
- Reads only current board values.
- Does not inspect `solution`.
- Used for visualization only.

### 1b) Add feature flag (default on)

Add a frontend constant (for example, `ENABLE_NUMBER_AVAILABILITY_HINT = true`) near other game constants.

Behavior:
- When `true`, availability shading logic is active.
- When `false`, app keeps current behavior (same-number highlight only, no unavailable-cell shading).

### 2) Extend render-time class assignment

In `renderGrid()`:

- Keep existing class logic (`fixed`, `error`, `selected`, `highlight`, `same-number`).
- When feature flag is enabled, `highlightNum` is active, and the cell is blank + non-fixed:
  - If `canPlaceNumber(r, c, highlightNum)` is `false`, add `.unavailable-number`.
  - If `true`, do not add availability shading.

This keeps legal targets visually unshaded while showing blocked blanks with hint background.

### 3) Styling

Add `.cell.unavailable-number` CSS using the same background color used for the fixed-number hint color (`.same-number`) so unavailable blanks and matching fixed-number context share one visual language.

Notes:
- Keep text/readability unchanged for empty cells.
- Preserve `.error` visibility; conflicting entries should still read as errors.

## Data Flow

1. User clicks fixed cell with value `n`.
2. `highlightNum` toggles to `n` (or `null` if already selected).
3. `renderGrid()` runs.
4. For each cell:
   - mark existing `n` values with `.same-number`;
   - if feature flag is on, for blank non-fixed cells, call `canPlaceNumber(...)` and mark illegal ones with `.unavailable-number`.
5. Board visuals immediately reflect current legality.

## Interaction Rules

- Highlight mode still turns off when fixed number is clicked again.
- Selecting editable cells clears `highlightNum` (existing behavior) unless changed in future work.
- Availability shading recomputes every render, so placing/erasing values updates legality visualization immediately.
- If feature flag is switched off, availability shading is skipped while same-number highlighting remains.

## Error Handling

- No new persistent state required.
- No changes to save/load payload structure.
- No changes to network/cache flow.
- If highlight is inactive, no availability checks are applied.
- If feature flag is disabled, no availability checks are applied.

## Validation Plan (Human Eval)

Primary validation is manual visual testing.

Checklist:
- Click fixed `5`: existing `5`s are highlighted.
- With fixed `5` active: blank illegal-for-5 cells are shaded with hint background.
- Blank legal-for-5 cells remain normal background.
- Click the same fixed `5` again: all number-highlight visuals clear.
- Place/erase values while highlight is active: unavailable shading updates correctly.
- Repeat on at least two difficulties (e.g., Medium, Hard).
- Confirm note mode and keyboard navigation still behave normally.
- Turn feature flag off and verify unavailable shading disappears while same-number highlighting still works.

## Future Follow-Up

The next spec will cover solver-based hinting as a separate design and implementation track.
