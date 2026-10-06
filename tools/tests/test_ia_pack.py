"""Pack items (Dragon, Dungeon): sub-book listing → issues, stable ids, specials, and dating from OCR anchors."""
import json

from adapters import ia_pack
from catalog import pack_dates

CFG = {"slug": "dragon", "name": "Dragon", "item": "DragonPack", "block": 6, "years": [1976, 2013],
       "issue_pattern": r"Dragon ?Magazine ?(\d+)", "special_pattern": r"Annual|Best of|Web ?Supplement"}


def book(stem, pages=80, ocr=True, scandata=True):
    return {"stem": stem, "pages": pages, "ocr": ocr, "scandata": scandata}


def test_pack_issues(tmp_path):
    snap, dates = tmp_path / "p.json", tmp_path / "p.dates.json"
    snap.write_text(json.dumps([book("DragonMagazine001"), book("DragonMagazine002"), book("Dragon Magazine 400"),
                                book("DragonMagazine003", ocr=False), book("Dragon Magazine Annual 1, 1996"),
                                book("DragonMagazine344WebSupplement"), book("Dragon Magazine Poster")]))
    dates.write_text(json.dumps({"issues": {"1": [1976, 6, "ocr"], "2": [1976, 8, "interpolated"], "3": [1976, 10, "ocr"],
                                            "400": [2011, 6, "ocr"]},
                                 "specials": {"Dragon Magazine Annual 1, 1996": [1996, 6, "ocr"],
                                              "DragonMagazine344WebSupplement": [2006, 6, "ocr"]}}))
    cat, skipped = ia_pack.parse(CFG, snap, dates)
    got = [(i.id, i.title, i.year, i.month, i.ia_identifier, i.page_count) for i in cat.issues]
    assert got[:2] == [(60000010, "Dragon #1", 1976, 6, "DragonPack/DragonMagazine001", 80),
                       (60000020, "Dragon #2", 1976, 8, "DragonPack/DragonMagazine002", 80)]
    titles = [i.title for i in cat.issues]
    assert titles == ["Dragon #1", "Dragon #2", "Dragon Annual 1", "Dragon #344 Web Supplement", "Dragon #400"]
    assert cat.issues[2].id == ia_pack.special_id(6, "Dragon Magazine Annual 1, 1996")
    assert sorted(s for s, _ in skipped) == ["Dragon Magazine Poster", "DragonMagazine003"]
    assert [p.detail for p in cat.problems] == ["August 1976"]


def test_dating_fills_monthly_runs_and_reads_irregular_ones(monkeypatch):
    # truth: #1 Jun 1976, #2 Aug, #3 Oct, #4 Dec (bimonthly), then monthly from #5 = Jan 1977 … #30 = Feb 1979
    truth = {1: (1976, 6), 2: (1976, 8), 3: (1976, 10), 4: (1976, 12)}
    for n in range(5, 31):
        k = 1977 * 12 + (n - 5)
        truth[n] = (k // 12, k % 12 + 1)
    reads = []

    def fake_head(item, stem, nbytes=40000):
        n = int(stem[1:])
        reads.append(n)
        y, m = truth[n]
        return f"letters from May 1975 ... {pack_dates.MONTHS[m - 1].title()} {y} issue {pack_dates.MONTHS[m - 1]} {y}"

    monkeypatch.setattr(pack_dates, "ocr_head", fake_head)
    out = pack_dates.date_issues("X", {n: f"n{n}" for n in truth}, (1976, 1), (1979, 12), log=lambda s: None)
    assert {n: (y, m) for n, (y, m, _) in out.items()} == truth
    assert out[25][2] == "interpolated" and out[10][2] == "ocr"
    assert len(reads) < len(truth)  # monthly stretches are not read issue by issue


def test_comics_years_only(tmp_path):
    cfg = {"slug": "turok", "name": "Turok", "item": "T", "block": 12, "year_only": True,
           "issue_pattern": r"Turok 0*(\d+)(?: \((?P<year>\d{4})\))?.*", "year_anchors": [[1, 1954], [9, 1962]],
           "special_pattern": "Giant", "special_years": {"Turok Giant 01": 1966}, "titles": {"9": "Turok #9 (last)"}}
    snap = tmp_path / "t.json"
    snap.write_text(json.dumps([book("Turok 001"), book("Turok 005 (1957) (Dell) (c2c)"), book("Turok 007"),
                                book("Turok 009"), book("Turok Giant 01")]))
    cat, skipped = ia_pack.parse(cfg, snap, tmp_path / "unused.json")
    got = {i.title: (i.year, i.month) for i in cat.issues}
    # name year for #5, anchors for #1/#9, linear in between (#7: 1957 → 1962), month 0 = year only
    assert got == {"Turok #1": (1954, 0), "Turok #5": (1957, 0), "Turok #7": (1960, 0), "Turok #9 (last)": (1962, 0),
                   "Turok Giant 01": (1966, 0)}
    assert skipped == []
    assert ia_pack.clean_title("37 asterix and the chariot race") == "37 Asterix and the Chariot Race"
