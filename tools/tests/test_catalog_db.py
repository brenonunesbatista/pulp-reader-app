"""SQLite output, FTS search, names, and reproducibility."""
import hashlib
import sqlite3

import pytest

import build_catalog
from catalog.names import NameRegistry, clean, key
from conftest import REAL_SOURCE


@pytest.fixture(scope="module")
def built(fixture_pdf, tmp_path_factory):
    out = tmp_path_factory.mktemp("catalog")
    assert build_catalog.main(["--source", str(fixture_pdf), "--only", "amazing-stories", "--out", str(out), "--report", str(out / "report.md")]) == 0
    return out


def _db(built):
    return sqlite3.connect(built / "catalog.db")


def test_tables_and_counts(built):
    con = _db(built)
    assert con.execute("select count(*) from issue").fetchone() == (2,)
    assert con.execute("select count(*) from story").fetchone() == (13,)
    row = con.execute("select slug, cover_artist, editor, availability, cover_path from issue where id=1").fetchone()
    assert row == ("amazing-stories-1926-04", "Frank R. Paul", "Hugo Gernsback", "ia",
                   "covers/amazing-stories-1926-04.webp")
    assert (built / "covers" / "amazing-stories-1926-04.webp").stat().st_size > 0
    assert con.execute("select editor, availability from issue where id=2").fetchone() == (
        "T. O'Conor Sloane, Ph.D.", "none")


def test_people_roles_and_name_merge(built):
    con = _db(built)
    # "H.G. Wells" and "H. G. Wells" are one person
    assert con.execute("select count(*) from person where name like 'H%Wells'").fetchone() == (1,)
    roles = con.execute("select p.name, ip.role from issue_person ip join person p on p.id = ip.person_id "
                        "where issue_id = 1 order by role").fetchall()
    assert roles == [("Frank R. Paul", "cover_artist"), ("Hugo Gernsback", "editor")]
    tr = con.execute("select p.name from story_person sp join person p on p.id = sp.person_id "
                     "where role = 'translator'").fetchall()
    assert tr == [("Ellen E. Frewer",)]


@pytest.mark.parametrize("query, expected", [
    ("wertenb*", "The Man from the Atom"),     # prefix
    ("fezandie", "Clement's Tale"),            # accent-insensitive (Fezandié)
    ("OTTO", "The First Martian"),             # case-insensitive, real name behind a pseudonym
    ("frewer", "Off on a Comet or Hector Servadac"),  # translator
    ("kirby", "The Man from the Atom"),        # series
])
def test_story_search(built, query, expected):
    con = _db(built)
    titles = [r[0] for r in con.execute(
        "select s.title from story_fts join story s on s.id = story_fts.rowid where story_fts match ?", (query,))]
    assert expected in titles


def test_issue_and_person_search(built):
    con = _db(built)
    assert con.execute("select rowid from issue_fts where issue_fts match 'apr*'").fetchall() == [(1,)]
    assert con.execute("select name from person_fts where person_fts match 'paul'").fetchall() == [("Frank R. Paul",)]


def test_build_is_reproducible(fixture_pdf, tmp_path):
    hashes = []
    for n in (1, 2):
        out = tmp_path / f"b{n}"
        build_catalog.main(["--source", str(fixture_pdf), "--only", "amazing-stories", "--out", str(out), "--report", str(out / "r.md")])
        hashes.append(hashlib.sha256((out / "catalog.db").read_bytes()).hexdigest())
    assert hashes[0] == hashes[1]


def test_name_normalization():
    assert clean("  H.G.  Wells ") == "H. G. Wells"
    assert key("Clement Fezandié") == key("clement fezandie")
    assert key("Capt. S. P. Meek, U. S. A.") == key("S. P. Meek")
    assert key("Miles J. Breuer, M. D.") == key("Miles J. Breuer")
    assert key("Robert Arthur, Jr.") != key("Robert Arthur")
    assert clean("David H. Keller.") == "David H. Keller"
    reg = NameRegistry()
    for raw in ("H. G. Wells", "H. G. Wells", "H.G. Wells", "Julian Krupa", "Julian S. Krupa"):
        reg.add(raw)
    assert [reg.display(k) for k in reg.keys()] == ["H. G. Wells", "Julian Krupa", "Julian S. Krupa"]
    assert reg.possible_duplicates() == [("Julian Krupa", "Julian S. Krupa")]


@pytest.mark.skipif(not REAL_SOURCE.exists(), reason="reference guide not present (data/source is git-ignored)")
def test_real_guide_smoke():
    from adapters import amazing_stories
    cat = amazing_stories.parse(REAL_SOURCE)
    assert len(cat.issues) == 309
    assert all(i.cover_image for i in cat.issues) and all(i.stories for i in cat.issues)
    first = cat.issues[0]
    assert (first.ia_identifier, first.cover_artist_raw) == ("AmazingStoriesVolume01Number01", "Frank R. Paul")
    assert {p.kind for p in cat.problems} <= {"negative-leaf", "unrecognized-row", "duplicate-issue-heading",
                                              "heading-out-of-order", "shared-ia-item-cleared",
                                              "issue-item-switched-to-story-links"}
