# Sudoku Offline App

Sudoku web app with a FastAPI backend for puzzle generation and a self-contained frontend for gameplay.

## Getting started

### 1) Create a virtual environment

```bash
python3.11 -m venv .venv
```

### 2) Install dependencies

```bash
.venv/bin/python -m pip install -e ".[dev]"
```

### 3) Run the app

```bash
.venv/bin/python -m uvicorn src.sudoku.main:app --reload
```

Then open `http://127.0.0.1:8000`.

### 4) Run tests

```bash
.venv/bin/python -m pytest -v
```

## Mobile and PWA docs

- Capacitor setup guide: `docs/capacitor-setup.md`
- Mobile emulator/simulator checklist: `docs/mobile-testing.md`
