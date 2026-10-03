"""Internet Archive collection adapter (dates, dedupe, skips) and the multi-magazine catalog (categories, alternates)."""
import json
import sqlite3

import build_catalog
from adapters.ia_collection import parse, parse_scan


def row(ident, title="", date=None, imagecount=100, jp2=True, ocr=True):
    return {"identifier": ident, "title": title, "date": date, "imagecount": imagecount, "jp2": jp2, "ocr": ocr,
            "restricted": False}


def test_dates_and_volumes():
    s = parse_scan(row("Fantasy_Science_Fiction_v001n02_1950-Winter-Spring_AK"))
    assert (s.year, s.month, s.season, s.volume, s.number) == (1950, 1, "Winter", 1, 2)
    s = parse_scan(row("fantastic-v-01-n-02-fall-1952", "Fantastic Fall 1952", "1952-01-01"))
    assert (s.year, s.month, s.season, s.volume, s.number) == (1952, 10, "Fall", 1, 2)  # Jan 1 = placeholder date
    s = parse_scan(row("TwilightZoneFeb83", "Rod Serling's The Twilight Zone Magazine Volume 2, Number 11 Feb 1983"))
    assert (s.year, s.month, s.volume, s.number) == (1983, 2, 2, 11)
    s = parse_scan(row("the-magazine-of-fantasy-and-science-fiction-april-1978", "", "1978-04-01"))
    assert (s.year, s.month, s.volume) == (1978, 4, None)
    s = parse_scan(row("Galaxy_v07_04_Galaxy_Jan_1954_AKv1.0"))
    assert (s.year, s.month) == (1954, 1)


def test_dedupe_alternates_and_skips(tmp_path):
    snap = tmp_path / "c.json"
    snap.write_text(json.dumps([
        row("Mag_v01n01_1952-03_Missing_ibc", imagecount=160),
        row("Mag_v01n01_1952-03", imagecount=150),
        row("mag-1952-03", imagecount=170),                      # no volume: same issue
        row("Mag_v01n02_1952-04_noads"),
        row("Mag_v01n02_1952-04", jp2=False),                   # not readable: skipped, noads one is chosen
        row("Mag_v02n05_1953-05"), row("Mag_v02n06_1953-05"),   # two issues dated alike
        row("Mag_Best_Of_1955"),                                # excluded by pattern
        row("Mag_Something"),                                   # no date
    ]), encoding="utf-8")
    cat, alts, skipped = parse({"slug": "mag", "name": "Mag", "collection": "c", "exclude": "Best_Of"}, snap)
    assert [(i.slug, i.ia_identifier) for i in cat.issues] == [
        ("mag-1952-03", "mag-1952-03"), ("mag-1952-04", "Mag_v01n02_1952-04_noads"),
        ("mag-1953-05", "Mag_v02n05_1953-05"), ("mag-1953-05-2", "Mag_v02n06_1953-05")]
    assert cat.issues[0].title == "Mag, March 1952" and (cat.issues[0].volume, cat.issues[0].number) == (1, 1)
    assert cat.issues[3].title == "Mag, May 1953 (vol. 2 no. 6)"
    assert alts == {"mag-1952-03": ["Mag_v01n01_1952-03", "Mag_v01n01_1952-03_Missing_ibc"]}
    assert sorted(i for i, _ in skipped) == ["Mag_Best_Of_1955", "Mag_Something", "Mag_v01n02_1952-04"]
    assert [p.detail for p in cat.problems] == ["ads removed"]


def test_catalog_with_collections(fixture_pdf, tmp_path):
    """the committed snapshots build without network; categories and alternates are stored"""
    out = tmp_path / "cat"
    assert build_catalog.main(["--source", str(fixture_pdf), "--only", "amazing-stories,twilight-zone", "--out", str(out),
                               "--report", str(out / "r.md"), "--sources-report", str(out / "s.md")]) == 0
    con = sqlite3.connect(out / "catalog.db")
    assert con.execute("select slug from category order by sort").fetchall() == [("pulp",), ("rpg",), ("comics",)]
    mags = con.execute("select m.slug, c.slug, (select count(*) from issue i where i.magazine_id = m.id) "
                       "from magazine m join category c on c.id = m.category_id order by m.sort").fetchall()
    assert mags[0] == ("amazing-stories", "pulp", 2) and mags[1][:2] == ("twilight-zone", "pulp") and mags[1][2] >= 55
    assert con.execute("select count(*) from issue_scan").fetchone()[0] >= 1
    assert con.execute("select rowid from issue_fts where issue_fts match 'twilight' limit 1").fetchone()
    assert "Twilight Zone" in (out / "s.md").read_text(encoding="utf-8")
