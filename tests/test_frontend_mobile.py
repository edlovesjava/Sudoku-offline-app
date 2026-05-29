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
