# Capacitor Setup

This project is PWA-first. Capacitor is used as a packaging layer for Android and iOS.

## Prerequisites

- Node.js 20+
- Python virtual environment (`.venv`) with project dependencies installed
- Android Studio (Android SDK + emulator)
- Xcode (for iOS Simulator on macOS)

## 1) Add Capacitor dependencies

From the repository root:

```bash
npm install --save-dev @capacitor/cli
npm install @capacitor/core @capacitor/android @capacitor/ios
```

## 2) Initialize Capacitor project

```bash
npx cap init sudoku-offline-app com.sudoku.offline --web-dir=src/sudoku/static
```

Notes:

- `--web-dir` points to the static web assets already served by FastAPI.
- Keep app id stable after publishing builds.

## 3) Add platforms

```bash
npx cap add android
npx cap add ios
```

## 4) Sync web assets into native projects

After any web asset change:

```bash
npx cap sync
```

## 5) Open native IDE projects

```bash
npx cap open android
npx cap open ios
```

## 6) Recommended local validation flow

1. Run backend tests with `.venv/bin/python -m pytest`.
2. Validate PWA behavior in browser (`manifest`, service worker, offline reload).
3. Run emulator checks listed in `docs/mobile-testing.md`.

## Troubleshooting

- If native apps show stale web content, run `npx cap sync` again.
- If service worker behavior looks inconsistent, clear app data/site data and reinstall.
- If Android build fails after SDK updates, re-sync Gradle from Android Studio.
