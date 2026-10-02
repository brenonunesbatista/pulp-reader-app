"""Atlas content validator: the real content passes, and broken content is caught."""
from pathlib import Path

from atlas.validate import ROOT, validate

GOOD = """+++
id = "{id}"
type = "work"
title = "A"
subtitle = "B"
lane = "books"
date = "1895"
themes = []
status = "draft"
{extra}
[[sources]]
n = 1
title = "S"
url = "https://example.org"
+++
Text [1].

## Why it matters
Yes.
"""


def write(dir: Path, id: str, extra: str = "", body_cite: str = "") -> None:
    (dir / "entities").mkdir(parents=True, exist_ok=True)
    text = GOOD.format(id=id, extra=extra)
    if body_cite:
        text = text.replace("Text [1].", f"Text [1]{body_cite}.")
    (dir / "entities" / f"{id}.md").write_text(text, encoding="utf-8")


def test_real_content_is_valid():
    r = validate(ROOT / "content" / "atlas", ROOT / "app" / "public" / "catalog" / "catalog.db")
    assert r.errors == []


def test_catches_broken_links_citations_dates_and_catalog_refs(tmp_path):
    write(tmp_path, "ok")
    write(tmp_path, "bad-link", '[[links]]\nrel = "influenced"\nto = "nobody"\n')
    write(tmp_path, "bad-rel", '[[links]]\nrel = "likes"\nto = "ok"\n')
    write(tmp_path, "bad-cite", body_cite="[2]")
    (tmp_path / "entities" / "bad-theme.md").write_text(
        GOOD.format(id="bad-theme", extra="").replace("themes = []", 'themes = ["nope"]'), encoding="utf-8")
    (tmp_path / "entities" / "bad-date.md").write_text(GOOD.format(id="bad-date", extra="").replace('"1895"', '"95"'), encoding="utf-8")
    (tmp_path / "entities" / "wrong-name.md").write_text(GOOD.format(id="other", extra=""), encoding="utf-8")
    write(tmp_path, "bad-issue", '[[catalog]]\nmagazine = "amazing-stories"\nissue = "1926"\n')
    (tmp_path / "paths").mkdir()
    (tmp_path / "paths" / "p.md").write_text('+++\nid = "p"\n[[stops]]\nentity = "ghost"\nwhy = "x"\n+++\n', encoding="utf-8")

    errors = "\n".join(validate(tmp_path, None).errors)
    assert "link to missing entity 'nobody'" in errors
    assert "unknown link rel 'likes'" in errors
    assert "citation [2] has no source" in errors
    assert "unknown theme 'nope'" in errors
    assert "date must be YYYY" in errors
    assert "must equal the file name" in errors
    assert "catalog issue '1926' must be YYYY-MM" in errors
    assert "stop 'ghost' is not an entity" in errors
    assert "entities/ok.md" not in errors
