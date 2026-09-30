"""Adapter tests on the synthetic guide pages (tools/tests/fixture_pdf.py)."""
from collections import Counter


def _story(catalog, title_start):
    return next(s for i in catalog.issues for s in i.stories if s.title.startswith(title_start))


def test_issues_and_section_end(catalog):
    assert [(i.year, i.month) for i in catalog.issues] == [(1926, 4), (1932, 11)]  # 1999 heading after the index ignored


def test_issue_with_ia_link(catalog):
    i = catalog.issues[0]
    assert i.slug == "amazing-stories-1926-04"
    assert i.title == "Amazing Stories, April 1926"
    assert i.cover_artist_raw == "Frank R. Paul"
    assert i.ia_identifier == "AmazingStoriesVolume01Number01"
    assert (i.volume, i.number) == (1, 1)
    assert i.availability == "ia"
    assert i.cover_image and i.cover_image[:4] == b"\x89PNG"


def test_story_link_gives_leaf_and_series(catalog):
    s = _story(catalog, "The Man from the Atom")
    assert (s.page_printed, s.ia_leaf, s.type_code, s.type_label) == (62, 63, "ss", "short story")
    assert s.note == "series: Kirby"
    assert [(c.raw, c.role) for c in s.credits] == [("G. Peyton Wertenbaker", "author")]


def test_wrapped_entry_with_translator_and_serial_part(catalog):
    s = _story(catalog, "Off on a Comet")
    assert s.title == "Off on a Comet or Hector Servadac"
    assert s.part_info == "Part 1 of 2"
    assert (s.type_code, s.type_label, s.ia_leaf) == ("n.", "novel", 5)
    assert [(c.raw, c.role) for c in s.credits] == [("Jules Verne", "author"), ("Ellen E. Frewer", "translator")]


def test_group_and_sub_items(catalog):
    g = _story(catalog, "A Story of the Stone Age")
    assert g.type_code == "gp" and g.note == "reprint"
    sub = _story(catalog, "Chapter I.")
    assert sub.page_printed == 727 and sub.page_label == "_727"
    assert sub.note == "part of: A Story of the Stone Age"


def test_pseudonym_placeholders_and_back_cover(catalog):
    s = _story(catalog, "The First Martian")
    assert [c.raw for c in s.credits] == ["Eando Binder"]
    assert s.note == "Eando Binder = Earl Binder & Otto O. Binder"
    co = _story(catalog, "I Remember Lemuria")
    assert [c.raw for c in co.credits] == ["Richard S. Shaver", "Raymond A. Palmer"]
    lc = _story(catalog, "Discussions")
    assert lc.credits == [] and lc.note == "credit: The Readers"
    bc = _story(catalog, "The Earth's Core")
    assert bc.page_printed is None and bc.credits == []
    assert bc.note == "back cover; credit: [uncredited]"


def test_negative_leaf_is_reported_not_stored(catalog):
    s = _story(catalog, "Thank You!")
    assert s.ia_leaf is None
    assert any(p.kind == "negative-leaf" and "Thank You" in p.text for p in catalog.problems)


def test_issue_without_ia_link(catalog):
    i = catalog.issues[1]
    assert i.ia_identifier is None and i.availability == "none"
    assert i.cover_artist_raw is None
    assert all(s.ia_leaf is None for s in i.stories)
    assert [s.title for s in i.stories] == ["The Rotating Earth", "Clement's Tale", "The Doom of Lun-Dhag"]


def test_entry_continued_on_next_page(catalog):
    s = _story(catalog, "The Doom of Lun-Dhag")
    assert (s.type_code, [c.raw for c in s.credits]) == ("na", ["William Lemkin, Ph.D."])


def test_market_blocks_ignored_and_no_other_problems(catalog):
    assert Counter(p.kind for p in catalog.problems) == {"negative-leaf": 1}
