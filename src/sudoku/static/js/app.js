import { DEFAULT_PROFILE } from "./config.js";
import { loadPuzzle } from "./providers.js";
import { generateBrowserPuzzle } from "./generator.js";
import { createLongPressHelper } from "./input.js";
import {
  loadRunState,
  loadRunStateFromSave,
  resetRunState,
  saveRunState,
  syncRunStateToSave,
} from "./storage.js";
import { getInvalidDigitsForCell } from "./rules.js";

function ensureDebugState() {
  window.__sudokuDebug = {
    ...(window.__sudokuDebug || {}),
    lastPuzzleSource: null,
    disableBrowserProvider: Boolean(window.__sudokuDebug?.disableBrowserProvider),
    generatePuzzleForTest: (rank) => generateBrowserPuzzle(rank),
  };
}

function bindPuzzleProvider() {
  if (typeof window.fetchPuzzle !== "function") {
    return;
  }

  window.fetchPuzzle = async (rank) => {
    const { package: pkg, source } = await loadPuzzle({ rank });
    window.__sudokuDebug.lastPuzzleSource = source;
    return {
      difficulty: pkg.difficulty,
      initial_grid: pkg.grid,
      solution_key: pkg.solution,
    };
  };
}

function bindRunTracking() {
  let runState = loadRunStateFromSave() || loadRunState() || resetRunState();
  runState = saveRunState(runState);
  syncRunStateToSave(runState);

  const resetAndPersistRunState = () => {
    runState = resetRunState();
  };

  const persistRunState = () => {
    runState = saveRunState(runState);
    syncRunStateToSave(runState);
  };

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
        persistRunState();
      }
      return loaded;
    };
  }

  const originalNewGame = window.newGame;
  if (typeof originalNewGame === "function") {
    window.newGame = async function wrappedNewGame(...args) {
      resetAndPersistRunState();
      return originalNewGame.apply(this, args);
    };
  }

  const newGameButton = document.getElementById("newGame");
  if (newGameButton) {
    newGameButton.addEventListener("click", () => {
      resetAndPersistRunState();
    }, { capture: true });
  }

  return {};
}

function bindHintOverlayToggle() {
  if (!DEFAULT_PROFILE?.featureConfig?.candidateHints) {
    return;
  }

  const controls = document.querySelector(".controls");
  if (!controls || document.getElementById("hintOverlayBtn")) {
    return;
  }

  let hintOverlayEnabled = false;
  const overlayButton = document.createElement("button");
  overlayButton.id = "hintOverlayBtn";
  overlayButton.type = "button";
  overlayButton.textContent = "Hint Overlay";
  overlayButton.setAttribute("aria-pressed", "false");
  controls.appendChild(overlayButton);

  overlayButton.addEventListener("click", () => {
    hintOverlayEnabled = !hintOverlayEnabled;
    overlayButton.setAttribute("aria-pressed", String(hintOverlayEnabled));
    overlayButton.classList.toggle("active", hintOverlayEnabled);
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

  const buildBoardFromGrid = () => {
    const cells = Array.from(document.querySelectorAll("#grid .cell"));
    if (cells.length !== 81) {
      return [];
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

  const getSelectedCell = () => {
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

    return {
      row: Math.floor(index / 9),
      col: index % 9,
    };
  };

  const applyNumpadOverlay = () => {
    const numpadButtons = Array.from(document.querySelectorAll("#numpad button"));
    if (numpadButtons.length === 0) {
      return;
    }

    const selectedCell = getSelectedCell();
    const shouldOverlay = hintOverlayEnabled && selectedCell;
    const invalidDigits = shouldOverlay
      ? new Set(getInvalidDigitsForCell(buildBoardFromGrid(), selectedCell.row, selectedCell.col))
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
bindHintOverlayToggle();
registerServiceWorker();
window.__sudokuProfile = DEFAULT_PROFILE;
