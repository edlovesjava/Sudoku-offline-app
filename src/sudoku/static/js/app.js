import { DEFAULT_PROFILE } from "./config.js";
import { loadPuzzle } from "./providers.js";

function ensureDebugState() {
  window.__sudokuDebug = {
    ...(window.__sudokuDebug || {}),
    lastPuzzleSource: null,
  };
}

function bindPuzzleProvider() {
  if (typeof window.fetchPuzzle !== "function") {
    return;
  }

  window.fetchPuzzle = async (rank) => {
    if (!navigator.onLine) {
      window.__sudokuDebug.lastPuzzleSource = "pack";
    }

    const { package: pkg, source } = await loadPuzzle({ rank });
    window.__sudokuDebug.lastPuzzleSource = source;
    return {
      difficulty: pkg.difficulty,
      initial_grid: pkg.grid,
      solution_key: pkg.solution,
    };
  };
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

bindNotesToggle();
ensureDebugState();
bindPuzzleProvider();
window.__sudokuProfile = DEFAULT_PROFILE;
