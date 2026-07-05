# Optional Server, Super Sue Coach, and Human-Technique Solver Design

Date: 2026-06-06
Status: Draft for review
Owner: Product + Engineering
Related specs:
- `docs/superpowers/specs/2026-05-29-sudoku-mobile-pwa-enhancement-design.md`
- `docs/superpowers/specs/2026-05-29-hint-overlay-and-transcript-addendum.md`

## 1) Purpose

This design specifies a next-phase optional server component for Sudoku Offline App.

The core app must continue to work fully offline. The server adds enhanced capabilities when available:

- a chat-like coaching assistant named **Super Sue**,
- a human-technique solving engine,
- richer explanations for board states,
- future transcript-based coaching and analytics,
- optional puzzle generation / puzzle curation APIs.

The server should help the player learn Sudoku rather than merely reveal answers. It should identify human-solvable next steps, explain why a step works, and optionally apply safe board updates such as placements or candidate eliminations.

## 2) Product Goals

1. Keep offline play as the default reliable experience.
2. Let the frontend optionally call a server for advanced help.
3. Introduce Super Sue as a friendly Sudoku coach.
4. Build a deterministic human-technique solver before any LLM-based coaching layer.
5. Inventory solving techniques by progressive difficulty.
6. Represent each detected technique as structured data the app can render, apply, explain, and log.
7. Support future transcript review: “Here is where you had an opportunity to use a hidden single.”

## 3) Non-Goals for This Phase

- Accounts, authentication, subscriptions, or leaderboards.
- Multiplayer / competition server.
- Cloud save as a required feature.
- Requiring the server to play the core game.
- A solver that guesses by default.
- An unconstrained LLM that invents Sudoku logic without deterministic validation.

## 4) Core Principle: Deterministic Solver First, Chat Second

Super Sue should not be the source of truth for Sudoku logic.

The server should separate:

1. **Technique engine**
   - Reads a board state.
   - Computes candidates.
   - Detects available human techniques.
   - Produces structured placements and eliminations.
   - Produces explanation facts.

2. **Coach / chat layer**
   - Uses the technique engine output.
   - Rephrases explanations conversationally.
   - Answers follow-up questions.
   - Never claims a move is valid unless the deterministic engine validated it.

This keeps explanations trustworthy and testable.

## 5) High-Level Architecture

```text
Frontend PWA / Capacitor app
  |
  | optional HTTPS calls
  v
Sudoku Server
  |
  |-- Puzzle API
  |-- Board Analysis API
  |-- Human-Technique Solver Engine
  |-- Super Sue Coach API
  |-- Transcript Review API, future
```

### 5.1 Offline-first client behavior

- If the server is unreachable, gameplay continues normally.
- Server-backed UI affordances should degrade gracefully.
- The app may show “Super Sue is unavailable offline” instead of blocking play.
- Any local hint overlay behavior from the existing spec remains local.

### 5.2 Server responsibilities

The server may provide:

- advanced board analysis,
- next-step recommendations,
- human technique detection,
- explanations,
- optional candidate updates,
- chat coaching grounded in solver output,
- puzzle generation / validation,
- future transcript analysis.

## 6) Board State Contract

The server needs a canonical board state format that can represent both current values and candidate notes.

### 6.1 Board coordinates

Use zero-based coordinates in JSON and user-friendly one-based labels in explanations.

- JSON: `row: 0`, `col: 0`
- Display: `R1C1`
- Optional box label: `box: 0` or display `box 1`

Box numbering:

```text
box 1 | box 2 | box 3
box 4 | box 5 | box 6
box 7 | box 8 | box 9
```

### 6.2 Minimal request board shape

```json
{
  "schemaVersion": 1,
  "puzzleId": "optional-puzzle-id",
  "grid": "000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  "givens": "000000000000000000000000000000000000000000000000000000000000000000000000000000000",
  "notes": {
    "0,0": [1, 2, 9],
    "0,1": [3, 4]
  },
  "rulesProfile": "classic-9x9"
}
```

Definitions:

- `grid`: 81 digits. `0` means empty, `1-9` means filled value.
- `givens`: 81 digits. Non-zero values identify fixed original clues.
- `notes`: optional user notes keyed by `row,col`.
- `rulesProfile`: initially only `classic-9x9`.

### 6.3 Server-derived candidates

The technique engine should compute legal candidates from `grid` unless the client explicitly requests user-note analysis.

Candidate policy options:

- `computed`: ignore user notes and compute true legal candidates.
- `user_notes`: analyze the player’s notes as entered.
- `hybrid`: compare user notes to computed candidates and report discrepancies.

Default: `computed`.

## 7) Structured Solver Output

The server should return a list of candidate next steps, not just prose.

```json
{
  "schemaVersion": 1,
  "boardId": "sha256-or-other-stable-id",
  "analysisMode": "computed",
  "isSolved": false,
  "isValid": true,
  "steps": [
    {
      "stepId": "step-001",
      "techniqueId": "naked_single",
      "techniqueName": "Naked Single",
      "difficultyBand": "beginner",
      "difficultyScore": 10,
      "actionType": "place_value",
      "placements": [
        { "row": 0, "col": 0, "value": 9 }
      ],
      "eliminations": [],
      "houses": [
        { "type": "row", "index": 0 },
        { "type": "column", "index": 0 },
        { "type": "box", "index": 0 }
      ],
      "evidence": {
        "cell": { "row": 0, "col": 0 },
        "candidatesBefore": [9],
        "eliminatedByRow": [1, 2, 3],
        "eliminatedByColumn": [4, 5, 6],
        "eliminatedByBox": [7, 8]
      },
      "explanation": {
        "short": "R1C1 can only be 9.",
        "full": "In box 1, cell R1C1 has only one legal candidate. The row, column, and box eliminate every digit except 9, so R1C1 must be 9."
      },
      "safeToAutoApply": true
    }
  ]
}
```

## 8) Technique Action Types

Every technique result should use one or both of these action types:

1. `place_value`
   - Fills one or more cells with solved values.
   - Example: naked single, hidden single.

2. `eliminate_candidate`
   - Removes one or more candidates from unsolved cells.
   - Example: pointing pair, naked pair, X-Wing.

A step may include both, but the first implementation should prefer one action type per step for simpler UI and safer testing.

## 9) Progressive Human Technique Inventory

This inventory is intentionally broader than the first implementation. It provides a roadmap and lets the server expose which techniques it supports.

### 9.1 Beginner techniques

#### Full House

A house has exactly one empty cell.

- House types: row, column, or box.
- Detection: one empty cell in a house, one missing digit.
- Action: place the missing digit.
- Explanation: “Row 4 already contains 1, 2, 3, 4, 5, 6, 8, and 9, so the last cell must be 7.”

#### Naked Single

A cell has exactly one legal candidate.

- Detection: compute candidates for each empty cell; candidate count is 1.
- Action: place that value.
- User example: “In box 1, cell row 1 column 1 can only be a 9.”
- Structured explanation should name the cell, box, and candidate.

#### Hidden Single

A digit appears as a candidate in only one cell within a house.

- House types: row, column, or box.
- Detection: for each digit 1-9 in each house, count candidate locations; count is 1.
- Action: place that digit in that cell.
- Explanation: “In box 1, only R1C1 can contain 9, so R1C1 must be 9.”

### 9.2 Easy techniques

#### Locked Candidate: Pointing Pair / Pointing Triple

Within a box, all candidates for a digit lie in one row or one column.

- Detection: for each box and digit, candidate cells are all in the same row or same column.
- Action: eliminate that digit from the rest of that row or column outside the box.
- Explanation: “In box 2, all 5s are in row 1, so no other cell in row 1 outside box 2 can be 5.”

#### Locked Candidate: Claiming Pair / Claiming Triple

Within a row or column, all candidates for a digit lie inside one box.

- Detection: for each row/column and digit, candidate cells are all in one box.
- Action: eliminate that digit from the rest of that box outside the row/column.
- Explanation: “In row 6, all 8s are in box 5, so other cells in box 5 cannot be 8.”

### 9.3 Intermediate techniques

#### Naked Pair

Two cells in a house have the exact same two candidates.

- Detection: in any house, find two unsolved cells with identical candidate set of size 2.
- Action: remove those two candidates from other cells in that house.
- Explanation: “R2C1 and R2C7 must be 3 and 8 in some order, so no other cell in row 2 can be 3 or 8.”

#### Naked Triple / Naked Quad

Three or four cells in a house contain only the same three/four candidate digits collectively.

- Detection: combinations of N cells whose union of candidates has size N.
- Action: eliminate those N digits from other cells in the house.
- Difficulty: triple is intermediate; quad is advanced.

#### Hidden Pair

Two digits appear only in the same two cells within a house.

- Detection: candidate locations for two digits are the same pair of cells.
- Action: remove all other candidates from those two cells.
- Explanation: “In column 4, only R3C4 and R8C4 can contain 2 or 7, so those cells cannot contain anything else.”

#### Hidden Triple / Hidden Quad

Three or four digits are restricted to the same three/four cells in a house.

- Detection: candidate-location union size equals digit-set size.
- Action: remove all other candidates from those cells.

### 9.4 Advanced techniques

#### X-Wing

A digit is restricted to the same two columns in two different rows, or the same two rows in two different columns.

- Detection: for a digit, find two rows with exactly the same two candidate columns, or two columns with exactly the same two candidate rows.
- Action: eliminate that digit from the matching columns/rows outside the pattern.
- Explanation: “Rows 2 and 7 place 4 in columns 3 and 8. Therefore other 4s in columns 3 and 8 can be removed.”

#### Swordfish

A digit across three rows is restricted to the same three columns, or vice versa.

- Detection: generalized fish pattern with size 3.
- Action: eliminate candidate from covered columns/rows outside the pattern.

#### Jellyfish

A digit across four rows is restricted to the same four columns, or vice versa.

- Detection: generalized fish pattern with size 4.
- Action: eliminate candidate from covered columns/rows outside the pattern.

#### XY-Wing

A three-cell pattern with one pivot bivalue cell and two pincer bivalue cells.

- Detection: pivot has candidates X/Y; pincers see pivot and have X/Z and Y/Z; cells seeing both pincers cannot contain Z.
- Action: eliminate Z from cells that see both pincers.

#### XYZ-Wing

Similar to XY-Wing, but pivot has X/Y/Z and pincers constrain Z.

- Action: eliminate Z from cells that see all required pattern cells.

### 9.5 Expert techniques

These should be considered later unless there is a strong product need:

- W-Wing
- Skyscraper
- Two-String Kite
- Empty Rectangle
- Simple Coloring
- Multi-Coloring
- Remote Pairs
- Finned X-Wing
- Finned Swordfish
- Almost Locked Sets
- Unique Rectangle
- Nishio / contradiction chains
- Forcing chains
- AIC chains

Policy: expert techniques may produce candidate eliminations but should be introduced only after beginner/intermediate detection and explanation quality is strong.

## 10) Technique Discovery Algorithm

Given a specific board state, the solver should discover techniques by running a deterministic analysis pipeline over the current grid and candidate map.

The key distinction is:

- **placement techniques** reveal one or more numbers immediately,
- **elimination techniques** remove candidates and may reveal numbers after candidates are recomputed.

### 10.1 Core pipeline

1. Parse the board.
2. Validate that the board has no row, column, or box conflicts.
3. Compute candidates for every empty cell.
4. Run technique detectors in increasing difficulty order.
5. Return all currently available steps, or return only the easiest next step depending on API options.
6. If the caller asks for a solve path, apply one safe step, recompute candidates, and repeat.

Pseudocode:

```python
def analyze_board(board, options):
    validate_board(board)
    candidates = compute_all_candidates(board)

    steps = []
    for detector in enabled_detectors_in_difficulty_order(options):
        matches = detector(board, candidates)
        steps.extend(matches)

        if matches and not options.include_all_technique_matches:
            break

    return AnalysisResult(board=board, candidates=candidates, steps=rank_steps(steps))
```

For a full human-style solve path:

```python
def solve_human_path(board, options):
    path = []

    while not board.is_solved():
        analysis = analyze_board(board, options={
            **options,
            "include_all_technique_matches": False,
        })

        if not analysis.steps:
            return HumanSolveResult(status="stuck", path=path, board=board)

        step = analysis.steps[0]
        board = apply_step(board, step)
        path.append(step)

    return HumanSolveResult(status="solved", path=path, board=board)
```

### 10.2 Which techniques reveal numbers directly?

These techniques produce `place_value` actions immediately:

1. **Full House**
   - A row, column, or box has exactly one empty cell.
   - The missing digit is placed.

2. **Naked Single**
   - A cell has exactly one legal candidate.
   - That candidate is placed.

3. **Hidden Single**
   - In a row, column, or box, a digit can go in only one cell.
   - That digit is placed in that cell.

Most other human techniques do **not** directly reveal a value. They produce `eliminate_candidate` actions. After those eliminations are applied, they may create new full houses, naked singles, or hidden singles.

Examples of elimination-first techniques:

- pointing pair / pointing triple,
- claiming pair / claiming triple,
- naked pair / triple / quad,
- hidden pair / triple / quad,
- X-Wing,
- Swordfish,
- Jellyfish,
- XY-Wing,
- XYZ-Wing.

### 10.3 Candidate computation

For each empty cell, candidates are digits 1-9 that do not already appear in the same row, column, or box.

```python
def candidates_for_cell(board, row, col):
    if board[row][col] != 0:
        return set()

    used = set()
    used |= digits_in_row(board, row)
    used |= digits_in_column(board, col)
    used |= digits_in_box(board, box_index(row, col))

    return {1,2,3,4,5,6,7,8,9} - used
```

### 10.4 Detector: Full House

A full house detector scans every row, column, and box.

```python
def detect_full_house(board, candidates):
    steps = []

    for house in all_houses():
        empty_cells = [cell for cell in house.cells if board[cell.row][cell.col] == 0]
        if len(empty_cells) != 1:
            continue

        missing_digits = set(range(1, 10)) - digits_in_house(board, house)
        if len(missing_digits) != 1:
            continue

        cell = empty_cells[0]
        value = only(missing_digits)
        steps.append(place_value_step("full_house", cell, value, house))

    return steps
```

### 10.5 Detector: Naked Single

A naked single detector scans every empty cell.

```python
def detect_naked_single(board, candidates):
    steps = []

    for cell, cell_candidates in candidates.items():
        if len(cell_candidates) == 1:
            value = only(cell_candidates)
            steps.append(place_value_step(
                technique_id="naked_single",
                cell=cell,
                value=value,
                evidence={"candidatesBefore": sorted(cell_candidates)},
            ))

    return steps
```

Example explanation:

> R1C1 can only be 9. Its row, column, and box eliminate every other digit, so R1C1 must be 9.

### 10.6 Detector: Hidden Single

A hidden single detector scans each house and digit.

```python
def detect_hidden_single(board, candidates):
    steps = []

    for house in all_houses():
        for digit in range(1, 10):
            possible_cells = [
                cell
                for cell in house.cells
                if board[cell.row][cell.col] == 0 and digit in candidates[cell]
            ]

            if len(possible_cells) == 1:
                steps.append(place_value_step(
                    technique_id="hidden_single",
                    cell=possible_cells[0],
                    value=digit,
                    house=house,
                    evidence={"digitLocationsInHouse": [possible_cells[0]]},
                ))

    return steps
```

Example explanation:

> In box 1, only R1C1 can contain 9, so R1C1 must be 9.

### 10.7 Detector: Pointing locked candidate

A pointing detector finds candidate eliminations caused by a box-line interaction.

```python
def detect_pointing(board, candidates):
    steps = []

    for box in all_boxes():
        for digit in range(1, 10):
            cells = candidate_cells_in_house(box, digit, candidates)
            if len(cells) < 2:
                continue

            if all_same_row(cells):
                row = cells[0].row
                targets = [
                    cell for cell in row_cells(row)
                    if cell not in box.cells and digit in candidates[cell]
                ]
                if targets:
                    steps.append(eliminate_step("pointing", digit, targets, source_cells=cells))

            if all_same_column(cells):
                col = cells[0].col
                targets = [
                    cell for cell in column_cells(col)
                    if cell not in box.cells and digit in candidates[cell]
                ]
                if targets:
                    steps.append(eliminate_step("pointing", digit, targets, source_cells=cells))

    return steps
```

This does not directly reveal a number unless the resulting eliminations leave a cell with one candidate.

### 10.8 Detector ordering and ranking

When multiple techniques are available, Super Sue should usually prefer the easiest useful step:

1. placement before elimination,
2. lower difficulty score before higher difficulty score,
3. fewer changed cells before more changed cells,
4. clearer explanation before obscure explanation,
5. deterministic stable tie-break by row, column, digit, and technique ID.

Default detector order:

1. Full House
2. Naked Single
3. Hidden Single
4. Pointing
5. Claiming
6. Naked Pair
7. Hidden Pair
8. Naked Triple
9. Hidden Triple
10. X-Wing
11. harder techniques later

### 10.9 Answering “what techniques reveal one or more numbers?” for a board

For a single static board state, the server can answer in three useful modes:

1. `direct_placements_only`
   - Return only techniques that currently place values.
   - Includes full house, naked single, and hidden single.

2. `all_current_steps`
   - Return both placements and candidate eliminations currently available.
   - Useful for coaching and highlighting technique opportunities.

3. `solve_path_until_stuck`
   - Repeatedly apply the easiest safe step.
   - Reports which techniques eventually revealed values after eliminations.

Example response summary:

```json
{
  "directPlacements": [
    { "techniqueId": "naked_single", "cell": "R1C1", "value": 9 }
  ],
  "candidateEliminations": [
    { "techniqueId": "pointing", "digit": 5, "eliminationCount": 2 }
  ],
  "nextRecommendedStep": {
    "techniqueId": "naked_single",
    "summary": "R1C1 can only be 9."
  }
}
```

## 11) Initial Implementation Priority

The first server solver milestone should implement techniques in this order:

1. Board parsing and validation.
2. Candidate computation.
3. Full House.
4. Naked Single.
5. Hidden Single in row, column, and box.
6. Locked candidates: pointing.
7. Locked candidates: claiming.
8. Naked Pair.
9. Hidden Pair.
10. X-Wing.

This order gives Super Sue useful coaching early without jumping to hard-to-explain techniques.

## 12) API Design

All endpoints are optional for the frontend.

### 12.1 Health

`GET /api/v1/health`

Response:

```json
{
  "ok": true,
  "service": "sudoku-offline-server",
  "version": "0.2.0"
}
```

### 12.2 Technique catalog

`GET /api/v1/techniques`

Returns supported and planned techniques.

```json
{
  "schemaVersion": 1,
  "supported": [
    {
      "techniqueId": "naked_single",
      "name": "Naked Single",
      "difficultyBand": "beginner",
      "actionTypes": ["place_value"]
    }
  ],
  "planned": ["hidden_pair", "x_wing"]
}
```

### 12.3 Analyze board

`POST /api/v1/analyze`

Request:

```json
{
  "schemaVersion": 1,
  "board": {
    "grid": "...81 digits...",
    "givens": "...81 digits...",
    "notes": {}
  },
  "options": {
    "candidatePolicy": "computed",
    "maxSteps": 10,
    "includeAllTechniqueMatches": false,
    "allowedTechniques": ["full_house", "naked_single", "hidden_single"]
  }
}
```

Response: structured solver output as described above.

### 12.4 Explain one step

`POST /api/v1/explain-step`

Use when the client already has a `stepId` from analysis but wants a more detailed explanation.

```json
{
  "schemaVersion": 1,
  "board": { "grid": "..." },
  "step": { "techniqueId": "naked_single", "placements": [{ "row": 0, "col": 0, "value": 9 }] },
  "style": "friendly"
}
```

### 12.5 Apply one step

`POST /api/v1/apply-step`

Applies a solver step to a board and returns the updated board.

Rules:

- Only apply deterministic validated steps.
- Never overwrite givens.
- Never place a value that violates Sudoku constraints.
- Candidate eliminations should be returned as notes/candidate updates, not forced values.

### 12.6 Invoke a specific technique

`POST /api/v1/analyze/technique/{techniqueId}`

This endpoint is for testing, debugging, demos, and an optional advanced UI mode. It runs exactly one requested technique detector against the current board state instead of running the normal easiest-step discovery pipeline.

Use cases:

- prove that a technique detector works on a golden board fixture,
- let developers compare detector output during implementation,
- let advanced users ask “Is there an X-Wing here?”,
- let Super Sue explain why a requested technique is or is not available.

Request:

```json
{
  "schemaVersion": 1,
  "board": {
    "grid": "...81 digits...",
    "givens": "...81 digits...",
    "notes": {}
  },
  "options": {
    "candidatePolicy": "computed",
    "includeCandidates": true,
    "includeNegativeExplanation": true,
    "maxMatches": 20
  }
}
```

Response when the technique is available:

```json
{
  "schemaVersion": 1,
  "techniqueId": "naked_single",
  "available": true,
  "candidates": {
    "0,0": [9],
    "0,1": [1, 2, 3]
  },
  "steps": [
    {
      "techniqueId": "naked_single",
      "actionType": "place_value",
      "placements": [{ "row": 0, "col": 0, "value": 9 }],
      "explanation": {
        "short": "R1C1 can only be 9."
      }
    }
  ]
}
```

Response when the technique is not available:

```json
{
  "schemaVersion": 1,
  "techniqueId": "x_wing",
  "available": false,
  "candidates": {
    "0,0": [1, 9],
    "0,1": [1, 2, 3]
  },
  "steps": [],
  "explanation": {
    "short": "No X-Wing is currently available.",
    "full": "For an X-Wing, a digit must be restricted to the same two columns in two rows, or the same two rows in two columns. This board does not currently contain that pattern."
  }
}
```

Rules:

- Unknown `techniqueId` returns a 404 or validation error with the supported technique list.
- Disabled or not-yet-implemented techniques return a clear `supported: false` response.
- This endpoint should not apply changes to the board.
- This endpoint should use the same detector implementation as normal analysis, not a separate testing-only path.

### 12.7 Reveal all candidates

`POST /api/v1/candidates`

Returns the legal candidate map for the current board. This is useful for tests, advanced mode, debugging, and education.

Request:

```json
{
  "schemaVersion": 1,
  "board": {
    "grid": "...81 digits...",
    "givens": "...81 digits...",
    "notes": {}
  },
  "options": {
    "candidatePolicy": "computed",
    "includeInvalidUserNotes": true
  }
}
```

Response:

```json
{
  "schemaVersion": 1,
  "isValid": true,
  "candidates": {
    "0,0": [9],
    "0,1": [1, 2, 3],
    "8,8": [4, 7]
  },
  "invalidUserNotes": {
    "0,1": [8]
  }
}
```

The frontend advanced UI may render this as “Reveal all candidates.” It should be visually distinct from player-entered notes so users understand whether they are viewing their own notes or solver-computed candidates.

### 12.8 Super Sue chat

`POST /api/v1/super-sue/chat`

Request:

```json
{
  "schemaVersion": 1,
  "board": { "grid": "...", "givens": "...", "notes": {} },
  "transcriptContext": [],
  "message": "Can you give me a small hint?",
  "coachOptions": {
    "tone": "friendly",
    "hintLevel": "nudge",
    "allowAnswerReveal": false
  }
}
```

Response:

```json
{
  "schemaVersion": 1,
  "reply": "Take a close look at box 1. One cell has only one possible value left.",
  "grounding": {
    "source": "technique_engine",
    "techniqueId": "naked_single",
    "stepId": "step-001"
  },
  "suggestedActions": [
    { "type": "highlight_cell", "row": 0, "col": 0 }
  ]
}
```

## 13) Super Sue Hint Levels

Super Sue should support progressive reveal rather than immediately giving the answer.

1. `nudge`
   - Names a region or general pattern.
   - Example: “Check box 1 carefully.”

2. `technique`
   - Names the technique.
   - Example: “There is a naked single in box 1.”

3. `cell`
   - Identifies the cell.
   - Example: “Look at R1C1.”

4. `answer`
   - Gives the value and reason.
   - Example: “R1C1 must be 9 because every other digit is eliminated by its row, column, and box.”

Default: `nudge`.

If `allowAnswerReveal` is false, Super Sue should stop before the `answer` level.

## 14) Explanation Style Guidelines

Explanations should be:

- correct,
- short by default,
- friendly,
- grounded in visible board facts,
- progressive,
- suitable for beginners.

Preferred wording:

- “R1C1 can only be 9.”
- “In box 1, only R1C1 can contain 9.”
- “These two cells must be 3 and 8 in some order.”

Avoid:

- “Obviously...”
- “Just...”
- unexplained expert jargon,
- claiming a technique without naming the relevant cells/houses.

## 15) Frontend Integration Concepts

The frontend can use server results to:

- highlight a cell,
- highlight a row/column/box,
- show candidate eliminations,
- reveal all computed candidates in an advanced/debug overlay,
- invoke one specific technique detector from an advanced/testing panel,
- offer “Apply this step” for safe deterministic actions,
- open a Super Sue chat panel,
- append coaching events to local transcript.

### 15.1 Advanced / testing UI mode

Advanced mode is not the default player experience. It is a developer, tester, and power-user surface for inspecting the solver.

Suggested controls:

- `Reveal all candidates` toggle/button.
- Technique picker populated from `GET /api/v1/techniques`.
- `Run selected technique` button.
- Result panel showing:
  - whether the technique is available,
  - placements,
  - eliminations,
  - candidate map before/after, if applicable,
  - short and full explanation.
- Optional `Apply step` button for safe deterministic steps.

UI safety rules:

- Advanced mode should be explicitly labeled as assisted/debug functionality.
- Revealed candidates should not overwrite player notes unless the user explicitly chooses to copy them.
- Invoking a technique should not mutate the board by itself.
- Applying a returned step should create a transcript event and mark the run as assisted or debug-assisted, depending on future scoring policy.

Suggested UI events to add later:

- `server_analysis_requested`
- `server_analysis_received`
- `super_sue_message_sent`
- `super_sue_message_received`
- `all_candidates_revealed`
- `specific_technique_requested`
- `specific_technique_result_received`
- `solver_step_previewed`
- `solver_step_applied`

## 16) Validation and Safety Rules

The server must reject or flag:

- grids that are not 81 digits,
- givens that conflict with current values,
- duplicate values in a row, column, or box,
- attempts to modify fixed cells,
- technique results that do not actually follow from the board state.

Every solver step should be independently verifiable by tests.

## 17) Testing Expectations

### 17.1 Unit tests

Add tests for:

- board parsing,
- coordinate conversion,
- candidate computation,
- invalid board detection,
- each technique detector,
- explanation text containing required cells/digits/houses,
- applying placements,
- applying candidate eliminations.

### 17.2 API tests

Add FastAPI tests for:

- `/api/v1/health`,
- `/api/v1/techniques`,
- `/api/v1/analyze`,
- `/api/v1/analyze/technique/{techniqueId}` for available and unavailable technique cases,
- `/api/v1/candidates` for reveal-all-candidates behavior,
- invalid request handling,
- Super Sue response grounded in a solver step.

### 17.3 Golden board fixtures

Maintain known board states for each technique.

Recommended fixture naming:

- `naked_single_r1c1_is_9.json`
- `hidden_single_box1_r1c1_is_9.json`
- `pointing_pair_box2_row1_eliminates_5.json`
- `x_wing_rows2_7_cols3_8_eliminates_4.json`

Each fixture should include:

- input board,
- expected technique ID,
- expected placements / eliminations,
- expected explanation facts.

## 18) Open Questions

1. Should Super Sue be available only through the optional server, or should the client eventually include a tiny local non-chat coach for beginner techniques?
2. Should the first server be hosted by the user locally, deployed publicly, or both?
3. Should candidate notes in the UI remain user-owned, or should server candidate eliminations update a separate “coach candidates” overlay?
4. How much answer reveal should be allowed by default?
5. Should transcript upload require explicit consent even before accounts exist?
6. What is the preferred server language organization: keep all FastAPI code in `src/sudoku/main.py` for now, or split into modules such as `solver.py`, `models.py`, and `coach.py` immediately?

## 19) Acceptance Summary

This design is accepted when:

1. The optional server role is clear and does not compromise offline play.
2. Super Sue is defined as a coach grounded by deterministic solver output.
3. A progressive human-technique inventory exists.
4. The solver output format can represent placements, eliminations, evidence, and explanations.
5. Initial API endpoints are specified.
6. The first implementation priority is clear enough to create a follow-up implementation plan.
