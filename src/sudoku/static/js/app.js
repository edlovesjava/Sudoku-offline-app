import { DEFAULT_PROFILE } from "./config.js";

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
window.__sudokuProfile = DEFAULT_PROFILE;
