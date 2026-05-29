const GRID_RE = /^[0-9]{81}$/;

function assertString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
}

export function assertPuzzlePackage(pkg) {
  if (!pkg || typeof pkg !== "object") {
    throw new Error("invalid puzzle package");
  }
  if (pkg.schemaVersion !== 1) {
    throw new Error("unsupported schemaVersion");
  }

  assertString(pkg.puzzleId, "puzzleId");
  assertString(pkg.grid, "grid");
  assertString(pkg.solution, "solution");

  if (!GRID_RE.test(pkg.grid)) {
    throw new Error("grid must be 81 digits");
  }
  if (!GRID_RE.test(pkg.solution)) {
    throw new Error("solution must be 81 digits");
  }
  if (typeof pkg.difficulty !== "number" || !Number.isFinite(pkg.difficulty)) {
    throw new Error("difficulty must be a finite number");
  }

  return pkg;
}

export function createRunRecord({ puzzleId, assisted = false, elapsedMs = 0 } = {}) {
  assertString(puzzleId, "puzzleId");

  return {
    schemaVersion: 1,
    puzzleId,
    elapsedMs: Math.max(0, Math.floor(elapsedMs)),
    mistakes: 0,
    hintsUsed: 0,
    assisted: Boolean(assisted),
    configProfile: "default",
    createdAt: new Date().toISOString(),
  };
}
