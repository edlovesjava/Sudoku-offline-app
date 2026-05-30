from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]


def test_capacitor_setup_doc_exists() -> None:
    assert (PROJECT_ROOT / "docs" / "capacitor-setup.md").exists()


def test_mobile_testing_doc_exists() -> None:
    assert (PROJECT_ROOT / "docs" / "mobile-testing.md").exists()


def test_readme_references_mobile_docs() -> None:
    readme = PROJECT_ROOT / "README.md"
    assert readme.exists()

    content = readme.read_text(encoding="utf-8")
    assert "docs/capacitor-setup.md" in content
    assert "docs/mobile-testing.md" in content
