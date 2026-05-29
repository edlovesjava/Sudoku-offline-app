const BASE_SOLUTION = Array.from({ length: 81 }, (_, idx) => {
  const row = Math.floor(idx / 9);
  const col = idx % 9;
  return ((row * 3 + Math.floor(row / 3) + col) % 9) + 1;
});

const MIN_RANK = 50;
const MAX_RANK = 500;
const MAX_UNIQUE_GENERATION_ATTEMPTS = 6;
const MAX_CLUE_FALLBACK_STEPS = 6;

function randomInt(maxExclusive) {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    return value[0] % maxExclusive;
  }
  return Math.floor(Math.random() * maxExclusive);
}

function shuffle(values) {
  const arr = [...values];
  for (let idx = arr.length - 1; idx > 0; idx -= 1) {
    const swapIdx = randomInt(idx + 1);
    [arr[idx], arr[swapIdx]] = [arr[swapIdx], arr[idx]];
  }
  return arr;
}

function clampRank(rank) {
  const parsed = Number(rank);
  if (!Number.isFinite(parsed)) {
    return 150;
  }
  return Math.min(MAX_RANK, Math.max(MIN_RANK, Math.round(parsed)));
}

function createRowOrColOrder() {
  const groupOrder = shuffle([0, 1, 2]);
  const itemOrders = [shuffle([0, 1, 2]), shuffle([0, 1, 2]), shuffle([0, 1, 2])];
  const ordered = [];
  for (const groupIdx of groupOrder) {
    for (const itemIdx of itemOrders[groupIdx]) {
      ordered.push((groupIdx * 3) + itemIdx);
    }
  }
  return ordered;
}

function remapSolutionDigits(solutionDigits) {
  const shuffledDigits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const mapped = solutionDigits.map((digit) => shuffledDigits[digit - 1]);
  return mapped.join("");
}

function createSolvedGridString() {
  const rowOrder = createRowOrColOrder();
  const colOrder = createRowOrColOrder();

  const permuted = [];
  for (const row of rowOrder) {
    for (const col of colOrder) {
      permuted.push(BASE_SOLUTION[(row * 9) + col]);
    }
  }

  return remapSolutionDigits(permuted);
}

function clueCountForRank(rank) {
  const normalized = (rank - MIN_RANK) / (MAX_RANK - MIN_RANK);
  return Math.round(44 - (normalized * 22));
}

function countBits(mask) {
  let count = 0;
  let value = mask;
  while (value) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

function countGridSolutions(grid, limit = 2) {
  const rowMask = new Uint16Array(9);
  const colMask = new Uint16Array(9);
  const boxMask = new Uint16Array(9);
  const cells = Array.from(grid, (digit) => Number(digit));
  const empties = [];

  const boxIndex = (row, col) => (Math.floor(row / 3) * 3) + Math.floor(col / 3);

  for (let idx = 0; idx < 81; idx += 1) {
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    const value = cells[idx];
    if (value === 0) {
      empties.push(idx);
      continue;
    }

    const bit = 1 << value;
    const box = boxIndex(row, col);
    if ((rowMask[row] & bit) || (colMask[col] & bit) || (boxMask[box] & bit)) {
      return 0;
    }

    rowMask[row] |= bit;
    colMask[col] |= bit;
    boxMask[box] |= bit;
  }

  let solutions = 0;

  const search = () => {
    if (solutions >= limit) {
      return;
    }

    let bestIdx = -1;
    let bestCandidates = 0;
    let bestCount = 10;

    for (const idx of empties) {
      if (cells[idx] !== 0) {
        continue;
      }

      const row = Math.floor(idx / 9);
      const col = idx % 9;
      const box = boxIndex(row, col);
      const used = rowMask[row] | colMask[col] | boxMask[box];
      const available = (~used) & 0x3FE;
      const candidateCount = countBits(available);

      if (candidateCount === 0) {
        return;
      }
      if (candidateCount < bestCount) {
        bestCount = candidateCount;
        bestIdx = idx;
        bestCandidates = available;
        if (candidateCount === 1) {
          break;
        }
      }
    }

    if (bestIdx === -1) {
      solutions += 1;
      return;
    }

    const row = Math.floor(bestIdx / 9);
    const col = bestIdx % 9;
    const box = boxIndex(row, col);

    for (let digit = 1; digit <= 9; digit += 1) {
      const bit = 1 << digit;
      if ((bestCandidates & bit) === 0) {
        continue;
      }

      cells[bestIdx] = digit;
      rowMask[row] |= bit;
      colMask[col] |= bit;
      boxMask[box] |= bit;

      search();

      cells[bestIdx] = 0;
      rowMask[row] &= ~bit;
      colMask[col] &= ~bit;
      boxMask[box] &= ~bit;

      if (solutions >= limit) {
        return;
      }
    }
  };

  search();
  return solutions;
}

function carvePuzzleGrid(solution, clueCount) {
  const cells = [...solution];
  const indices = shuffle(Array.from({ length: 81 }, (_, idx) => idx));
  let clues = 81;

  for (const idx of indices) {
    if (clues <= clueCount) {
      break;
    }

    const previous = cells[idx];
    cells[idx] = "0";

    if (countGridSolutions(cells.join(""), 2) !== 1) {
      cells[idx] = previous;
      continue;
    }

    clues -= 1;
  }

  if (clues > clueCount) {
    return null;
  }

  return cells.join("");
}

function createPuzzleId() {
  return `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateBrowserPuzzle(rank = 150) {
  const normalizedRank = clampRank(rank);
  const targetClueCount = clueCountForRank(normalizedRank);

  for (let attempt = 0; attempt < MAX_UNIQUE_GENERATION_ATTEMPTS; attempt += 1) {
    const solution = createSolvedGridString();
    for (let fallbackStep = 0; fallbackStep <= MAX_CLUE_FALLBACK_STEPS; fallbackStep += 1) {
      const grid = carvePuzzleGrid(solution, targetClueCount + fallbackStep);
      if (!grid) {
        continue;
      }

      return {
        schemaVersion: 1,
        puzzleId: createPuzzleId(),
        grid,
        solution,
        difficulty: normalizedRank,
        source: "browser",
      };
    }
  }

  return null;
}
