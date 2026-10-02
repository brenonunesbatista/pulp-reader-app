"""Validate Atlas content (content/atlas): front matter, links, themes, citations, catalog references.

Usage: python tools/atlas/validate.py [--content content/atlas] [--catalog app/public/catalog/catalog.db]
Exit code 1 when there are errors. Warnings (e.g. a source never cited) do not fail.
"""
from __future__ import annotations

import argparse
import re
import sqlite3
import sys
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TYPES = {"person", "work", "film", "series", "radio", "music", "artwork", "magazine", "issue", "event", "movement", "theme"}
LANES = {"magazines", "books", "film-tv", "music", "visual-art", "comics", "events"}
RELS = {"influenced", "adapted_as", "published_in", "created_by", "read_next", "context"}
STATUSES = {"draft", "reviewed"}
DATE = re.compile(r"^\d{4}(-\d{2}(-\d{2})?)?$")
ID = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
CITE = re.compile(r"\[(\d+)\]")


@dataclass
class Doc:
    path: Path
    meta: dict
    body: str


@dataclass
class Report:
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def err(self, where: Path | str, msg: str) -> None:
        self.errors.append(f"{where}: {msg}")

    def warn(self, where: Path | str, msg: str) -> None:
        self.warnings.append(f"{where}: {msg}")


def parse(path: Path) -> Doc:
    text = path.read_text(encoding="utf-8").replace("\r\n", "\n")  # git may check files out with CRLF
    m = re.match(r"^\+\+\+\n(.*?)\n\+\+\+\n(.*)$", text, re.S)
    if not m:
        raise ValueError("missing +++ front matter")
    return Doc(path, tomllib.loads(m.group(1)), m.group(2))


def catalog_index(db: Path | None):
    """{(magazine slug, 'YYYY-MM'): set(story titles)} or None when the catalog is not built."""
    if not db or not db.exists():
        return None
    con = sqlite3.connect(db)
    idx: dict[tuple[str, str], set[str]] = {}
    for slug, y, mth, title in con.execute(
            "SELECT m.slug, i.year, i.month, s.title FROM issue i JOIN magazine m ON m.id = i.magazine_id "
            "LEFT JOIN story s ON s.issue_id = i.id"):
        idx.setdefault((slug, f"{y:04d}-{mth:02d}"), set()).add(title)
    return idx


def validate(content: Path, catalog_db: Path | None) -> Report:
    r = Report()
    docs: dict[str, Doc] = {}
    for p in sorted((content / "entities").glob("*.md")):
        try:
            d = parse(p)
        except (ValueError, tomllib.TOMLDecodeError) as e:
            r.err(p.name, f"cannot parse: {e}")
            continue
        did = d.meta.get("id")
        if did != p.stem:
            r.err(p.name, f"id {did!r} must equal the file name")
        if did in docs:
            r.err(p.name, f"duplicate id {did}")
        docs[p.stem] = d

    themes = {i for i, d in docs.items() if d.meta.get("type") == "theme"}
    cat = catalog_index(catalog_db)

    for i, d in docs.items():
        m, where = d.meta, f"entities/{i}.md"
        for key in ("type", "title", "subtitle", "status"):
            if not m.get(key):
                r.err(where, f"missing {key}")
        if not ID.match(i):
            r.err(where, "id must be lowercase words joined by hyphens")
        if m.get("type") not in TYPES:
            r.err(where, f"unknown type {m.get('type')!r}")
        if m.get("status") not in STATUSES:
            r.err(where, f"unknown status {m.get('status')!r}")
        if "lane" in m and m["lane"] not in LANES:
            r.err(where, f"unknown lane {m['lane']!r}")
        if m.get("lane") and not m.get("date"):
            r.err(where, "an entity on a timeline lane needs a date")
        for k in ("date", "end"):
            if k in m and not DATE.match(str(m[k])):
                r.err(where, f"{k} must be YYYY, YYYY-MM or YYYY-MM-DD")
        if m.get("date") and m.get("end") and str(m["end"]) < str(m["date"]):
            r.err(where, "end is before date")
        for t in m.get("themes", []):
            if t not in themes:
                r.err(where, f"unknown theme {t!r}")
        for link in m.get("links", []):
            if link.get("rel") not in RELS:
                r.err(where, f"unknown link rel {link.get('rel')!r}")
            if link.get("to") not in docs:
                r.err(where, f"link to missing entity {link.get('to')!r}")
            if link.get("to") == i:
                r.err(where, "link to itself")

        # sources and citations
        sources = m.get("sources", [])
        ns = [s.get("n") for s in sources]
        if ns != list(range(1, len(ns) + 1)):
            r.err(where, "sources must be numbered 1, 2, 3 …")
        for s in sources:
            if not re.match(r"^(https?://|banca:)", s.get("url", "")):
                r.err(where, f"source {s.get('n')} needs an http(s) or banca: url")
            if not s.get("title"):
                r.err(where, f"source {s.get('n')} needs a title")
        cited = {int(c) for c in CITE.findall(d.body)}
        for c in sorted(cited - set(ns)):
            r.err(where, f"citation [{c}] has no source")
        for n in sorted(set(ns) - cited):
            r.warn(where, f"source {n} is never cited")
        if not sources and m.get("type") != "theme":
            r.err(where, "no sources")
        if "## Why it matters" not in d.body and m.get("type") != "theme":
            r.warn(where, "no 'Why it matters' section")

        # catalog references
        refs = list(m.get("catalog", []))
        cover = (m.get("image") or {}).get("catalog_cover")
        if cover:
            mag, _, issue = cover.partition("/")
            refs.append({"magazine": mag, "issue": issue})
        for ref in refs:
            key = (ref.get("magazine", ""), ref.get("issue", ""))
            if not re.match(r"^\d{4}-\d{2}$", key[1]):
                r.err(where, f"catalog issue {key[1]!r} must be YYYY-MM")
            elif cat is not None:
                if key not in cat:
                    r.err(where, f"catalog has no issue {key[0]} {key[1]}")
                elif ref.get("story") and ref["story"] not in cat[key]:
                    r.err(where, f"catalog issue {key[0]} {key[1]} has no story {ref['story']!r}")

    # paths
    for p in sorted((content / "paths").glob("*.md")):
        try:
            d = parse(p)
        except (ValueError, tomllib.TOMLDecodeError) as e:
            r.err(p.name, f"cannot parse: {e}")
            continue
        where = f"paths/{p.name}"
        if d.meta.get("id") != p.stem:
            r.err(where, "id must equal the file name")
        stops = d.meta.get("stops", [])
        if not stops:
            r.err(where, "a path needs stops")
        seen = set()
        for s in stops:
            if s.get("entity") not in docs:
                r.err(where, f"stop {s.get('entity')!r} is not an entity")
            if s.get("entity") in seen:
                r.err(where, f"stop {s.get('entity')!r} repeated")
            seen.add(s.get("entity"))
            if not s.get("why"):
                r.err(where, f"stop {s.get('entity')!r} needs a why")
    return r


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--content", type=Path, default=ROOT / "content" / "atlas")
    ap.add_argument("--catalog", type=Path, default=ROOT / "app" / "public" / "catalog" / "catalog.db")
    a = ap.parse_args(argv)
    r = validate(a.content, a.catalog)
    for w in r.warnings:
        print("warning:", w)
    for e in r.errors:
        print("error:", e)
    n = len(list((a.content / "entities").glob("*.md")))
    status = "catalog checked" if a.catalog.exists() else "catalog not built: references not checked"
    print(f"{n} entities, {len(r.errors)} errors, {len(r.warnings)} warnings ({status})")
    return 1 if r.errors else 0


if __name__ == "__main__":
    sys.exit(main())
