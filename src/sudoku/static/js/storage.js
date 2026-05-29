const RUN_KEY = "sudoku_run";
const SAVE_KEY = "sudoku_save";

function parseJson(raw) {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeRunState(raw) {
  const hintsUsed = Number.isFinite(Number(raw?.hintsUsed))
    ? Math.max(0, Math.floor(Number(raw.hintsUsed)))
    : 0;

  return {
    schemaVersion: 1,
    assisted: Boolean(raw?.assisted),
    hintsUsed,
  };
}

export function loadRunState() {
  const parsed = parseJson(localStorage.getItem(RUN_KEY));
  if (!parsed || typeof parsed !== "object") {
    return null;
  }

  return normalizeRunState(parsed);
}

export function saveRunState(state) {
  const normalized = normalizeRunState(state || {});
  localStorage.setItem(RUN_KEY, JSON.stringify(normalized));
  return normalized;
}

export function resetRunState() {
  const normalized = saveRunState({ assisted: false, hintsUsed: 0 });
  syncRunStateToSave(normalized);
  return normalized;
}

export function loadRunStateFromSave() {
  const save = parseJson(localStorage.getItem(SAVE_KEY));
  if (!save || typeof save !== "object") {
    return null;
  }

  if (save.run && typeof save.run === "object") {
    return normalizeRunState(save.run);
  }

  if (Object.prototype.hasOwnProperty.call(save, "assisted") || Object.prototype.hasOwnProperty.call(save, "hintsUsed")) {
    return normalizeRunState(save);
  }

  return null;
}

export function syncRunStateToSave(state) {
  const save = parseJson(localStorage.getItem(SAVE_KEY));
  if (!save || typeof save !== "object" || !Array.isArray(save.board)) {
    return;
  }

  const normalized = normalizeRunState(state || {});
  localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({
      ...save,
      assisted: normalized.assisted,
      hintsUsed: normalized.hintsUsed,
      run: normalized,
    }),
  );
}
