from pathlib import Path

import pytest

from adapters import amazing_stories
from fixture_pdf import build

REAL_SOURCE = Path(__file__).resolve().parents[2] / "data" / "source" / "Amazing_Stories_Reference_Guide.pdf"


@pytest.fixture(scope="session")
def fixture_pdf(tmp_path_factory) -> Path:
    return build(tmp_path_factory.mktemp("pdf") / "guide_fixture.pdf")


@pytest.fixture(scope="session")
def catalog(fixture_pdf):
    return amazing_stories.parse(fixture_pdf)
