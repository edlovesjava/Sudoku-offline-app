const BASE_SOLUTION = Array.from({ length: 81 }, (_, idx) => {
  const row = Math.floor(idx / 9);
  const col = idx % 9;
  return ((row * 3 + Math.floor(row / 3) + col) % 9) + 1;
});

const MIN_RANK = 50;
const MAX_RANK = 500;

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

function carvePuzzleGrid(solution, clueCount) {
  const indices = shuffle(Array.from({ length: 81 }, (_, idx) => idx));
  const keep = new Set(indices.slice(0, clueCount));
  return Array.from(solution, (digit, idx) => (keep.has(idx) ? digit : "0")).join("");
}

function createPuzzleId() {
  return `browser-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateBrowserPuzzle(rank = 150) {
  const normalizedRank = clampRank(rank);
  const solution = createSolvedGridString();
  const grid = carvePuzzleGrid(solution, clueCountForRank(normalizedRank));

  return {
    schemaVersion: 1,
    puzzleId: createPuzzleId(),
    grid,
    solution,
    difficulty: normalizedRank,
    source: "browser",
  };
}
