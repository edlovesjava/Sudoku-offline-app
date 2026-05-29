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
