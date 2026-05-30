"""Test configuration for cross-plugin compatibility."""

from pathlib import Path


def pytest_collection_modifyitems(items):
    """Run Playwright-backed tests last to avoid async loop interference."""
    def is_playwright_item(item):
        return Path(item.fspath).name == "test_frontend_mobile.py"

    items.sort(key=is_playwright_item)
