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
