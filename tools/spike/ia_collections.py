"""Phase 8a survey: list every item of a collection (metadata only, one search request per 1000 items) and report how
issues can be dated and deduplicated.

Usage (from the repo root): python tools/spike/ia_collections.py fantasyandsciencefiction galaxymagazine ...
Writes tools/spike/out/collection_<name>.json (raw rows) and prints a summary per collection.
"""
import json
import re
import sys
from collections import Counter, defaultdict
from urllib.parse import quote

from ia_common import get, save_json

FIELDS = ["identifier", "title", "date", "year", "volume", "issue", "imagecount", "mediatype", "language",
          "access-restricted-item", "publicdate", "item_size", "format"]


def rows_of(collection: str) -> list[dict]:
    out: list[dict] = []
    page = 1
    while True:
        url = ("https://archive.org/advancedsearch.php?q=" + quote(f"collection:{collection}") +
               "".join(f"&fl[]={f}" for f in FIELDS) + f"&sort[]=identifier+asc&rows=1000&page={page}&output=json")
        r = get(url).json()["response"]
        out += r["docs"]
        if len(out) >= r["numFound"] or not r["docs"]:
            return out
        page += 1


MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


def ym(row: dict) -> tuple[int | None, int | None]:
    d = str(row.get("date") or "")
    m = re.match(r"(\d{4})-(\d{2})", d)
    if m:
        return int(m[1]), int(m[2])
    if re.match(r"\d{4}$", d):
        return int(d), None
    s = f"{row['identifier']} {row.get('title') or ''}".lower()
    m = re.search(r"(1[89]\d\d|20[0-2]\d)[-_ .]?(0[1-9]|1[0-2])\b", s)
    if m:
        return int(m[1]), int(m[2])
    m = re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-_ .,]*(1[89]\d\d|20[0-2]\d)", s)
    if m:
        return int(m[2]), MONTHS[m[1]]
    return None, None


def main() -> None:
    for coll in sys.argv[1:]:
        rows = rows_of(coll)
        save_json(f"collection_{coll}.json", rows)
        kinds = Counter(r.get("mediatype") for r in rows)
        restricted = sum(1 for r in rows if r.get("access-restricted-item") in ("true", True))
        dated = defaultdict(list)
        undated = []
        for r in rows:
            y, m = ym(r)
            (dated[(y, m)] if y else undated).append(r["identifier"])
        dups = {k: v for k, v in dated.items() if len(v) > 1}
        years = sorted(k[0] for k in dated)
        no_month = sum(len(v) for k, v in dated.items() if k[1] is None)
        fmt = Counter()
        for r in rows:
            f = r.get("format") or []
            fmt["jp2"] += any("JP2" in x for x in f)
            fmt["djvu_xml"] += any("Djvu XML" in x for x in f)
            fmt["pdf"] += any(x.endswith("PDF") for x in f)
            fmt["cbr/cbz"] += any("Comic" in x for x in f)
        print(json.dumps({
            "collection": coll, "items": len(rows), "mediatypes": kinds, "restricted": restricted,
            "years": [years[0], years[-1]] if years else None, "dated_slots": len(dated), "no_month": no_month,
            "undated": len(undated), "undated_sample": undated[:8],
            "duplicate_slots": len(dups), "dup_sample": dict(list(((f"{k[0]}-{k[1]}", v) for k, v in dups.items()))[:6]),
            "formats": fmt, "title_sample": [r.get("title") for r in rows[:4]] + [r.get("title") for r in rows[-3:]],
        }, ensure_ascii=False, default=str), flush=True)


if __name__ == "__main__":
    main()
