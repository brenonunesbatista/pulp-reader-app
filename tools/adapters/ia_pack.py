"""Adapter for a "pack": one Internet Archive item holding many issues as sub-books (Dragon, Dungeon), Phase 8b.

Each sub-book has its own `<stem>_jp2.zip` page set, `<stem>_djvu.xml` OCR and `<stem>_scandata.xml` page list.
The catalog stores such an issue's scan as `<item>/<stem>` in `ia_identifier`; the app reads pages and OCR of that
sub-book (app/src/reader/engine/ia.ts). Inputs, both committed:
- `tools/sources/ia/<item>.json`: the sub-books (stem, page count, has OCR), from the item's metadata (`--refresh`);
- `tools/sources/ia/<item>.dates.json`: cover date per issue number and per special (tools/catalog/pack_dates.py).

A magazine may take its sub-books from several items (`items = [...]`, Phase 13: Uncanny X-Men, Batman), and sub-books
may sit in folders ("Batman - Knightfall/Batman - Knightfall Part 01 …"): patterns and titles use the base name.
`[[magazine.books]]` entries (`stem` = base name, `title`, `year`) curate the title and year of unnumbered books.

`reading_order = true` (Phase 14: the Amazing Spider-Man reading order): group 1 of `issue_pattern` is a position in a
reading order ("142.5 - Amazing Spider-Man 378 (1993)"); the issue number is that position × 10 (ties: +1 in name
order), and each book gets an estimated story year: the years of the single issues matched by `story_year_pattern`
(not `story_year_exclude`, e.g. flashback series) and `year_anchors` (by position), made non-decreasing along the
order (isotonic regression), then interpolated.
"""
from __future__ import annotations

import json
import re
import zlib
from pathlib import Path
from urllib.parse import quote

from catalog.model import Catalog, Issue, ParseIssue

MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
               "November", "December"]


def fetch(item: str) -> list[dict]:
    """sub-books of a pack item (one metadata request)"""
    from catalog.ia import get
    m = get(f"https://archive.org/metadata/{quote(item)}").json()
    names = {f["name"] for f in m["files"]}
    out = []
    for f in m["files"]:
        if f["name"].endswith("_jp2.zip"):
            stem = f["name"][:-len("_jp2.zip")]
            out.append({"stem": stem, "pages": int(f.get("filecount") or 0),
                        "ocr": f"{stem}_djvu.xml" in names, "scandata": f"{stem}_scandata.xml" in names})
    return sorted(out, key=lambda x: x["stem"])


def base(stem: str) -> str:
    """a sub-book's name without its folder"""
    return stem.rsplit("/", 1)[-1]


def key(b: dict) -> str:
    """scan key of a sub-book: `<item>/<stem>`"""
    return f"{b['item']}/{b['stem']}"


def numbered(cfg: dict, books: list[dict]) -> dict[int, str]:
    """issue number → scan key, for the sub-books matching the magazine's `issue_pattern` (group 1 = number); two
    scans of one number: the one with more pages"""
    pat = re.compile(cfg["issue_pattern"]) if cfg.get("issue_pattern") else None
    out: dict[int, str] = {}
    if cfg.get("reading_order"):
        found = [(float(m[1]), base(b["stem"]), key(b)) for b in books if (m := pat.fullmatch(base(b["stem"])))]
        for pos, _, k in sorted(found):
            n = round(pos * 10)
            while n in out:
                n += 1
            out[n] = k
        return out
    pages = {key(b): b["pages"] for b in books}
    for b in books:
        m = pat.fullmatch(base(b["stem"])) if pat else None
        if m:
            # `number_join`: volume and number groups make one number (Heroes v1 01 → 101)
            n = int(m[1]) * 100 + int(m[2]) if cfg.get("number_join") else int(m[1])
            if n not in out or b["pages"] > pages[out[n]]:
                out[n] = key(b)
    return out


def years_only(cfg: dict, nums: dict[int, str]) -> dict[int, list]:
    """Comics (`year_only = true`): a year per issue, no month (month 0). Known years: the pattern's `year` group (the
    year in the file name) and `year_anchors` [[number, year], …] from sources.toml; the others are interpolated
    linearly between the nearest known numbers."""
    pat = re.compile(cfg.get("issue_pattern") or "(?!)")
    known: dict[int, tuple[int, str]] = {}
    for n, k in nums.items():
        m = pat.fullmatch(base(k))
        if m and m.groupdict().get("year"):
            known[n] = (int(m["year"]), "name")
    for n, y in cfg.get("year_anchors", []):
        known.setdefault(n, (y, "anchor"))
    if cfg.get("reading_order"):
        known = story_years(cfg, nums)
    from catalog.years import interpolate_years
    return {n: [y, 0, how] for n, (y, how) in interpolate_years(list(nums), known).items()}


def isotonic(values: list[float]) -> list[float]:
    """the non-decreasing sequence closest to `values` (least squares; pool adjacent violators)"""
    blocks: list[list[float]] = []  # [mean, count]
    for v in values:
        blocks.append([v, 1])
        while len(blocks) > 1 and blocks[-2][0] > blocks[-1][0]:
            (m1, c1), (m2, c2) = blocks.pop(-2), blocks.pop()
            blocks.append([(m1 * c1 + m2 * c2) / (c1 + c2), c1 + c2])
    return [m for m, c in blocks for _ in range(int(c))]


def story_years(cfg: dict, nums: dict[int, str]) -> dict[int, tuple[int, str]]:
    """reading order: known story years by issue number (see the module docstring)"""
    pat = re.compile(cfg["story_year_pattern"])
    skip = re.compile(cfg["story_year_exclude"]) if cfg.get("story_year_exclude") else None
    raw: dict[int, int] = {}
    for n, k in nums.items():
        name = base(k)
        if (m := pat.search(name)) and not (skip and skip.search(name)):
            raw[n] = int(m["year"])
    curated = {round(pos * 10): y for pos, y in cfg.get("year_anchors", [])}
    raw |= curated
    ns = sorted(raw)
    # a stray anchor (a recent book placed early by story) would drag a whole stretch: drop years more than 10 off the
    # median of their 9 neighbours, then make the rest non-decreasing
    keep = [n for i, n in enumerate(ns) if n in curated or abs(raw[n] - sorted(raw[m] for m in ns[max(0, i - 4):i + 5])[len(ns[max(0, i - 4):i + 5]) // 2]) <= 10]
    return {n: (round(y), "estimated") for n, y in zip(keep, isotonic([raw[n] for n in keep]))}


def apply_schedule(cfg: dict, issues: dict[int, list]) -> dict[int, list]:
    """sources.toml corrections to the OCR dates: `schedule` ranges (start month + step, from the masthead's stated
    frequency and OCR anchors) and `interpolate` ranges (issues strictly inside get evenly spread dates)"""
    out = dict(issues)
    for r in cfg.get("schedule", []):
        y, m = map(int, r["start"].split("-"))
        for n in range(r["from"], r["to"] + 1):
            k = y * 12 + m - 1 + (n - r["from"]) * r["step"]
            out[n] = [k // 12, k % 12 + 1, "schedule"]
    for a, b in cfg.get("interpolate", []):
        ka, kb = out[a][0] * 12 + out[a][1] - 1, out[b][0] * 12 + out[b][1] - 1
        for n in range(a + 1, b):
            k = ka + round((kb - ka) * (n - a) / (b - a))
            out[n] = [k // 12, k % 12 + 1, "interpolated"]
    return out


def special_title(name: str, stem: str) -> str:
    """'Dragon Magazine Annual 1, 1996' → 'Dragon Annual 1'; 'Dragon Magazine, The Best of - Vol. 2' → 'The Best of
    Dragon Vol. 2'; 'DragonMagazine344WebSupplement' → 'Dragon #344 Web Supplement'"""
    s = re.sub(rf"^{name} ?Magazine,? ?", "", stem)
    if m := re.match(r"(\d+)-?Web ?(Enhancement|Supplement)", s):
        return f"{name} #{m[1]} Web {m[2]}"
    if m := re.match(r"The Best of - Vol\. ?(\d+)", s):
        return f"The Best of {name} Vol. {m[1]}"
    if s.startswith("The Art of"):
        return f"The Art of {name}"
    return f"{name} " + re.sub(r", (19|20)\d\d$", "", s)


def clean_title(stem: str) -> str:
    """'Asterix_Conquers_America' → 'Asterix Conquers America'; scan-group tags in parentheses are dropped"""
    s = re.sub(r"\s*\((?:[^)]*(?:Digital|Empire|DCP|c2c|HD)[^)]*)\)|\[ocr\]", "", stem.replace("_", " "))
    s = re.sub(r"\s+", " ", s).strip()
    if s == s.lower():  # "37 asterix and the chariot race"
        small = {"a", "an", "and", "the", "of", "in", "on", "to", "at", "for"}
        s = " ".join(w if i and w in small else w[:1].upper() + w[1:] for i, w in enumerate(s.split()))
    return s


def special_id(block: int, stem: str) -> int:
    """stable id for an unnumbered special (annual, best of): block × 10M + 9M + crc of its stem"""
    return block * 10_000_000 + 9_000_000 + zlib.crc32(stem.encode("utf-8")) % 1_000_000


def items(cfg: dict) -> list[str]:
    return cfg.get("items") or [cfg["item"]]


def parse(cfg: dict, snapshot: Path | dict[str, Path], dates_file: Path) -> tuple[Catalog, list[tuple[str, str]]]:
    snaps = snapshot if isinstance(snapshot, dict) else {cfg["item"]: snapshot}
    books = [{**b, "item": item} for item, snap in snaps.items() for b in json.loads(snap.read_text(encoding="utf-8"))]
    by_key = {key(b): b for b in books}
    curated = {c["stem"]: c for c in cfg.get("books", [])}
    nums = numbered(cfg, books)
    if cfg.get("year_only"):
        dates = {"issues": years_only(cfg, nums), "specials": {}}
    else:
        dates = json.loads(dates_file.read_text(encoding="utf-8"))
        dates["issues"] = apply_schedule(cfg, {int(k): v for k, v in dates["issues"].items()})
    specials = re.compile(cfg["special_pattern"]) if cfg.get("special_pattern") else None
    ignore = re.compile(cfg["ignore"]) if cfg.get("ignore") else None  # another series in the same item
    template = cfg.get("title", "{name} #{n}")
    pat = re.compile(cfg.get("issue_pattern") or "(?!)")
    skipped: list[tuple[str, str]] = []
    problems: list[ParseIssue] = []
    issues: list[Issue] = []

    def readable(b: dict) -> bool:
        return b["pages"] > 0 and b["ocr"] and b["scandata"]

    for n, k in sorted(nums.items()):
        b = by_key[k]
        stem = base(b["stem"])
        d = dates["issues"].get(n)
        if not readable(b):
            skipped.append((stem, "no page list or OCR: the reader cannot open it"))
            continue
        if not d:
            skipped.append((stem, "no date"))
            continue
        y, mo, how = d
        if how in ("interpolated", "schedule"):
            problems.append(ParseIssue("interpolated-date", 0, f"#{n}", f"{MONTH_NAMES[mo - 1]} {y}" if mo else str(y)))
        groups = {k: v for k, v in pat.fullmatch(stem).groupdict().items() if v}
        title = cfg.get("titles", {}).get(str(n)) or template.format(name=cfg["name"], n=n, **groups)
        for old, new in cfg.get("title_sub", []):  # e.g. "websm 94" → "Web of Spider-Man 94"
            title = re.sub(old, new, title)
        if cfg.get("year_only"):
            title = clean_title(title)
        issue = Issue(year=y, month=mo, title=title, slug=f"{cfg['slug']}-{n:03d}", source_page=0,
                      ia_identifier=k, number=n)
        issue.id = cfg["block"] * 10_000_000 + n * 10
        issue.page_count = b["pages"]
        issues.append(issue)
    for b in books:
        stem = base(b["stem"])
        if key(b) in nums.values() or (ignore and ignore.search(stem)):
            continue
        if stem not in curated and (not specials or not specials.search(stem)):
            skipped.append((stem, "neither a numbered issue nor a listed special"))
            continue
        d = dates["specials"].get(stem)
        if stem in curated:
            d = [curated[stem]["year"], 0, "curated"]
        if not d and stem in cfg.get("special_years", {}):
            d = [cfg["special_years"][stem], 0, "anchor"]
        elif not d and cfg.get("year_only") and (m := re.search(r"\((?:19|20)\d\d\)", stem)):
            d = [int(m[0][1:5]), 0, "name"]
        if not d and (m := re.search(r"(\d+)-?Web", stem)) and int(m[1]) in dates["issues"]:
            d = dates["issues"][int(m[1])]  # a web supplement goes with its issue
        elif not d and (m := re.search(r", ((?:19|20)\d\d)$", stem)):
            d = [int(m[1]), 1, "name"]  # "Annual 3, 1998": the year from the name
        if not readable(b) or not d:
            skipped.append((stem, "no page list or OCR" if not readable(b) else "no date"))
            continue
        title = (curated[stem]["title"] if stem in curated else
                 special_title(cfg["name"], stem) if not cfg.get("year_only") else clean_title(stem))
        issue = Issue(year=d[0], month=d[1], title=title, slug=f"{cfg['slug']}-" + re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-"),
                      source_page=0, ia_identifier=key(b))
        issue.id = special_id(cfg["block"], b["stem"])
        issue.page_count = b["pages"]
        issues.append(issue)
    issues.sort(key=lambda i: (i.year, i.month, i.number is None, i.number or 0, i.title))
    ids = [i.id for i in issues]
    assert len(ids) == len(set(ids)), "duplicate issue ids in a pack"
    cat = Catalog(magazine_name=cfg["name"], magazine_slug=cfg["slug"], source=f"archive.org item{'s' if len(snaps) > 1 else ''} {', '.join(snaps)} (pack)",
                  issues=issues, problems=problems)
    return cat, skipped
