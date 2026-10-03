"""Generic adapter for an Internet Archive collection of magazine issues (Phase 8a).

Input: a snapshot of the collection's search results (`tools/sources/ia/<collection>.json`, refreshed with
`--refresh`: one advancedsearch request per 1000 items, metadata only). Output: one issue per (year, month) slot with
the best scan, the other scans of the same issue kept as alternates, and every skipped item listed with a reason.
No contents (stories) yet: these magazines have no reference guide.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import quote

from catalog.model import Catalog, Issue, ParseIssue

FIELDS = ["identifier", "title", "date", "imagecount", "format", "access-restricted-item"]
MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october",
          "november", "december"]
MONTH_NAMES = [m.capitalize() for m in MONTHS]
SEASONS = {"winter": 1, "spring": 4, "summer": 7, "fall": 10, "autumn": 10}


@dataclass
class Scan:
    identifier: str
    title: str
    year: int | None
    month: int | None
    season: str | None
    volume: int | None
    number: int | None
    imagecount: int
    readable: bool  # has a page set (JP2 zip) and OCR (djvu xml): what the reader needs
    score: float = 0.0
    flags: list[str] = field(default_factory=list)


def fetch(collection: str) -> list[dict]:
    """All items of a collection (identifier order), compacted for the snapshot file."""
    from catalog.ia import get  # network only when refreshing
    rows: list[dict] = []
    page = 1
    while True:
        url = ("https://archive.org/advancedsearch.php?q=" + quote(f"collection:{collection}") +
               "".join(f"&fl[]={f}" for f in FIELDS) + f"&sort[]=identifier+asc&rows=1000&page={page}&output=json")
        r = get(url).json()["response"]
        rows += r["docs"]
        if len(rows) >= r["numFound"] or not r["docs"]:
            break
        page += 1
    out = []
    for r in rows:
        fmts = r.get("format") or []
        out.append({
            "identifier": r["identifier"], "title": r.get("title") or "", "date": str(r.get("date") or "")[:10] or None,
            "imagecount": int(r.get("imagecount") or 0),
            "jp2": any("JP2" in f for f in fmts), "ocr": any("Djvu XML" in f for f in fmts),
            "restricted": str(r.get("access-restricted-item", "")).lower() == "true",
        })
    return sorted(out, key=lambda x: x["identifier"])


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[_\-.,()\[\]#&/]+", " ", s.lower()))


def parse_scan(row: dict) -> Scan:
    ident, title = row["identifier"], row.get("title") or ""
    text = f"{_norm(ident)} | {_norm(title)}"
    vol = num = None
    m = (re.search(r"\bv(?:ol(?:ume)?)? ?0*(\d{1,3}) ?(?:n|no|number|issue) ?0*(\d{1,2})", text)
         or re.search(r"\bvolume 0*(\d+) number 0*(\d+)", text))
    if m:
        vol, num = int(m[1]), int(m[2])
    year = month = None
    season = None
    for pat in (r"\b(1[89]\d\d|20[0-2]\d) (0[1-9]|1[0-2])(?!\d)",):
        m = re.search(pat, text)
        if m:
            year, month = int(m[1]), int(m[2])
            break
    if year is None:
        m = re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]* (1[89]\d\d|20[0-2]\d)\b", text)
        if m:
            year, month = int(m[2]), [x[:3] for x in MONTHS].index(m[1]) + 1
    if year is None:
        m = (re.search(r"\b(1[89]\d\d|20[0-2]\d) (winter|spring|summer|fall|autumn)\b", text)
             or re.search(r"\b(winter|spring|summer|fall|autumn) (1[89]\d\d|20[0-2]\d)\b", text))
        if m:
            a, b = m[1], m[2]
            y, s = (a, b) if a.isdigit() else (b, a)
            year, month, season = int(y), SEASONS[s], s.capitalize()
    if year is None:  # "TwilightZoneFeb83"
        m = re.search(r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(\d\d)$", ident.lower())
        if m:
            year, month = 1900 + int(m[2]), [x[:3] for x in MONTHS].index(m[1]) + 1
    if year is None and row.get("date") and not row["date"].endswith("-01-01"):  # Jan 1 = year-only placeholder
        y, mo = row["date"][:7].split("-")
        year, month = int(y), int(mo)
    return Scan(ident, title, year, month, season, vol, num, int(row.get("imagecount") or 0),
                bool(row.get("jp2")) and bool(row.get("ocr")) and not row.get("restricted"))


# lower is worse; reasons shown in the report
PENALTIES = [
    (r"missing", 30, "missing pages"),
    (r"world ?editions|\buk\b|australian", 40, "foreign reprint edition"),
    (r"noads", 15, "ads removed"),
    (r"\bjpg\b|\bpdf\b|images", 5, "image/PDF re-upload"),
    (r"modified", 5, "modified"),
]


def score(s: Scan) -> None:
    text = f"{_norm(s.identifier)} | {_norm(s.title)}"
    s.score = 100.0 if s.readable else 0.0
    for pat, pts, why in PENALTIES:
        if re.search(pat, text):
            s.score -= pts
            s.flags.append(why)
    s.score += min(s.imagecount, 999) / 1000  # more pages = more complete, as a tie-break


def parse(cfg: dict, snapshot: Path) -> tuple[Catalog, dict[str, list[str]], list[tuple[str, str]]]:
    """→ catalog, alternates (chosen identifier → other scans), skipped (identifier, reason)."""
    rows = json.loads(snapshot.read_text(encoding="utf-8"))
    exclude = re.compile(cfg["exclude"], re.I) if cfg.get("exclude") else None
    skipped: list[tuple[str, str]] = []
    problems: list[ParseIssue] = []
    slots: dict[tuple[int, int], list[Scan]] = {}
    for row in rows:
        s = parse_scan(row)
        if exclude and (exclude.search(s.identifier) or exclude.search(s.title)):
            skipped.append((s.identifier, "not an issue of the magazine (excluded by pattern)"))
            continue
        if s.year is None or s.month is None:
            skipped.append((s.identifier, "no issue date in identifier, title or metadata"))
            continue
        if not s.readable:
            skipped.append((s.identifier, "no page images + OCR (or lending only): the reader cannot open it"))
            continue
        score(s)
        slots.setdefault((s.year, s.month), []).append(s)

    issues: list[Issue] = []
    alternates: dict[str, list[str]] = {}
    for (y, mo), scans in sorted(slots.items()):
        # same month, different known volume/number = different issues (e.g. two issues dated alike)
        groups: dict[tuple[int, int] | None, list[Scan]] = {}
        for s in scans:
            groups.setdefault((s.volume, s.number) if s.volume is not None else None, []).append(s)
        if None in groups and len(groups) == 2:
            known = next(k for k in groups if k is not None)
            groups[known] += groups.pop(None)
        for gi, (_, group) in enumerate(sorted(groups.items(), key=lambda kv: (kv[0] is None, kv[0] or (0, 0)))):
            group.sort(key=lambda s: (-s.score, s.identifier))
            best = group[0]
            vol = best.volume if best.volume is not None else next((s.volume for s in group if s.volume is not None), None)
            num = best.number if best.number is not None else next((s.number for s in group if s.number is not None), None)
            season = next((s.season for s in group if s.season), None)
            when = f"{season} {y}" if season else f"{MONTH_NAMES[mo - 1]} {y}"
            if len(groups) > 1 and vol is not None:  # two issues dated alike: tell them apart
                when += f" (vol. {vol} no. {num})"
            slug = f"{cfg['slug']}-{y}-{mo:02d}" + (f"-{gi + 1}" if gi else "")
            issues.append(Issue(year=y, month=mo, title=f"{cfg['name']}, {when}", slug=slug, source_page=0,
                                ia_identifier=best.identifier, volume=vol, number=num))
            if len(group) > 1:
                alternates[best.identifier] = [s.identifier for s in group[1:]]
            if best.flags:
                problems.append(ParseIssue("chosen-scan-flagged", 0, best.identifier, ", ".join(best.flags)))
    cat = Catalog(magazine_name=cfg["name"], magazine_slug=cfg["slug"], source=f"archive.org collection {cfg['collection']}",
                  issues=issues, problems=problems)
    return cat, alternates, skipped
