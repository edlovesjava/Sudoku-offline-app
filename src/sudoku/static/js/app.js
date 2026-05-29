import { DEFAULT_PROFILE } from "./config.js";

function bindNotesToggle() {
  const noteBtn = document.querySelector(".note-toggle");
  if (!noteBtn) {
    return;
  }

  let noteMode = noteBtn.classList.contains("active");
  noteBtn.setAttribute("aria-pressed", String(noteMode));

  noteBtn.addEventListener("click", () => {
    noteMode = !noteMode;
    noteBtn.setAttribute("aria-pressed", String(noteMode));
  });
}

bindNotesToggle();
window.__sudokuProfile = DEFAULT_PROFILE;
