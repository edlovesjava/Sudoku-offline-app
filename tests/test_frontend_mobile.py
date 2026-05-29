import subprocess
import socket
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

import pytest


@pytest.fixture
def live_server():
    root = Path(__file__).resolve().parents[1]
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]

    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "src.sudoku.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=root,
    )
    url = f"http://127.0.0.1:{port}/"
    deadline = time.time() + 10
    while time.time() < deadline:
        try:
            with urlopen(url):
                break
        except URLError:
            time.sleep(0.1)
    else:
        process.terminate()
        process.wait(timeout=5)
        raise RuntimeError("Timed out waiting for server startup")

    try:
        yield url
    finally:
        process.terminate()
        process.wait(timeout=5)


def test_app_boots_and_shows_grid(page, live_server):
    page.goto(live_server)
    page.wait_for_selector("#grid .cell")
    count = page.locator("#grid .cell").count()
    assert count == 81


def test_notes_toggle_is_visible_and_stateful(page, live_server):
    page.goto(live_server)
    toggle = page.get_by_role("button", name="Notes")

    initial_pressed = toggle.get_attribute("aria-pressed")
    assert initial_pressed == "false"

    toggle.click()
    pressed = toggle.get_attribute("aria-pressed")
    assert pressed == "true"

    toggle.click()
    pressed_again = toggle.get_attribute("aria-pressed")
    assert pressed_again == "false"


def test_manifest_and_service_worker_are_registered(page, live_server):
    page.goto(live_server)

    manifest_href = page.evaluate(
        """
        () => document.querySelector('link[rel="manifest"]')?.getAttribute('href') || null
        """
    )
    assert manifest_href == "/static/manifest.webmanifest"

    registration_details = page.evaluate(
        """
        async () => {
          if (!('serviceWorker' in navigator)) {
            return null;
          }

          const deadline = Date.now() + 5000;
          while (Date.now() < deadline) {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
              const workers = [registration.active, registration.installing, registration.waiting];
              const scriptURL = workers.find((worker) => worker?.scriptURL)?.scriptURL || null;

              if (scriptURL && scriptURL.endsWith('/static/sw.js')) {
                return {
                  scope: registration.scope,
                  scriptURL,
                };
              }
            }

            await new Promise((resolve) => setTimeout(resolve, 50));
          }

          return null;
        }
        """
    )

    assert registration_details is not None
    assert registration_details["scriptURL"].endswith("/static/sw.js")


def test_offline_uses_local_provider_before_backend(page, live_server):
    page.goto(live_server)
    page.context.set_offline(True)

    page.click("#newGame")
    source = page.evaluate("window.__sudokuDebug?.lastPuzzleSource ?? null")

    assert source in {"browser", "pack"}


def test_backend_reachable_when_local_providers_unavailable(page, live_server):
    page.route(
        "**/static/packs/default-pack.json",
        lambda route: route.fulfill(status=503, content_type="application/json", body="[]"),
    )

    page.goto(live_server)
    page.evaluate("window.__sudokuDebug.disableBrowserProvider = true")
    page.click("#newGame")
    page.wait_for_function("window.__sudokuDebug?.lastPuzzleSource !== null")
    source = page.evaluate("window.__sudokuDebug?.lastPuzzleSource ?? null")

    assert source == "backend"


def test_invalid_local_pack_falls_through_to_backend(page, live_server):
    page.route(
        "**/static/packs/default-pack.json",
        lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=(
                '[{"schemaVersion":1,"puzzleId":"broken-pack","grid":"123",'
                '"solution":"456","difficulty":100,"source":"pack"}]'
            ),
        ),
    )

    page.goto(live_server)
    page.evaluate(
        "window.__sudokuDebug.lastPuzzleSource = null; window.__sudokuDebug.disableBrowserProvider = true"
    )
    page.click("#newGame")
    page.wait_for_function("window.__sudokuDebug?.lastPuzzleSource === 'backend'")
    source = page.evaluate("window.__sudokuDebug?.lastPuzzleSource ?? null")

    assert source == "backend"


def test_cache_fallback_sets_source_telemetry(page, live_server):
    page.route(
        "**/static/packs/default-pack.json",
        lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=(
                '[{"schemaVersion":1,"puzzleId":"broken-pack","grid":"123",'
                '"solution":"456","difficulty":100,"source":"pack"}]'
            ),
        ),
    )
    page.route("**/puzzle?rank=*", lambda route: route.fulfill(status=503, body="backend down"))

    page.goto(live_server)
    page.evaluate(
        """
        localStorage.setItem("sudoku_cache", JSON.stringify([
          {
            difficulty: 100,
            initial_grid: "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
            solution_key: "534678912672195348198342567859761423426853791713924856961537284287419635345286179"
          }
        ]));
        window.__sudokuDebug.lastPuzzleSource = null;
        window.__sudokuDebug.disableBrowserProvider = true;
        """
    )

    page.click("#newGame")
    page.wait_for_function("window.__sudokuDebug?.lastPuzzleSource === 'cache'")
    source = page.evaluate("window.__sudokuDebug?.lastPuzzleSource ?? null")

    assert source == "cache"


def test_browser_generator_returns_valid_grid(page, live_server):
    page.goto(live_server)

    result = page.evaluate(
        """
        async () => {
          const pkg = await window.__sudokuDebug.generatePuzzleForTest(150);
          const DIGITS = new Set(["1", "2", "3", "4", "5", "6", "7", "8", "9"]);

          const fixedMatchesSolution = [...Array(81).keys()].every((idx) => {
            const value = pkg.grid[idx];
            return value === "0" || value === pkg.solution[idx];
          });

          const clueCount = [...pkg.grid].filter((value) => value !== "0").length;

          const units = [];
          for (let row = 0; row < 9; row += 1) {
            units.push([...Array(9).keys()].map((col) => pkg.solution[(row * 9) + col]));
          }
          for (let col = 0; col < 9; col += 1) {
            units.push([...Array(9).keys()].map((row) => pkg.solution[(row * 9) + col]));
          }
          for (let boxRow = 0; boxRow < 3; boxRow += 1) {
            for (let boxCol = 0; boxCol < 3; boxCol += 1) {
              const box = [];
              for (let row = 0; row < 3; row += 1) {
                for (let col = 0; col < 3; col += 1) {
                  const idx = ((boxRow * 3 + row) * 9) + (boxCol * 3 + col);
                  box.push(pkg.solution[idx]);
                }
              }
              units.push(box);
            }
          }

          const validSolution = units.every((unit) => {
            if (unit.length !== 9) {
              return false;
            }
            const seen = new Set(unit);
            return seen.size === 9 && [...seen].every((digit) => DIGITS.has(digit));
          });

          return { pkg, fixedMatchesSolution, clueCount, validSolution };
        }
        """
    )

    pkg = result["pkg"]
    assert pkg["schemaVersion"] == 1
    assert pkg["source"] == "browser"
    assert pkg["difficulty"] == 150
    assert len(pkg["grid"]) == 81
    assert len(pkg["solution"]) == 81
    assert result["clueCount"] >= 22
    assert result["fixedMatchesSolution"] is True
    assert result["validSolution"] is True


def test_browser_generator_produces_unique_solution_puzzles(page, live_server):
    page.goto(live_server)

    result = page.evaluate(
        """
        async () => {
          const countSolutions = (grid, limit = 2) => {
            const rowMask = new Uint16Array(9);
            const colMask = new Uint16Array(9);
            const boxMask = new Uint16Array(9);
            const cells = [...grid].map((digit) => Number(digit));
            const empties = [];

            const bitFor = (digit) => 1 << digit;
            const boxIndex = (row, col) => (Math.floor(row / 3) * 3) + Math.floor(col / 3);

            for (let idx = 0; idx < 81; idx += 1) {
              const row = Math.floor(idx / 9);
              const col = idx % 9;
              const value = cells[idx];
              if (value === 0) {
                empties.push(idx);
                continue;
              }

              const bit = bitFor(value);
              const box = boxIndex(row, col);
              if ((rowMask[row] & bit) || (colMask[col] & bit) || (boxMask[box] & bit)) {
                return 0;
              }

              rowMask[row] |= bit;
              colMask[col] |= bit;
              boxMask[box] |= bit;
            }

            let solutions = 0;
            const search = () => {
              if (solutions >= limit) {
                return;
              }

              let bestIdx = -1;
              let bestCandidates = 0;
              let bestCount = 10;

              for (const idx of empties) {
                if (cells[idx] !== 0) {
                  continue;
                }

                const row = Math.floor(idx / 9);
                const col = idx % 9;
                const box = boxIndex(row, col);
                const used = rowMask[row] | colMask[col] | boxMask[box];
                const available = (~used) & 0x3FE;
                const count = available ? available.toString(2).replace(/0/g, "").length : 0;

                if (count === 0) {
                  return;
                }
                if (count < bestCount) {
                  bestCount = count;
                  bestIdx = idx;
                  bestCandidates = available;
                  if (count === 1) {
                    break;
                  }
                }
              }

              if (bestIdx === -1) {
                solutions += 1;
                return;
              }

              const row = Math.floor(bestIdx / 9);
              const col = bestIdx % 9;
              const box = boxIndex(row, col);
              for (let digit = 1; digit <= 9; digit += 1) {
                const bit = bitFor(digit);
                if ((bestCandidates & bit) === 0) {
                  continue;
                }

                cells[bestIdx] = digit;
                rowMask[row] |= bit;
                colMask[col] |= bit;
                boxMask[box] |= bit;

                search();

                cells[bestIdx] = 0;
                rowMask[row] &= ~bit;
                colMask[col] &= ~bit;
                boxMask[box] &= ~bit;

                if (solutions >= limit) {
                  return;
                }
              }
            };

            search();
            return solutions;
          };

          const sampleSize = 6;
          const failures = [];
          let generatedCount = 0;
          let nullCount = 0;
          for (let idx = 0; idx < sampleSize; idx += 1) {
            const pkg = await window.__sudokuDebug.generatePuzzleForTest(500);
            if (!pkg) {
              nullCount += 1;
              continue;
            }

            generatedCount += 1;
            const solutions = countSolutions(pkg.grid, 2);
            if (solutions !== 1) {
              failures.push({
                puzzleId: pkg.puzzleId,
                clues: [...pkg.grid].filter((value) => value !== "0").length,
                solutions,
              });
            }
          }

          return { sampleSize, failures, generatedCount, nullCount };
        }
        """
    )

    assert result["generatedCount"] > 0
    assert result["failures"] == []


def test_long_press_multi_select_and_bulk_number_fill(page, live_server):
    page.goto(live_server)
    page.wait_for_selector("#grid .cell")

    editable_indexes = page.evaluate(
        """
        () => {
          const cells = Array.from(document.querySelectorAll('#grid .cell'));
          return cells
            .map((cell, idx) => ({ idx, fixed: cell.classList.contains('fixed') }))
            .filter((entry) => !entry.fixed)
            .slice(0, 2)
            .map((entry) => entry.idx);
        }
        """
    )
    assert len(editable_indexes) == 2

    first = page.locator("#grid .cell").nth(editable_indexes[0])
    second = page.locator("#grid .cell").nth(editable_indexes[1])

    first_box = first.bounding_box()
    assert first_box is not None
    page.mouse.move(first_box["x"] + (first_box["width"] / 2), first_box["y"] + (first_box["height"] / 2))
    page.mouse.down()
    page.wait_for_timeout(450)
    page.mouse.up()

    second.click()
    page.get_by_role("button", name="7", exact=True).click()

    values = page.evaluate(
        f"""
        () => {{
          const cells = Array.from(document.querySelectorAll('#grid .cell'));
          return [cells[{editable_indexes[0]}].textContent.trim(), cells[{editable_indexes[1]}].textContent.trim()];
        }}
        """
    )
    assert values == ["7", "7"]

    page.get_by_role("button", name="Erase").click()
    page.get_by_role("button", name="Notes").click()
    page.get_by_role("button", name="4", exact=True).click()

    notes_applied = page.evaluate(
        f"""
        () => {{
          const cells = Array.from(document.querySelectorAll('#grid .cell'));
          const firstHasNote = cells[{editable_indexes[0]}].querySelector('.note-4') !== null;
          const secondHasNote = cells[{editable_indexes[1]}].querySelector('.note-4') !== null;
          return [firstHasNote, secondHasNote];
        }}
        """
    )
    assert notes_applied == [True, True]


def test_new_game_clears_long_press_multi_select_state(page, live_server):
    page.goto(live_server)
    page.wait_for_selector("#grid .cell")

    editable_indexes = page.evaluate(
        """
        () => {
          const cells = Array.from(document.querySelectorAll('#grid .cell'));
          return cells
            .map((cell, idx) => ({ idx, fixed: cell.classList.contains('fixed') }))
            .filter((entry) => !entry.fixed)
            .slice(0, 2)
            .map((entry) => entry.idx);
        }
        """
    )
    assert len(editable_indexes) == 2

    first = page.locator("#grid .cell").nth(editable_indexes[0])
    second = page.locator("#grid .cell").nth(editable_indexes[1])

    first_box = first.bounding_box()
    assert first_box is not None
    page.mouse.move(first_box["x"] + (first_box["width"] / 2), first_box["y"] + (first_box["height"] / 2))
    page.mouse.down()
    page.wait_for_timeout(450)
    page.mouse.up()

    second.click()
    page.get_by_role("button", name="8", exact=True).click()

    before_new_game = page.evaluate(
        f"""
        () => {{
          const cells = Array.from(document.querySelectorAll('#grid .cell'));
          return [cells[{editable_indexes[0]}].textContent.trim(), cells[{editable_indexes[1]}].textContent.trim()];
        }}
        """
    )
    assert before_new_game == ["8", "8"]

    page.click("#newGame")
    page.wait_for_function("!document.getElementById('newGame').disabled")

    lingering_multi_selected_count = page.evaluate(
        "() => document.querySelectorAll('#grid .cell.multi-selected').length"
    )
    assert lingering_multi_selected_count == 0

    post_game_editable_indexes = page.evaluate(
        """
        () => {
          const cells = Array.from(document.querySelectorAll('#grid .cell'));
          return cells
            .map((cell, idx) => ({ idx, fixed: cell.classList.contains('fixed'), value: cell.textContent.trim() }))
            .filter((entry) => !entry.fixed && entry.value === '')
            .slice(0, 2)
            .map((entry) => entry.idx);
        }
        """
    )
    assert len(post_game_editable_indexes) == 2

    page.locator("#grid .cell").nth(post_game_editable_indexes[0]).click()
    page.get_by_role("button", name="6", exact=True).click()

    post_new_game_values = page.evaluate(
        f"""
        () => {{
          const cells = Array.from(document.querySelectorAll('#grid .cell'));
          return [
            cells[{post_game_editable_indexes[0]}].textContent.trim(),
            cells[{post_game_editable_indexes[1]}].textContent.trim(),
          ];
        }}
        """
    )
    assert post_new_game_values == ["6", ""]


def test_hint_marks_run_assisted_and_returns_candidates(page, live_server):
    page.goto(live_server)
    page.wait_for_selector("#grid .cell")

    editable_index = page.evaluate(
        """
        () => {
          const cells = Array.from(document.querySelectorAll('#grid .cell'));
          return cells.findIndex((cell) => !cell.classList.contains('fixed') && cell.textContent.trim() === '');
        }
        """
    )
    assert editable_index >= 0

    page.locator("#grid .cell").nth(editable_index).click()
    page.get_by_role("button", name="Hint").click()

    hint_text = page.locator("#hintText").inner_text().strip()
    assert "Candidates" in hint_text
    assert "because" in hint_text.lower()
    assert any(unit in hint_text.lower() for unit in ("row", "column", "box"))

    run_state = page.evaluate(
        """
        () => JSON.parse(localStorage.getItem('sudoku_run') || 'null')
        """
    )

    assert run_state is not None
    assert run_state["assisted"] is True
    assert run_state["hintsUsed"] >= 1


def test_new_game_resets_assisted_run_state_after_hint(page, live_server):
    page.goto(live_server)
    page.wait_for_selector("#grid .cell")

    editable_index = page.evaluate(
        """
        () => {
          const cells = Array.from(document.querySelectorAll('#grid .cell'));
          return cells.findIndex((cell) => !cell.classList.contains('fixed') && cell.textContent.trim() === '');
        }
        """
    )
    assert editable_index >= 0

    page.locator("#grid .cell").nth(editable_index).click()
    page.get_by_role("button", name="Hint").click()

    page.click("#newGame")
    page.wait_for_function("!document.getElementById('newGame').disabled")

    run_state = page.evaluate(
        """
        () => JSON.parse(localStorage.getItem('sudoku_run') || 'null')
        """
    )

    assert run_state is not None
    assert run_state["assisted"] is False
    assert run_state["hintsUsed"] == 0
