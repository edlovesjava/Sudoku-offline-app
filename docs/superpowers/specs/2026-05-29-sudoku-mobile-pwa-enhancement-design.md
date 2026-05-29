# Sudoku Mobile/PWA Enhancement Design

Date: 2026-05-29
Status: Approved for planning
Owner: Product + Engineering

## 1) Goals and Scope

This design defines v1 enhancements for the existing Sudoku app so it can:

- remain a strong web app,
- become installable as a PWA,
- be packaged for iOS/Android via Capacitor,
- support faster mobile gameplay input,
- run fully offline from first launch,
- establish a durable puzzle/share/run format for future save/share/competition features.

### In scope (v1)

- PWA-first architecture with later Capacitor packaging integration.
- Long-press multi-select on mobile.
- Fast mode switching between Notes and Number input via a single toggle button.
- Bulk apply for number and notes across selected cells.
- Candidate hint mode with concise explanation text.
- Full offline play from first launch.
- Unified puzzle source abstraction (browser-generated, pre-generated pack, optional backend, imported share payload).
- Config-driven feature/input/render architecture with intelligent default profile.
- Emulator/simulator testing coverage in the release checklist.

### Out of scope (v1)

- Accounts.
- Leaderboards or finalized competition scoring/points.
- Full advanced technique coaching engine.
- AI tutor integration (design hooks only).

## 2) Product Decisions Captured

- Platform approach: PWA-first, then package with Capacitor.
- Multi-select trigger on mobile: long-press.
- Multi-select behavior in Number mode: fill all selected editable cells.
- Notes/Number switching: single persistent toggle button with clear active state.
- Offline expectation: playable offline from first launch.
- Backend role: optional source, never required for core play.
- v1 success bar: playable + installable mobile app (no store-polish requirement yet).
- Hint behavior v1: candidate-only hint + short explanation (no auto-fill).
- Hint effect on runs: mark run as assisted.
- Competition/points: explicitly TBD for later design.
- UX customization strategy: intelligent defaults first, user-tested profiles later.

## 3) Architecture

### 3.1 Layered boundaries

Split app responsibilities into clear units:

1. Rules engine
   - Sudoku validation, candidate computation, win check, hint reasoning.
   - Pure logic, independent of DOM/input events.

2. Input engine
   - Converts gestures/keyboard/button taps into intent actions.
   - Supports profile-specific behavior (for example long-press selection behavior).

3. Render layer
   - Displays board, controls, selection state, hints, and status.
   - Consumes state snapshots and emits user interactions back to input engine.

This separation keeps feature evolution safe when input models and layouts change.

### 3.2 Config-driven flexibility

Introduce versioned config objects:

- `featureConfig`: controls capability flags (for example `multiSelect`, `hintPanel`).
- `inputProfile`: gesture/input semantics (for example `mobile-fast-entry`).
- `layoutVariant`: render arrangement (for example compact vs expanded controls).

Defaults:

- Bootstrap with one intelligent all-around default profile.
- Keep profile plumbing internal in v1; no heavy settings UI required.

Metadata:

- Persist active profile and feature configuration in run metadata for future fair comparison modes.

## 4) Puzzle Source Strategy and Canonical Formats

### 4.1 Unified provider contract

All puzzle sources implement a shared `PuzzleProvider` contract and output a common package:

- browser generator (primary offline source),
- bundled pre-generated puzzle packs,
- optional backend puzzle source,
- imported shared puzzle/challenge payload.

### 4.2 Canonical puzzle package

Use a versioned JSON schema for puzzle interchange, e.g.:

- `schemaVersion`
- `puzzleId`
- `grid` (initial board)
- optional `solution`
- metadata (`difficulty`, `source`, `title`, `author`, etc.)
- `rulesProfile`
- integrity field (checksum)

### 4.3 Canonical run record

Store local run/session data in a versioned `RunRecord` schema:

- puzzle reference (`puzzleId`)
- timing (`elapsedMs`)
- quality metrics (`mistakes`, `hintsUsed`, `assisted`)
- configuration (`configProfile`)
- timestamps/state metadata

### 4.4 Import/export for future sharing

Support compact encoded payloads (copy/paste or link-based) with schema + checksum validation.

- Invalid payloads fail gracefully with clear user feedback.
- Same format works across browser and Capacitor shells.

### 4.5 Source fallback order

Guarantee first-launch offline play:

1. local browser generation and/or bundled pre-generated pack,
2. imported shared payload (if user opens one),
3. backend source as optional non-blocking enhancement.

## 5) Gameplay Input and Hint UX

### 5.1 Selection model

- Single tap on editable cell selects it (single-select).
- Long-press enters multi-select mode on mobile.
- In multi-select mode, tap toggles selection membership.
- Fixed cells are not selectable/editable.

### 5.2 Mode switching

- One explicit Notes toggle controls active input mode.
- Active state is always visible.

### 5.3 Bulk apply rules

When multiple editable cells are selected and user taps `1-9`:

- Number mode: set value in all selected editable cells; clear notes in those cells.
- Notes mode: toggle tapped candidate in all selected editable cells; keep notes sorted.

### 5.4 Validation behavior

- Existing row/column/box duplicate checks run after single or bulk edits.
- Bulk operations do not bypass violation highlighting.

### 5.5 Hint mode (v1)

- Hint request returns candidate-focused guidance, not auto-fill.
- Output pattern: "This cell can only be X or Y because ..." based on row/column/box elimination.
- Hint usage marks run as `assisted`.

## 6) PWA and Mobile Packaging Strategy

### 6.1 PWA first

- Add/complete web manifest and install metadata.
- Add service worker strategy to support offline shell and game continuity.
- Preserve local autosave/resume behavior.

### 6.2 Capacitor packaging second

- Add Capacitor project wiring after core PWA behaviors are stable.
- Reuse same web app logic/assets (no rewrite).
- iOS/Android packaging is an integration layer, not a second implementation.

## 7) Reliability, Error Handling, and Compatibility

- Validate puzzle/run/import payloads against schema before use.
- Keep schema version migration path for save compatibility.
- Fail safe with clear recovery action (new puzzle, retry import, continue local).
- Persist enough metadata to maintain forward compatibility with later profile and competition features.

## 8) Testing and Verification Strategy

### 8.1 Automated

- Keep backend API tests for puzzle endpoint behavior.
- Add frontend logic tests for:
  - candidate generation,
  - hint explanation outputs,
  - bulk apply semantics,
  - profile-driven input rules.

### 8.2 Manual functional

- Browser/PWA checks for installability and offline continuity.
- Mobile interaction checks for long-press, multi-select stability, toggle clarity, and hint usability.

### 8.3 Emulator/simulator requirement

- Android Emulator and iOS Simulator are required for regression checks:
  - install/run,
  - touch gesture correctness,
  - long-press multi-select,
  - notes toggle + bulk apply,
  - hint UX,
  - offline/resume behavior.

### 8.4 Real-device smoke check

- Required before release candidate sign-off to catch gesture/performance/device-specific behavior.

## 9) Future Extensions (Designed-For, Not Implemented in v1)

- Technique-first solver explanations (hidden singles, pairs, pointing, etc.).
- AI-assisted teaching/coaching layer driven by board state and move history.
- Share/save catalogs and challenge distribution.
- Competitive modes, scoring/points, and fairness policy (TBD).
- Additional Sudoku-theme game types with compatible share/run metadata lineage.

## 10) Open Decisions / TBD

- Competition scoring and points model.
- Rules for assisted vs unassisted leaderboard segmentation.
- Technique taxonomy and progression path for coach mode.
- AI tutoring UX and safety boundaries.

---

This spec is intentionally scoped to deliver a robust v1 foundation while preserving architectural flexibility for sharing, teaching, and competition features in later phases.
