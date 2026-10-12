"""Issue contents from the ISFDB (https://www.isfdb.org, CC BY 4.0) for magazines without a reference guide (Phase 9).

`extract()` reads an ISFDB database backup (the zipped mysqldump the ISFDB offers for download; only bibliographic
tables are read — never the wiki user tables) and writes, per magazine, the issues whose title matches the magazine's
`isfdb` pattern in sources.toml: date, title, contents (title, type, length, printed page, credited authors and, for
pseudonyms, the real names), cover artists and editors. That small extract is committed (tools/sources/isfdb/), so
catalog builds need neither the 1.6 GB dump nor the network.

`attach()` adds an extract's contents to a catalog built by another adapter, matching issues by year and month.
"""
from __future__ import annotations

import html
import json
import re
from collections import defaultdict
from pathlib import Path

from .model import Catalog, Credit, ParseIssue, Story

SOURCE_NOTE = "ISFDB, The Internet Speculative Fiction Database (https://www.isfdb.org), CC BY 4.0"
CONTENT_TYPES = {"SHORTFICTION", "SERIAL", "NOVEL", "ESSAY", "POEM", "INTERVIEW"}
STORYLEN = {"novella": "na", "novelette": "nv", "short story": "ss"}
SEASONS = {"winter": 1, "spring": 4, "summer": 7, "fall": 10, "autumn": 10}


def _u(s: str | None) -> str:
    return html.unescape(s or "").strip()


def extract(dump: Path, magazines: list[dict], out_dir: Path, log=print) -> dict[str, int]:
    from .mysqldump import rows
    pats = {m["slug"]: re.compile(m["isfdb"], re.I) for m in magazines}
    excl = {m["slug"]: re.compile(m["isfdb_exclude"], re.I) for m in magazines if m.get("isfdb_exclude")}

    # 1. the magazines' issues
    pubs: dict[int, dict] = {}
    for _, r in rows(dump, {"pubs"}, lambda t, r: r[7] == "MAGAZINE"):
        title = _u(r[1])
        for slug, p in pats.items():
            if p.search(title) and not (slug in excl and excl[slug].search(title)):
                pubs[r[0]] = {"slug": slug, "id": r[0], "title": title, "date": str(r[3] or ""), "items": [],
                              "cover_artists": [], "editors": []}
                break
    log(f"  {len(pubs)} issues")
    # 2. what is in them
    content: list[tuple[int, int, str]] = []
    for _, r in rows(dump, {"pub_content"}, lambda t, r: r[2] in pubs):
        content.append((r[2], r[1], r[3] or ""))
    want = {c[1] for c in content}
    log(f"  {len(content)} content rows")
    # 3. titles (and their parents, for pseudonyms)
    titles: dict[int, tuple] = {}
    for _, r in rows(dump, {"titles"}, lambda t, r: r[0] in want):
        titles[r[0]] = (_u(r[1]), r[9], _u(r[8]) or None, r[12])  # title, ttype, storylen, parent
    parents = {t[3] for t in titles.values() if t[3]}
    # 4. authors of titles and parents
    names: dict[int, str] = {}
    by_title: dict[int, list[int]] = defaultdict(list)
    ids = want | parents
    for table, r in rows(dump, {"authors", "canonical_author"}):
        if table == "authors":
            names[r[0]] = _u(r[1])
        elif r[1] in ids and r[3] == 1:
            by_title[r[1]].append(r[2])
    who = lambda tid: [names.get(a, "?") for a in by_title.get(tid, [])]  # noqa: E731

    for pid, tid, page in sorted(content, key=lambda c: (c[0], _page_key(c[2]))):
        t = titles.get(tid)
        if not t:
            continue
        title, ttype, storylen, parent = t
        pub = pubs[pid]
        if ttype == "COVERART":
            pub["cover_artists"] += [a for a in who(tid) if a not in pub["cover_artists"]]
        elif ttype == "EDITOR":
            pub["editors"] += [a for a in who(tid) if a not in pub["editors"]]
        elif ttype in CONTENT_TYPES:
            authors = who(tid)
            real = who(parent) if parent else []
            pub["items"].append({"title": title, "type": ttype, "len": storylen, "page": page, "authors": authors,
                                 "real": real if real and sorted(real) != sorted(authors) else []})
    counts: dict[str, int] = {}
    out_dir.mkdir(parents=True, exist_ok=True)
    for m in magazines:
        mine = sorted(({k: v for k, v in p.items() if k != "slug"} for p in pubs.values() if p["slug"] == m["slug"]),
                      key=lambda p: (p["date"], p["id"]))
        (out_dir / f"{m['slug']}.json").write_text(json.dumps(
            {"source": SOURCE_NOTE, "dump": dump.name, "pattern": m["isfdb"], "issues": mine},
            ensure_ascii=False, indent=0) + "\n", encoding="utf-8", newline="\n")
        counts[m["slug"]] = len(mine)
    return counts


def _page_key(page: str) -> tuple:
    p = page.split("|")
    try:
        return (0, int(re.sub(r"\D", "", p[1] if len(p) > 1 else p[0]) or 0) if len(p) > 1 else _num(p[0]), 0)
    except ValueError:
        return (1, 0, 0)


def _num(s: str) -> int:
    m = re.search(r"\d+", s)
    return int(m[0]) if m else (-1 if s.strip().lower() in ("fc", "ifc") else 10_000)


def printed_page(page: str) -> int | None:
    """'34', '[34]', '34|2' → 34; covers and roman numerals → None"""
    m = re.match(r"\[?(\d+)\]?", page.split("|")[0].strip())
    return int(m[1]) if m else None


def _type(item: dict) -> tuple[str, str | None]:
    """→ (FictionMags code, part info) — the app's type tags (ui/format.ts typeTagClass)"""
    t = item["type"]
    if t == "SERIAL":
        m = re.search(r"\(Part (\d+) of (\d+)\)", item["title"])
        return "n.", f"Part {m[1]} of {m[2]}" if m else "Serial"
    if t == "NOVEL":
        return "n.", None
    if t == "SHORTFICTION":
        return STORYLEN.get(item["len"] or "", "ss"), None
    if t == "ESSAY":
        return ("ed", None) if re.match(r"editorial\b", item["title"], re.I) else ("ar", None)
    return {"POEM": "pm", "INTERVIEW": "iv"}.get(t, "ms"), None


def _ym(issue: dict) -> tuple[int, int] | None:
    m = re.match(r"(\d{4})-(\d{2})", issue["date"])
    if not m or m[1] == "0000":
        return None
    y, mo = int(m[1]), int(m[2])
    if mo == 0:
        s = re.search(r"\b(winter|spring|summer|fall|autumn)\b", issue["title"], re.I)
        return (y, SEASONS[s[1].lower()]) if s else None
    return y, mo


def attach(cat: Catalog, extract_file: Path) -> dict[str, int]:
    """Add the extract's contents to `cat`'s issues (same year and month; the other way round for two issues dated
    alike: in order). Unmatched ISFDB issues and catalog issues are reported as problems."""
    from .item_types import ITEM_TYPES
    data = json.loads(extract_file.read_text(encoding="utf-8"))
    by_month: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for i in data["issues"]:
        ym = _ym(i)
        if ym:
            by_month[ym].append(i)
    used: set[int] = set()
    matched = 0
    for issue in cat.issues:
        cands = [i for i in by_month.get((issue.year, issue.month), []) if i["id"] not in used]
        if not cands:  # a month off (bimonthly / seasonal issues are dated differently)
            for d in (-1, 1):
                k = (issue.year * 12 + issue.month - 1 + d)
                cands = [i for i in by_month.get((k // 12, k % 12 + 1), []) if i["id"] not in used]
                if cands:
                    break
        if not cands:
            cat.problems.append(ParseIssue("isfdb-unmatched-issue", 0, issue.slug, issue.title))
            continue
        pub = max(cands, key=lambda i: len(i["items"]))
        used.add(pub["id"])
        matched += 1
        for it in pub["items"]:
            code, part = _type(it)
            credited = [a for a in it["authors"] if a not in ("uncredited", "?")]
            if not credited and it["real"]:  # uncredited, but the ISFDB knows who wrote it
                credits = [Credit(raw=a, role="author") for a in it["real"]]
                note = "uncredited"
            else:
                credits = [Credit(raw=a, role="author") for a in credited]
                note = f"{', '.join(credited)} = {', '.join(it['real'])}" if it["real"] and credited else None
            title = re.sub(r"\s*\(Part \d+ of \d+\)$", "", it["title"])
            # recurring columns are disambiguated with the issue: "Forecast (Galaxy, October 1950)"
            title = re.sub(r"\s*\([^()]*(?:1[89]|20)\d\d\)$", "", title) or title
            issue.stories.append(Story(title=title, raw=it["title"], part_info=part, type_code=code,
                                       type_label=ITEM_TYPES.get(code), page_printed=printed_page(it["page"]),
                                       page_label=it["page"] or None, note=note, credits=credits))
        if pub["cover_artists"] and not issue.cover_artist_raw:
            issue.cover_artist_raw = pub["cover_artists"][0]
        issue.editors_raw = [e for e in pub["editors"] if e != "uncredited"]
    unused = [i for i in data["issues"] if i["id"] not in used and _ym(i)
              and cat.issues and cat.issues[0].year <= _ym(i)[0] <= cat.issues[-1].year]
    for i in unused:
        cat.problems.append(ParseIssue("isfdb-issue-without-scan", 0, str(i["id"]), i["title"]))
    return {"matched": matched, "issues": len(cat.issues), "isfdb_unused": len(unused)}
