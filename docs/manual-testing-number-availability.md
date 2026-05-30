# Manual Test: Number Availability Highlight

## Setup

1. Start the app:
   - `.venv/bin/python -m uvicorn src.sudoku.main:app --reload`
2. Open `http://127.0.0.1:8000`.
3. Start one Medium game and one Hard game during this checklist.
4. Feature flag location for this checklist:
   - File: `src/sudoku/static/index.html`
   - Constant: `ENABLE_NUMBER_AVAILABILITY_HINT`

## Cases

1. Fixed-number highlight baseline
   - Click a fixed cell containing number `N`.
   - Expected: all currently visible `N` values get `.same-number` highlight.
   - Click the same fixed cell again.
   - Expected: highlight toggles off.

2. Unavailable-blank shading when flag is on
   - Confirm `ENABLE_NUMBER_AVAILABILITY_HINT = true`.
   - Click a fixed cell containing number `N`.
   - Expected: blank cells where `N` is illegal get `.unavailable-number` shading.
   - Expected: blank cells where `N` is legal stay unshaded.

3. Toggle-off behavior when flag is false
   - Temporarily set `ENABLE_NUMBER_AVAILABILITY_HINT = false` and reload.
   - Click a fixed cell containing number `N`.
   - Expected: `.same-number` highlight still appears for visible `N` cells.
   - Expected: unavailable blank shading is disabled.
   - Restore `ENABLE_NUMBER_AVAILABILITY_HINT = true` after validation.

4. Recompute after place and erase
   - With flag on, highlight a fixed number `N`.
   - Enter a value into an editable cell that changes row/column/box legality.
   - Expected: unavailable shading updates immediately.
   - Erase the value.
   - Expected: unavailable shading reverts immediately.

5. Notes mode and keyboard smoke check
   - Turn on Notes mode.
   - Add/remove notes in editable cells while a number highlight is active.
   - Use arrow keys to move selection.
   - Expected: note interactions and keyboard navigation still work.

6. Final cleanup and verification
   - In `src/sudoku/static/index.html`, confirm `ENABLE_NUMBER_AVAILABILITY_HINT = true`.
   - Review local changes before finishing (`git status --short` and `git diff`).
   - Expected: flag is reset to default-on and only intended changes remain.
