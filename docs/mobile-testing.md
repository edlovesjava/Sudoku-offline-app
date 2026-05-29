# Mobile Testing Checklist

Use this checklist before cutting a mobile release candidate.

## Test matrix

- Android Emulator (latest stable API level)
- iOS Simulator (latest stable iOS)
- At least one physical device smoke run

## Install and launch

- App installs successfully from Android Studio and Xcode.
- Launch reaches playable Sudoku grid (`81` cells visible).
- App resumes without crash after background/foreground cycle.

## Input and gameplay

- Single-cell selection works with tap.
- Long-press enters multi-select mode.
- Tapping additional cells toggles selection membership in multi-select mode.
- Notes toggle updates visible active state and changes input behavior.
- Bulk number entry fills all selected editable cells.
- Bulk notes entry toggles candidates across selected editable cells.

## Hint and validation behavior

- Hint action returns candidate-based guidance text.
- Hint usage marks run as assisted.
- Row/column/box conflicts are highlighted after single and bulk edits.

## Offline and persistence

- New game works with network disabled (local provider or packaged source).
- Existing game state resumes after app restart.
- Timer/state continue from autosaved progress.
- Offline reload still shows app shell and playable board.

## Regression checks

- App responds correctly after screen rotation.
- No clipped controls on small-phone viewport.
- No obvious input lag during rapid entry.

## Record results

For each run, capture:

- platform + OS version
- app commit SHA/build identifier
- pass/fail per checklist section
- notes for defects or flaky behavior
