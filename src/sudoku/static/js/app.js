import { DEFAULT_PROFILE } from "./config.js";
import { loadPuzzle } from "./providers.js";
import { generateBrowserPuzzle } from "./generator.js";
import { createLongPressHelper } from "./input.js";
import {
  loadPrefs,
  loadRunState,
  loadRunStateFromSave,
  resetRunState,
  savePrefs,
  saveRunState,
  syncRunStateToSave,
} from "./storage.js";
import { getInvalidDigitsForCell } from "./rules.js";
import { appendTranscriptEvent, getBoardEvents } from "./transcript.js";

function getRuntimeBoardBridge() {
  const existing = window.__sudokuBoardBridge;
  if (existing && typeof existing.read === "function" && typeof existing.write === "function") {
    return existing;
  }

  try {
    window.eval(`
      (() => {
        if (typeof board === "undefined") {
          return;
        }
        if (!window.__sudokuBoardBridge || typeof window.__sudokuBoardBridge.read !== "function" || typeof window.__sudokuBoardBridge.write !== "function") {
          window.__sudokuBoardBridge = {
            read: () => board,
            write: (nextBoard) => {
              board = nextBoard;
              return board;
            },
          };
        }
      })();
    `);
  } catch {
    return null;
  }

  const bridge = window.__sudokuBoardBridge;
  if (bridge && typeof bridge.read === "function" && typeof bridge.write === "function") {
    return bridge;
  }
  return null;
}

function readRuntimeBoard() {
  const bridge = getRuntimeBoardBridge();
  if (!bridge) {
    return null;
  }
  try {
    return bridge.read();
  } catch {
    return null;
  }
}

function writeRuntimeBoard(nextBoard) {
  const bridge = getRuntimeBoardBridge();
  if (!bridge) {
    return false;
  }
  try {
    bridge.write(nextBoard);
    return true;
  } catch {
    return false;
  }
}

function ensureDebugState() {
  window.__sudokuDebug = {
    ...(window.__sudokuDebug || {}),
    lastPuzzleSource: null,
    disableBrowserProvider: Boolean(window.__sudokuDebug?.disableBrowserProvider),
    generatePuzzleForTest: (rank) => generateBrowserPuzzle(rank),
    emitTranscriptSpamForTest:
      window.__sudokuDebug?.emitTranscriptSpamForTest || (() => 0),
  };
}

function bindPuzzleProvider() {
  if (typeof window.fetchPuzzle !== "function") {
    return;
  }

  window.fetchPuzzle = async (rank) => {
    const { package: pkg, source } = await loadPuzzle({ rank });
    window.__sudokuDebug.lastPuzzleSource = source;
    if (typeof pkg?.puzzleId === "string" && pkg.puzzleId) {
      window.__sudokuDebug.lastPuzzleId = pkg.puzzleId;
    }
    return {
      difficulty: pkg.difficulty,
      initial_grid: pkg.grid,
      solution_key: pkg.solution,
      puzzleId: pkg.puzzleId,
    };
  };
}

function bindRunTracking() {
  const createRunId = () => `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createEventId = () => `event-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const getElapsedMs = () => {
    try {
      const save = JSON.parse(localStorage.getItem("sudoku_save") || "null");
      const timerElapsed = Number(save?.timerElapsed);
      if (Number.isFinite(timerElapsed) && timerElapsed >= 0) {
        return Math.floor(timerElapsed * 1000);
      }
    } catch {
    }
    return 0;
  };

  let runState = loadRunStateFromSave() || loadRunState() || resetRunState();
  runState = saveRunState({
    ...runState,
    runId: runState.runId || createRunId(),
    puzzleId: runState.puzzleId || "unknown",
    transcriptTruncated: Boolean(runState.transcriptTruncated),
  });
  syncRunStateToSave(runState);

  let baseBoardSnapshot = null;
  let undoButton = null;
  let redoButton = null;
  let savepointButton = null;
  let undoToSavepointButton = null;
  let clearSavepointButton = null;

  const cloneBoardState = (rawBoard) => {
    if (!Array.isArray(rawBoard) || rawBoard.length !== 9) {
      return null;
    }

    const clonedBoard = [];
    for (let row = 0; row < 9; row += 1) {
      if (!Array.isArray(rawBoard[row]) || rawBoard[row].length !== 9) {
        return null;
      }

      const clonedRow = [];
      for (let col = 0; col < 9; col += 1) {
        const source = rawBoard[row][col] || {};
        clonedRow.push({
          value: Number.isInteger(source.value) ? source.value : null,
          fixed: Boolean(source.fixed),
          solution: Number.isInteger(source.solution) ? source.solution : null,
          error: Boolean(source.error),
          notes: Array.isArray(source.notes)
            ? source.notes.filter((note) => Number.isInteger(note) && note >= 1 && note <= 9)
            : [],
        });
      }

      clonedBoard.push(clonedRow);
    }

    return clonedBoard;
  };

  const readBoardState = () => {
    return cloneBoardState(readRuntimeBoard());
  };

  const writeBoardState = (nextBoard) => {
    const cloned = cloneBoardState(nextBoard);
    if (!cloned) {
      return false;
    }

    if (!writeRuntimeBoard(cloned)) {
      return false;
    }
    window.renderGrid?.();
    window.saveGame?.();
    return true;
  };

  const setBaseBoardSnapshot = (boardState, persist = false) => {
    const snapshot = cloneBoardState(boardState);
    if (!snapshot) {
      return false;
    }
    baseBoardSnapshot = snapshot;
    if (persist) {
      runState = {
        ...runState,
        baseBoardSnapshot: snapshot,
      };
      persistRunState();
    }
    return true;
  };

  const captureBaseBoardSnapshot = (persist = false) => {
    return setBaseBoardSnapshot(readBoardState(), persist);
  };

  const normalizeNotes = (notes) => {
    if (!Array.isArray(notes)) {
      return [];
    }
    return notes
      .filter((note) => Number.isInteger(note) && note >= 1 && note <= 9)
      .sort((left, right) => left - right);
  };

  const areNotesEqual = (left, right) => {
    const normalizedLeft = normalizeNotes(left);
    const normalizedRight = normalizeNotes(right);
    if (normalizedLeft.length !== normalizedRight.length) {
      return false;
    }
    for (let i = 0; i < normalizedLeft.length; i += 1) {
      if (normalizedLeft[i] !== normalizedRight[i]) {
        return false;
      }
    }
    return true;
  };

  const hasCellChanged = (beforeCell, afterCell) => {
    if (!beforeCell || !afterCell) {
      return false;
    }
    return beforeCell.value !== afterCell.value
      || beforeCell.error !== afterCell.error
      || !areNotesEqual(beforeCell.notes, afterCell.notes);
  };

  const getBoardMutations = (beforeBoard, afterBoard) => {
    if (!beforeBoard || !afterBoard) {
      return [];
    }

    const mutations = [];
    for (let row = 0; row < 9; row += 1) {
      for (let col = 0; col < 9; col += 1) {
        const beforeCell = beforeBoard?.[row]?.[col];
        const afterCell = afterBoard?.[row]?.[col];
        if (!beforeCell || !afterCell || afterCell.fixed) {
          continue;
        }
        if (!hasCellChanged(beforeCell, afterCell)) {
          continue;
        }
        mutations.push({ row, col, beforeCell, afterCell });
      }
    }
    return mutations;
  };

  const getSingleToggledNote = (beforeNotes, afterNotes) => {
    const beforeSet = new Set(normalizeNotes(beforeNotes));
    const afterSet = new Set(normalizeNotes(afterNotes));
    const delta = [];
    for (const note of beforeSet) {
      if (!afterSet.has(note)) {
        delta.push(note);
      }
    }
    for (const note of afterSet) {
      if (!beforeSet.has(note)) {
        delta.push(note);
      }
    }
    if (delta.length !== 1) {
      return null;
    }
    return delta[0];
  };

  const ensureRunIdentity = () => {
    if (!runState.runId) {
      runState = {
        ...runState,
        runId: createRunId(),
      };
    }
    if (!runState.puzzleId) {
      runState = {
        ...runState,
        puzzleId: "unknown",
      };
    }
  };

  const getBoardEventId = (event) => {
    if (typeof event?.eventId === "string" && event.eventId) {
      return event.eventId;
    }
    if (Number.isFinite(event?.boardRevision)) {
      return `board-${Math.max(0, Math.floor(event.boardRevision))}`;
    }
    return null;
  };

  const getCurrentBoardEventIndex = (boardEvents) => {
    if (runState.currentBoardEventId == null) {
      return -1;
    }
    return boardEvents.findIndex((event) => getBoardEventId(event) === runState.currentBoardEventId);
  };

  const getBoardEventIndexById = (boardEvents, eventId) => {
    if (eventId == null) {
      return -1;
    }
    return boardEvents.findIndex((event) => getBoardEventId(event) === eventId);
  };

  const canUndo = () => {
    const boardEvents = getBoardEvents(runState.transcript);
    return getCurrentBoardEventIndex(boardEvents) >= 0;
  };

  const canRedo = () => {
    const boardEvents = getBoardEvents(runState.transcript);
    const nextIndex = getCurrentBoardEventIndex(boardEvents) + 1;
    return nextIndex >= 0 && nextIndex < boardEvents.length;
  };

  const canUndoToSavepoint = () => {
    if (runState.savepointBoardEventId == null) {
      return false;
    }
    const boardEvents = getBoardEvents(runState.transcript);
    return getBoardEventIndexById(boardEvents, runState.savepointBoardEventId) >= 0;
  };

  const updateUndoRedoButtons = () => {
    if (undoButton) {
      undoButton.disabled = !canUndo();
    }
    if (redoButton) {
      redoButton.disabled = !canRedo();
    }
    if (undoToSavepointButton) {
      undoToSavepointButton.disabled = !canUndoToSavepoint();
    }
    if (clearSavepointButton) {
      clearSavepointButton.disabled = runState.savepointBoardEventId == null;
    }
  };

  const persistRunState = () => {
    ensureRunIdentity();
    runState = saveRunState(runState);
    syncRunStateToSave(runState);
    updateUndoRedoButtons();
  };

  const pruneFutureBoardEvents = () => {
    const boardEvents = getBoardEvents(runState.transcript);
    const currentIndex = getCurrentBoardEventIndex(boardEvents);
    if (currentIndex >= boardEvents.length - 1) {
      return;
    }

    const retainedBoardIds = new Set(
      boardEvents
        .slice(0, Math.max(0, currentIndex + 1))
        .map((event) => getBoardEventId(event))
        .filter((eventId) => eventId != null),
    );

    const transcript = (Array.isArray(runState.transcript) ? runState.transcript : []).filter((event) => {
      if (event?.eventClass !== "board") {
        return true;
      }
      return retainedBoardIds.has(getBoardEventId(event));
    });

    const savepointBoardEventId =
      runState.savepointBoardEventId && retainedBoardIds.has(runState.savepointBoardEventId)
        ? runState.savepointBoardEventId
        : null;

    runState = {
      ...runState,
      transcript,
      currentBoardEventId: currentIndex >= 0 ? getBoardEventId(boardEvents[currentIndex]) : null,
      savepointBoardEventId,
    };
  };

  const applyBoardEvent = (boardState, event) => {
    const row = Number(event?.row);
    const col = Number(event?.col);
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row > 8 || col < 0 || col > 8) {
      return;
    }

    const cell = boardState?.[row]?.[col];
    if (!cell || cell.fixed) {
      return;
    }

    if (event.eventType === "erase_applied") {
      cell.value = null;
      cell.error = false;
      cell.notes = [];
      return;
    }

    const value = Number(event?.value);
    if (!Number.isInteger(value) || value < 1 || value > 9) {
      return;
    }

    if (event.eventType === "note_toggled" || event.mode === "notes") {
      if (cell.value) {
        return;
      }
      if (!Array.isArray(cell.notes)) {
        cell.notes = [];
      }
      const index = cell.notes.indexOf(value);
      if (index === -1) {
        cell.notes.push(value);
      } else {
        cell.notes.splice(index, 1);
      }
      cell.notes.sort((left, right) => left - right);
      return;
    }

    if (event.eventType === "value_entered") {
      cell.value = value;
      cell.error = Number.isInteger(cell.solution) && value !== cell.solution;
      cell.notes = [];
    }
  };

  const replayBoardToCursor = () => {
    if (!baseBoardSnapshot) {
      const boardEvents = getBoardEvents(runState.transcript);
      if (boardEvents.length === 0) {
        captureBaseBoardSnapshot(true);
      }
    }
    if (!baseBoardSnapshot) {
      return false;
    }

    const boardEvents = getBoardEvents(runState.transcript);
    const currentIndex = getCurrentBoardEventIndex(boardEvents);
    const rebuiltBoard = cloneBoardState(baseBoardSnapshot);
    if (!rebuiltBoard) {
      return false;
    }

    const endExclusive = currentIndex >= 0 ? currentIndex + 1 : 0;
    for (let i = 0; i < endExclusive; i += 1) {
      applyBoardEvent(rebuiltBoard, boardEvents[i]);
    }

    if (!writeBoardState(rebuiltBoard)) {
      return false;
    }

    persistRunState();
    return true;
  };

  const moveUndoCursorBackward = () => {
    const boardEvents = getBoardEvents(runState.transcript);
    const currentIndex = getCurrentBoardEventIndex(boardEvents);
    if (currentIndex < 0) {
      return false;
    }

    const previousCursor = runState.currentBoardEventId;
    runState = {
      ...runState,
      currentBoardEventId: currentIndex === 0 ? null : getBoardEventId(boardEvents[currentIndex - 1]),
    };
    if (replayBoardToCursor()) {
      return true;
    }

    runState = {
      ...runState,
      currentBoardEventId: previousCursor,
    };
    updateUndoRedoButtons();
    return false;
  };

  const moveUndoCursorForward = () => {
    const boardEvents = getBoardEvents(runState.transcript);
    const nextIndex = getCurrentBoardEventIndex(boardEvents) + 1;
    if (nextIndex < 0 || nextIndex >= boardEvents.length) {
      return false;
    }

    const previousCursor = runState.currentBoardEventId;
    runState = {
      ...runState,
      currentBoardEventId: getBoardEventId(boardEvents[nextIndex]),
    };
    if (replayBoardToCursor()) {
      return true;
    }

    runState = {
      ...runState,
      currentBoardEventId: previousCursor,
    };
    updateUndoRedoButtons();
    return false;
  };

  const setSavepoint = () => {
    runState = {
      ...runState,
      savepointBoardEventId: runState.currentBoardEventId ?? null,
    };
    persistRunState();
  };

  const undoToSavepoint = () => {
    if (!canUndoToSavepoint()) {
      return false;
    }

    const previousCursor = runState.currentBoardEventId;
    runState = {
      ...runState,
      currentBoardEventId: runState.savepointBoardEventId,
    };

    if (replayBoardToCursor()) {
      return true;
    }

    runState = {
      ...runState,
      currentBoardEventId: previousCursor,
    };
    updateUndoRedoButtons();
    return false;
  };

  const clearSavepoint = () => {
    if (runState.savepointBoardEventId == null) {
      return;
    }
    runState = {
      ...runState,
      savepointBoardEventId: null,
    };
    persistRunState();
  };

  const ensureUndoRedoControls = () => {
    const controls = document.querySelector(".controls");
    if (!controls) {
      return;
    }

    undoButton = document.getElementById("undoBtn");
    if (!undoButton) {
      undoButton = document.createElement("button");
      undoButton.id = "undoBtn";
      undoButton.type = "button";
      undoButton.textContent = "Undo";
      controls.appendChild(undoButton);
    }

    redoButton = document.getElementById("redoBtn");
    if (!redoButton) {
      redoButton = document.createElement("button");
      redoButton.id = "redoBtn";
      redoButton.type = "button";
      redoButton.textContent = "Redo";
      controls.appendChild(redoButton);
    }

    savepointButton = document.getElementById("savepointBtn");
    if (!savepointButton) {
      savepointButton = document.createElement("button");
      savepointButton.id = "savepointBtn";
      savepointButton.type = "button";
      savepointButton.textContent = "Savepoint";
      controls.appendChild(savepointButton);
    }

    undoToSavepointButton = document.getElementById("undoToSavepointBtn");
    if (!undoToSavepointButton) {
      undoToSavepointButton = document.createElement("button");
      undoToSavepointButton.id = "undoToSavepointBtn";
      undoToSavepointButton.type = "button";
      undoToSavepointButton.textContent = "Undo to Savepoint";
      controls.appendChild(undoToSavepointButton);
    }

    clearSavepointButton = document.getElementById("clearSavepointBtn");
    if (!clearSavepointButton) {
      clearSavepointButton = document.createElement("button");
      clearSavepointButton.id = "clearSavepointBtn";
      clearSavepointButton.type = "button";
      clearSavepointButton.textContent = "Clear Savepoint";
      controls.appendChild(clearSavepointButton);
    }

    undoButton.addEventListener("click", () => {
      moveUndoCursorBackward();
    });

    redoButton.addEventListener("click", () => {
      moveUndoCursorForward();
    });

    savepointButton.addEventListener("click", () => {
      setSavepoint();
    });

    undoToSavepointButton.addEventListener("click", () => {
      undoToSavepoint();
    });

    clearSavepointButton.addEventListener("click", () => {
      clearSavepoint();
    });

    updateUndoRedoButtons();
  };

  const resetAndPersistRunState = () => {
    baseBoardSnapshot = null;
    runState = {
      ...resetRunState(),
      runId: createRunId(),
      puzzleId: "unknown",
      transcriptTruncated: false,
      baseBoardSnapshot: null,
      currentBoardEventId: null,
      savepointBoardEventId: null,
    };
    persistRunState();
  };

  const recordEvent = (eventType, payload = {}) => {
    ensureRunIdentity();
    const isBoardEvent = ["value_entered", "note_toggled", "erase_applied", "bulk_applied"]
      .includes(eventType);
    if (isBoardEvent) {
      pruneFutureBoardEvents();
    }

    const nextBoardRevision = isBoardEvent
      ? (runState.boardRevision || 0) + 1
      : (runState.boardRevision || 0);
    const eventId = isBoardEvent ? `board-${nextBoardRevision}` : createEventId();

    const nextEvent = {
      schemaVersion: 2,
      runId: runState.runId,
      puzzleId: runState.puzzleId,
      eventId,
      eventClass: isBoardEvent ? "board" : "ui",
      boardRevision: nextBoardRevision,
      eventTime: new Date().toISOString(),
      elapsedMs: getElapsedMs(),
      eventType,
      payload,
      ...payload,
    };

    const { transcript, truncated } = appendTranscriptEvent(runState.transcript, nextEvent);
    runState = {
      ...runState,
      transcript,
      transcriptTruncated: Boolean(runState.transcriptTruncated || truncated),
      boardRevision: nextBoardRevision,
      currentBoardEventId: isBoardEvent ? eventId : runState.currentBoardEventId,
    };
    persistRunState();
  };

  const resetForNewRun = (recordRequest = false) => {
    resetAndPersistRunState();
    if (recordRequest) {
      recordEvent("new_game_requested");
    }
    recordEvent("run_started");
  };

  if ((runState.transcript || []).length === 0) {
    recordEvent("run_started");
  }

  if (setBaseBoardSnapshot(runState.baseBoardSnapshot)) {
    runState = {
      ...runState,
      baseBoardSnapshot,
    };
  }

  let existingBoardEvents = getBoardEvents(runState.transcript);
  if (!baseBoardSnapshot && existingBoardEvents.length > 0) {
    const transcriptWithoutLegacyBoardEvents =
      (Array.isArray(runState.transcript) ? runState.transcript : []).filter((event) => event?.eventClass !== "board");
    runState = {
      ...runState,
      transcript: transcriptWithoutLegacyBoardEvents,
      boardRevision: 0,
      currentBoardEventId: null,
      savepointBoardEventId: null,
    };
    existingBoardEvents = [];
    persistRunState();
  }

  if (existingBoardEvents.length > 0 && runState.currentBoardEventId == null) {
    runState = {
      ...runState,
      currentBoardEventId: getBoardEventId(existingBoardEvents[existingBoardEvents.length - 1]),
    };
    persistRunState();
  }

  if (!baseBoardSnapshot && existingBoardEvents.length === 0) {
    captureBaseBoardSnapshot(true);
  }
  ensureUndoRedoControls();

  const originalSaveGame = window.saveGame;
  if (typeof originalSaveGame === "function") {
    window.saveGame = function wrappedSaveGame(...args) {
      const result = originalSaveGame.apply(this, args);
      persistRunState();
      return result;
    };
  }

  const originalLoadSavedGame = window.loadSavedGame;
  if (typeof originalLoadSavedGame === "function") {
    window.loadSavedGame = function wrappedLoadSavedGame(...args) {
      const loaded = originalLoadSavedGame.apply(this, args);
      if (loaded) {
        runState = loadRunStateFromSave() || loadRunState() || runState;
        const restoredBase = setBaseBoardSnapshot(runState.baseBoardSnapshot);
        if (!restoredBase && getBoardEvents(runState.transcript).length === 0) {
          captureBaseBoardSnapshot(true);
        }
        persistRunState();
      }
      return loaded;
    };
  }

  const originalNewGame = window.newGame;
  if (typeof originalNewGame === "function") {
    window.newGame = async function wrappedNewGame(...args) {
      resetForNewRun(true);
      const result = await originalNewGame.apply(this, args);
      const latestPuzzleId = window.__sudokuDebug?.lastPuzzleId;
      if (typeof latestPuzzleId === "string" && latestPuzzleId) {
        runState = {
          ...runState,
          puzzleId: latestPuzzleId,
        };
      }
      captureBaseBoardSnapshot(true);
      persistRunState();
      return result;
    };
  }

  const originalSelectCell = window.selectCell;
  if (typeof originalSelectCell === "function") {
    window.selectCell = function wrappedSelectCell(row, col, ...rest) {
      recordEvent("cell_selected", { row, col });
      return originalSelectCell.call(this, row, col, ...rest);
    };
  }

  const recordBoardMutations = (beforeBoard, afterBoard, actionType) => {
    if (!baseBoardSnapshot) {
      setBaseBoardSnapshot(beforeBoard, true);
    }

    const mutations = getBoardMutations(beforeBoard, afterBoard);
    if (mutations.length === 0) {
      return;
    }

    for (const mutation of mutations) {
      const { row, col, beforeCell, afterCell } = mutation;
      const beforeNotes = normalizeNotes(beforeCell.notes);
      const afterNotes = normalizeNotes(afterCell.notes);
      const noteValue = getSingleToggledNote(beforeNotes, afterNotes);

      const wasErased =
        afterCell.value == null
        && afterCell.error === false
        && afterNotes.length === 0
        && actionType === "erase";

      if (wasErased) {
        recordEvent("erase_applied", { row, col });
        continue;
      }

      if (afterCell.value == null && beforeCell.value == null && noteValue != null) {
        recordEvent("note_toggled", { row, col, value: noteValue, mode: "notes" });
        continue;
      }

      if (Number.isInteger(afterCell.value) && afterCell.value >= 1 && afterCell.value <= 9) {
        recordEvent("value_entered", { row, col, value: afterCell.value, mode: "number" });
      }
    }
  };

  const originalPlaceNumber = window.placeNumber;
  if (typeof originalPlaceNumber === "function") {
    window.placeNumber = function wrappedPlaceNumber(value, ...rest) {
      const beforeBoard = readBoardState();
      const result = originalPlaceNumber.call(this, value, ...rest);
      const afterBoard = readBoardState();
      recordBoardMutations(beforeBoard, afterBoard, "place");
      return result;
    };
  }

  const originalEraseCell = window.eraseCell;
  if (typeof originalEraseCell === "function") {
    window.eraseCell = function wrappedEraseCell(...rest) {
      const beforeBoard = readBoardState();
      const result = originalEraseCell.call(this, ...rest);
      const afterBoard = readBoardState();
      recordBoardMutations(beforeBoard, afterBoard, "erase");
      return result;
    };
  }

  const eraseButton = document.querySelector("#numpad button.erase");
  if (eraseButton) {
    eraseButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      window.eraseCell?.();
    }, { capture: true });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Backspace" && event.key !== "Delete") {
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    window.eraseCell?.();
  }, { capture: true });

  const newGameButton = document.getElementById("newGame");
  if (newGameButton) {
    newGameButton.addEventListener("click", () => {
      resetForNewRun(true);
    }, { capture: true });
  }

  window.__sudokuDebug = {
    ...(window.__sudokuDebug || {}),
    emitTranscriptSpamForTest: (count) => {
      const total = Math.max(0, Number.isFinite(count) ? Math.floor(count) : 0);
      for (let i = 0; i < total; i += 1) {
        recordEvent("test_spam", { index: i });
      }
      return runState.transcript.length;
    },
  };

  return { recordEvent };
}

function bindHintOverlayToggle(runTracking) {
  if (!DEFAULT_PROFILE?.featureConfig?.candidateHints) {
    return;
  }

  const controls = document.querySelector(".controls");
  if (!controls || document.getElementById("hintOverlayBtn")) {
    return;
  }

  let hintOverlayEnabled = loadPrefs().hintOverlayEnabled;
  const SAVE_KEY = "sudoku_save";
  const overlayButton = document.createElement("button");
  overlayButton.id = "hintOverlayBtn";
  overlayButton.type = "button";
  overlayButton.textContent = "Hint Overlay";
  overlayButton.setAttribute("aria-pressed", String(hintOverlayEnabled));
  overlayButton.classList.toggle("active", hintOverlayEnabled);
  controls.appendChild(overlayButton);

  overlayButton.addEventListener("click", () => {
    hintOverlayEnabled = !hintOverlayEnabled;
    savePrefs({ hintOverlayEnabled });
    overlayButton.setAttribute("aria-pressed", String(hintOverlayEnabled));
    overlayButton.classList.toggle("active", hintOverlayEnabled);
    runTracking?.recordEvent?.("overlay_toggled", { enabled: hintOverlayEnabled });
    window.renderGrid?.();
  });

  const ensureOverlayStyles = () => {
    if (document.getElementById("hint-overlay-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "hint-overlay-style";
    style.textContent = ".numpad button.dimmed{opacity:0.35;}";
    document.head.appendChild(style);
  };

  const normalizeBoard = (rawBoard) => {
    if (!Array.isArray(rawBoard) || rawBoard.length !== 9) {
      return null;
    }

    const board = [];
    for (let row = 0; row < 9; row += 1) {
      const rawRow = rawBoard[row];
      if (!Array.isArray(rawRow) || rawRow.length !== 9) {
        return null;
      }

      const boardRow = [];
      for (let col = 0; col < 9; col += 1) {
        const rawCell = rawRow[col] || {};
        const value = Number.isInteger(rawCell.value) && rawCell.value >= 1 && rawCell.value <= 9
          ? rawCell.value
          : null;
        boardRow.push({
          fixed: Boolean(rawCell.fixed),
          value,
        });
      }
      board.push(boardRow);
    }

    return board;
  };

  const getBoardFromSave = () => {
    try {
      const save = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
      return normalizeBoard(save?.board);
    } catch {
      return null;
    }
  };

  const getBoardFromRuntime = () => {
    return normalizeBoard(readRuntimeBoard());
  };

  const buildBoardFromGrid = () => {
    const cells = Array.from(document.querySelectorAll("#grid .cell"));
    if (cells.length !== 81) {
      return null;
    }

    const board = [];
    for (let row = 0; row < 9; row += 1) {
      const boardRow = [];
      for (let col = 0; col < 9; col += 1) {
        const cell = cells[(row * 9) + col];
        const hasNotes = Boolean(cell.querySelector(".note"));
        const text = (cell.textContent || "").trim();
        const value = hasNotes || !/^[1-9]$/.test(text) ? null : Number(text);
        boardRow.push({
          fixed: cell.classList.contains("fixed"),
          value,
        });
      }
      board.push(boardRow);
    }

    return board;
  };

  const getBoardForOverlay = () => {
    return getBoardFromRuntime() || getBoardFromSave() || buildBoardFromGrid();
  };

  const getSelectedCell = (boardState) => {
    if (document.querySelectorAll("#grid .cell.multi-selected").length > 1) {
      return null;
    }

    const selectedCell = document.querySelector("#grid .cell.selected");
    if (!selectedCell || selectedCell.classList.contains("fixed")) {
      return null;
    }

    const cells = Array.from(document.querySelectorAll("#grid .cell"));
    const index = cells.indexOf(selectedCell);
    if (index < 0) {
      return null;
    }

    const row = Math.floor(index / 9);
    const col = index % 9;
    const stateCell = boardState?.[row]?.[col] || null;
    if (!stateCell || stateCell.fixed || Number.isInteger(stateCell.value)) {
      return null;
    }

    return { row, col };
  };

  const applyNumpadOverlay = () => {
    const numpadButtons = Array.from(document.querySelectorAll("#numpad button"));
    if (numpadButtons.length === 0) {
      return;
    }

    const boardState = getBoardForOverlay();
    const selectedCell = getSelectedCell(boardState);
    const shouldOverlay = hintOverlayEnabled && selectedCell;
    const invalidDigits = shouldOverlay
      ? new Set(getInvalidDigitsForCell(boardState, selectedCell.row, selectedCell.col))
      : new Set();

    for (const button of numpadButtons) {
      const label = (button.textContent || "").trim();
      const digit = /^[1-9]$/.test(label) ? Number(label) : null;
      button.classList.toggle("dimmed", digit !== null && invalidDigits.has(digit));
    }
  };

  const originalRenderGrid = window.renderGrid;
  if (typeof originalRenderGrid === "function") {
    window.renderGrid = function wrappedRenderGrid(...args) {
      const result = originalRenderGrid.apply(this, args);
      applyNumpadOverlay();
      return result;
    };
  }

  ensureOverlayStyles();
  applyNumpadOverlay();
}

function bindNotesToggle() {
  const noteBtn = document.querySelector(".note-toggle");
  if (!noteBtn) {
    return;
  }

  const syncAriaPressed = () => {
    noteBtn.setAttribute("aria-pressed", String(noteBtn.classList.contains("active")));
  };

  syncAriaPressed();

  noteBtn.addEventListener("click", () => {
    queueMicrotask(syncAriaPressed);
  });
}

function bindLongPressMultiSelect() {
  const grid = document.getElementById("grid");
  const numpad = document.getElementById("numpad");
  if (!grid || !numpad || typeof window.selectCell !== "function") {
    return;
  }

  const state = {
    active: false,
    keys: new Set(),
    orderedKeys: [],
    suppressKey: null,
    suppressUntil: 0,
  };

  const keyFor = (row, col) => `${row}:${col}`;

  const parseKey = (key) => {
    const [row, col] = key.split(":").map(Number);
    return { row, col };
  };

  const getCell = (row, col) => grid.children[(row * 9) + col] || null;

  const isEditable = (row, col) => {
    const cell = getCell(row, col);
    return Boolean(cell && !cell.classList.contains("fixed"));
  };

  const touchKey = (key) => {
    if (!state.keys.has(key)) {
      state.keys.add(key);
    }
    state.orderedKeys = state.orderedKeys.filter((entry) => entry !== key);
    state.orderedKeys.push(key);
  };

  const removeKey = (key) => {
    state.keys.delete(key);
    state.orderedKeys = state.orderedKeys.filter((entry) => entry !== key);
  };

  const clearSelection = () => {
    state.active = false;
    state.keys.clear();
    state.orderedKeys = [];
  };

  const resetState = () => {
    clearSelection();
    state.suppressKey = null;
    state.suppressUntil = 0;
  };

  const getPrimary = () => {
    const key = state.orderedKeys[state.orderedKeys.length - 1] || null;
    return key ? parseKey(key) : null;
  };

  const paint = () => {
    const allCells = Array.from(grid.children);
    allCells.forEach((cell, idx) => {
      const row = Math.floor(idx / 9);
      const col = idx % 9;
      const key = keyFor(row, col);
      const show = state.active && state.keys.has(key);
      cell.classList.toggle("multi-selected", show);
    });
  };

  const ensureStyles = () => {
    if (document.getElementById("multi-select-style")) {
      return;
    }

    const style = document.createElement("style");
    style.id = "multi-select-style";
    style.textContent = ".cell.multi-selected:not(.selected){outline:2px solid #60a5fa;outline-offset:-2px;}";
    document.head.appendChild(style);
  };

  const originalRenderGrid = window.renderGrid;
  if (typeof originalRenderGrid === "function") {
    window.renderGrid = function wrappedRenderGrid(...args) {
      const result = originalRenderGrid.apply(this, args);
      paint();
      return result;
    };
  }

  const originalPlaceNumber = window.placeNumber;
  const originalEraseCell = window.eraseCell;
  const originalInitBoard = window.initBoard;
  const originalLoadSavedGame = window.loadSavedGame;

  const applyBulk = (operation) => {
    if (!state.active || state.keys.size < 2 || typeof window.selectCell !== "function") {
      return false;
    }

    const targets = state.orderedKeys.map(parseKey).filter(({ row, col }) => isEditable(row, col));
    if (targets.length < 2) {
      return false;
    }

    for (const { row, col } of targets) {
      window.selectCell(row, col);
      operation();
    }

    const primary = targets[targets.length - 1];
    if (primary) {
      window.selectCell(primary.row, primary.col);
    }
    paint();
    return true;
  };

  if (typeof originalPlaceNumber === "function") {
    window.placeNumber = function wrappedPlaceNumber(value) {
      if (applyBulk(() => originalPlaceNumber.call(window, value))) {
        return;
      }
      originalPlaceNumber.call(window, value);
    };
  }

  if (typeof originalEraseCell === "function") {
    window.eraseCell = function wrappedEraseCell() {
      if (applyBulk(() => originalEraseCell.call(window))) {
        return;
      }
      originalEraseCell.call(window);
    };
  }

  if (typeof originalInitBoard === "function") {
    window.initBoard = function wrappedInitBoard(...args) {
      resetState();
      const result = originalInitBoard.apply(this, args);
      paint();
      return result;
    };
  }

  if (typeof originalLoadSavedGame === "function") {
    window.loadSavedGame = function wrappedLoadSavedGame(...args) {
      resetState();
      const result = originalLoadSavedGame.apply(this, args);
      paint();
      return result;
    };
  }

  numpad.addEventListener("click", (event) => {
    if (!state.active || state.keys.size < 2) {
      return;
    }

    const button = event.target?.closest?.("button");
    if (!button || !numpad.contains(button)) {
      return;
    }

    const label = button.textContent?.trim() || "";
    const isDigit = /^[1-9]$/.test(label);
    const isErase = button.classList.contains("erase");
    if (!isDigit && !isErase) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    if (isDigit) {
      window.placeNumber?.(Number(label));
      return;
    }

    window.eraseCell?.();
  }, { capture: true });

  const locate = (event) => {
    const cell = event.target?.closest?.(".cell");
    if (!cell || !grid.contains(cell)) {
      return null;
    }
    const idx = Array.prototype.indexOf.call(grid.children, cell);
    if (idx < 0) {
      return null;
    }
    return { row: Math.floor(idx / 9), col: idx % 9 };
  };

  const longPress = createLongPressHelper({
    thresholdMs: 380,
    onLongPress: ({ event }) => {
      const pos = locate(event);
      if (!pos || !isEditable(pos.row, pos.col)) {
        return;
      }

      state.active = true;
      clearSelection();
      state.active = true;
      const key = keyFor(pos.row, pos.col);
      touchKey(key);
      window.selectCell(pos.row, pos.col);
      paint();
      state.suppressKey = key;
      state.suppressUntil = Date.now() + 700;
    },
  });

  grid.addEventListener("pointerdown", (event) => {
    longPress.handlePointerDown(event);
  }, { capture: true });

  grid.addEventListener("pointerup", (event) => {
    longPress.handlePointerUp(event);
  }, { capture: true });

  grid.addEventListener("pointercancel", (event) => {
    longPress.handlePointerCancel(event);
  }, { capture: true });

  grid.addEventListener("click", (event) => {
    const pos = locate(event);
    const clickedKey = pos ? keyFor(pos.row, pos.col) : null;
    const shouldSuppress = Boolean(
      clickedKey &&
      state.suppressKey === clickedKey &&
      Date.now() < state.suppressUntil,
    );

    if (shouldSuppress) {
      state.suppressKey = null;
      state.suppressUntil = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    if (!state.active) {
      return;
    }

    if (!pos || !isEditable(pos.row, pos.col)) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const key = keyFor(pos.row, pos.col);
    if (state.keys.has(key)) {
      if (state.keys.size === 1) {
        clearSelection();
        window.selectCell(pos.row, pos.col);
        paint();
        return;
      }
      removeKey(key);
    } else {
      touchKey(key);
    }

    const primary = getPrimary() || pos;
    window.selectCell(primary.row, primary.col);
    paint();
  }, { capture: true });

  const originalSelectCell = window.selectCell;
  window.selectCell = function wrappedSelectCell(row, col) {
    const result = originalSelectCell.call(window, row, col);

    if (state.active && isEditable(row, col)) {
      touchKey(keyFor(row, col));
    } else if (!state.active && isEditable(row, col)) {
      state.keys.clear();
      state.orderedKeys = [];
      touchKey(keyFor(row, col));
    } else if (!state.active) {
      state.keys.clear();
      state.orderedKeys = [];
    }

    paint();
    return result;
  };

  ensureStyles();
  paint();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Ignore registration errors to avoid interrupting gameplay.
    });
  });
}

bindNotesToggle();
bindLongPressMultiSelect();
ensureDebugState();
bindPuzzleProvider();
const runTracking = bindRunTracking();
bindHintOverlayToggle(runTracking);
registerServiceWorker();
window.__sudokuProfile = DEFAULT_PROFILE;
