import { createTranscript } from "./transcript.js";

const RUN_KEY = "sudoku_run";
const SAVE_KEY = "sudoku_save";
const PREFS_KEY = "sudoku_prefs";

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

function normalizeBoardSnapshot(rawBoard) {
  if (!Array.isArray(rawBoard) || rawBoard.length !== 9) {
    return null;
  }

  const snapshot = [];
  for (let row = 0; row < 9; row += 1) {
    const rawRow = rawBoard[row];
    if (!Array.isArray(rawRow) || rawRow.length !== 9) {
      return null;
    }

    const snapshotRow = [];
    for (let col = 0; col < 9; col += 1) {
      const source = rawRow[col] || {};
      snapshotRow.push({
        value: Number.isInteger(source.value) && source.value >= 1 && source.value <= 9
          ? source.value
          : null,
        fixed: Boolean(source.fixed),
        solution: Number.isInteger(source.solution) && source.solution >= 1 && source.solution <= 9
          ? source.solution
          : null,
        error: Boolean(source.error),
        notes: Array.isArray(source.notes)
          ? source.notes.filter((note) => Number.isInteger(note) && note >= 1 && note <= 9)
          : [],
      });
    }

    snapshot.push(snapshotRow);
  }

  return snapshot;
}

function normalizeRunState(raw) {
  const runId = typeof raw?.runId === "string" && raw.runId.trim().length > 0
    ? raw.runId
    : null;
  const puzzleId = typeof raw?.puzzleId === "string" && raw.puzzleId.trim().length > 0
    ? raw.puzzleId
    : "unknown";

  return {
    schemaVersion: 2,
    runId,
    puzzleId,
    assisted: Boolean(raw?.assisted),
    transcript: createTranscript(raw?.transcript),
    transcriptTruncated: Boolean(raw?.transcriptTruncated),
    boardRevision: Number.isFinite(raw?.boardRevision)
      ? Math.max(0, Math.floor(raw.boardRevision))
      : 0,
    baseBoardSnapshot: normalizeBoardSnapshot(raw?.baseBoardSnapshot),
    currentBoardEventId:
      typeof raw?.currentBoardEventId === "string" && raw.currentBoardEventId.length > 0
        ? raw.currentBoardEventId
        : null,
    savepointBoardEventId:
      typeof raw?.savepointBoardEventId === "string" && raw.savepointBoardEventId.length > 0
        ? raw.savepointBoardEventId
        : null,
  };
}

function normalizePrefs(raw) {
  return {
    hintOverlayEnabled: Boolean(raw?.hintOverlayEnabled),
  };
}

export function loadPrefs() {
  const parsed = parseJson(localStorage.getItem(PREFS_KEY));
  if (!parsed || typeof parsed !== "object") {
    return normalizePrefs({});
  }

  return normalizePrefs(parsed);
}

export function savePrefs(prefs) {
  const normalized = normalizePrefs(prefs || {});
  localStorage.setItem(PREFS_KEY, JSON.stringify(normalized));
  return normalized;
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
  const normalized = saveRunState({ assisted: false, transcript: [] });
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

  const { hintsUsed: _legacyHintsUsed, ...saveWithoutLegacyHintCounter } = save;
  const normalized = normalizeRunState(state || {});
  localStorage.setItem(
    SAVE_KEY,
    JSON.stringify({
      ...saveWithoutLegacyHintCounter,
      assisted: normalized.assisted,
      run: normalized,
    }),
  );
}
