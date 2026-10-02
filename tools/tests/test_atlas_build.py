"""atlas.db builder: reviewed content only, links in both directions, reproducible."""
import hashlib
import shutil
import sqlite3

import pytest

from atlas.build_atlas import build
from atlas.validate import ROOT

CONTENT = ROOT / "content" / "atlas"


def test_builds_reviewed_content_with_inverse_links(tmp_path):
    out = tmp_path / "atlas.db"
    stats = build(CONTENT, out, None)
    con = sqlite3.connect(out)
    n = con.execute("SELECT count(*) FROM entity").fetchone()[0]
    assert n == stats["entities"] > 30
    declared = con.execute("SELECT count(*) FROM link WHERE inverse = 0").fetchone()[0]
    assert con.execute("SELECT count(*) FROM link WHERE inverse = 1").fetchone()[0] == declared
    # Runaround is collected in I, Robot; seen from I, Robot it is the inverse link
    assert con.execute("SELECT src FROM link WHERE dst = 'runaround' AND rel = 'collected_in' AND inverse = 1").fetchone() == ("i-robot",)
    assert con.execute("SELECT why FROM entity WHERE id = 'nightfall'").fetchone()[0].startswith("The story most often named")
    assert con.execute("SELECT year, month, story FROM catalog_ref WHERE entity_id = 'the-time-machine'").fetchall() == [(1927, 5, "The Time Machine")]
    assert con.execute("SELECT count(*) FROM path_stop").fetchone()[0] >= 10
    assert ("the-time-machine",) in con.execute("SELECT id FROM entity_fts WHERE entity_fts MATCH 'morlock*'").fetchall()


def test_reproducible(tmp_path):
    a, b = tmp_path / "a.db", tmp_path / "b.db"
    build(CONTENT, a, None)
    build(CONTENT, b, None)
    assert hashlib.sha256(a.read_bytes()).digest() == hashlib.sha256(b.read_bytes()).digest()


def test_drafts_are_left_out_and_errors_stop_the_build(tmp_path):
    content = tmp_path / "atlas"
    shutil.copytree(CONTENT, content)
    before = build(content, tmp_path / "w.db", None)["drafts_skipped"]
    p = content / "entities" / "sputnik-1.md"
    p.write_text(p.read_text(encoding="utf-8").replace('status = "reviewed"', 'status = "draft"'), encoding="utf-8")
    stats = build(content, tmp_path / "x.db", None)
    con = sqlite3.connect(tmp_path / "x.db")
    assert stats["drafts_skipped"] == before + 1
    assert con.execute("SELECT count(*) FROM entity WHERE id = 'sputnik-1'").fetchone()[0] == 0
    assert con.execute("SELECT count(*) FROM path_stop WHERE entity_id = 'sputnik-1'").fetchone()[0] == 0

    p.write_text(p.read_text(encoding="utf-8").replace('rel = "', 'rel = "nonsense_', 1) if '[[links]]' in p.read_text(encoding="utf-8")
                 else p.read_text(encoding="utf-8").replace('lane = "events"', 'lane = "nowhere"'), encoding="utf-8")
    with pytest.raises(SystemExit):
        build(content, tmp_path / "y.db", None)
