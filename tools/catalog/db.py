"""Write a Catalog to SQLite (SPEC §3) with FTS5 search tables. Deterministic: same input → same file."""
from __future__ import annotations

import sqlite3
from dataclasses import dataclass, field
from pathlib import Path

from .model import Catalog
from .names import NameRegistry, clean, key


def _key(raw: str) -> str:
    return key(clean(raw))

MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
               "November", "December"]

SCHEMA = (Path(__file__).with_name("schema.sql")).read_text(encoding="utf-8")


@dataclass
class Part:
    """one magazine in the catalog: its adapter output, category slug and other scans per chosen IA identifier"""
    cat: Catalog
    category: str
    alternates: dict[str, list[str]] = field(default_factory=dict)
    block: int | None = None  # stable issue ids (sources.toml); None = sequential (Amazing Stories, ids 1–309)


def issue_id(block: int, year: int, month: int, n: int) -> int:
    """stable id of an issue: never moves when a collection is refreshed or a magazine is added"""
    assert 0 <= n < 10 and 1 <= month <= 12
    return block * 10_000_000 + year * 1000 + month * 10 + n


def write(parts: list[Part], categories: list[dict], db_path: Path, cover_paths: dict[str, str],
          meta: dict[str, str]) -> dict[str, int]:
    if db_path.exists():
        db_path.unlink()
    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA)
    con.executemany("INSERT INTO catalog_meta VALUES (?, ?)", [("schema_version", "2"), *sorted(meta.items())])
    cat_id = {c["slug"]: i for i, c in enumerate(categories, 1)}
    con.executemany("INSERT INTO category VALUES (?, ?, ?, ?)", [(i, c["slug"], c["name"], i) for c, i in
                                                                 zip(categories, cat_id.values())])
    for mid, part in enumerate(parts, 1):
        con.execute("INSERT INTO magazine VALUES (?, ?, ?, ?, ?, ?)", (
            mid, part.cat.magazine_name, part.cat.magazine_slug, part.cat.source, cat_id[part.category], mid))

    # people first, so ids are stable (sorted by display name)
    reg = name_registry(*(p.cat for p in parts))
    person_id = {k: i for i, k in enumerate(reg.keys(), 1)}
    con.executemany("INSERT INTO person VALUES (?, ?)", [(p, reg.display(k)) for k, p in person_id.items()])
    roles: dict[int, set[str]] = {}

    def pid(raw: str) -> int:
        return person_id[_key(raw)]

    story_id = 0
    seq = 0
    count = 0
    blocks = [p.block for p in parts if p.block is not None]
    assert len(blocks) == len(set(blocks)), "two magazines share a block"
    for mid, part in enumerate(parts, 1):
        cat = part.cat
        per_month: dict[tuple[int, int], int] = {}
        for issue in cat.issues:
            count += 1
            if part.block is None:
                seq += 1
                iid = seq
            else:
                n = per_month.get((issue.year, issue.month), 0)
                per_month[(issue.year, issue.month)] = n + 1
                iid = issue_id(part.block, issue.year, issue.month, n)
            editors = []
            for s in issue.stories:
                if s.type_code == "ed":
                    editors += [c.raw for c in s.credits if c.role == "author"]
            editors = list(dict.fromkeys(reg.display(_key(e)) for e in editors))
            cover_artist = reg.display(_key(issue.cover_artist_raw)) if issue.cover_artist_raw else None
            con.execute("INSERT INTO issue VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                iid, mid, issue.slug, issue.year, issue.month, issue.title, issue.volume, issue.number,
                cover_artist, " & ".join(editors) or None, issue.ia_identifier, issue.availability,
                cover_paths.get(issue.slug), None))
            con.executemany("INSERT INTO issue_scan VALUES (?, ?)",
                            [(iid, alt) for alt in part.alternates.get(issue.ia_identifier or "", [])])
            ip: list[tuple] = []
            if issue.cover_artist_raw:
                ip.append((iid, pid(issue.cover_artist_raw), "cover_artist", issue.cover_artist_raw))
                roles.setdefault(pid(issue.cover_artist_raw), set()).add("cover artist")
            for s in issue.stories:
                if s.type_code == "ed":
                    for c in s.credits:
                        if c.role == "author":
                            ip.append((iid, pid(c.raw), "editor", c.raw))
                            roles.setdefault(pid(c.raw), set()).add("editor")
            con.executemany("INSERT OR IGNORE INTO issue_person VALUES (?,?,?,?)", ip)
            con.execute("INSERT INTO issue_fts(rowid, magazine, title, year, month, cover_artist, editor) VALUES (?,?,?,?,?,?,?)",
                        (iid, cat.magazine_name, issue.title, str(issue.year), MONTH_NAMES[issue.month - 1],
                         cover_artist or "", " ".join(editors)))

            for order, s in enumerate(issue.stories, 1):
                story_id += 1
                con.execute("INSERT INTO story VALUES (?,?,?,?,?,?,?,?,?,?)", (
                    story_id, iid, s.title, s.part_info, s.type_code, s.type_label, s.page_printed, s.ia_leaf, order, s.note))
                sp = [(story_id, pid(c.raw), c.role, c.raw) for c in s.credits]
                con.executemany("INSERT OR IGNORE INTO story_person VALUES (?,?,?,?)", sp)
                for c in s.credits:
                    roles.setdefault(pid(c.raw), set()).add(c.role)
                series = "; ".join(n[len("series: "):] for n in (s.note or "").split("; ") if n.startswith("series: "))
                # authors column also gets pseudonym notes ("Eando Binder = Earl Binder & Otto O. Binder")
                real = " ".join(n for n in (s.note or "").split("; ") if " = " in n)
                con.execute("INSERT INTO story_fts(rowid, title, series, authors, translators, type_label, issue_title) "
                            "VALUES (?,?,?,?,?,?,?)", (
                                story_id, s.title, series,
                                " ".join(reg.display(_key(c.raw)) for c in s.credits if c.role == "author") + " " + real,
                                " ".join(reg.display(_key(c.raw)) for c in s.credits if c.role == "translator"),
                                s.type_label or "", issue.title))
    con.executemany("INSERT INTO person_fts(rowid, name, roles) VALUES (?,?,?)",
                    [(p, reg.display(k), " ".join(sorted(roles.get(p, set())))) for k, p in person_id.items()])
    con.execute("INSERT INTO story_fts(story_fts) VALUES ('optimize')")
    con.execute("INSERT INTO issue_fts(issue_fts) VALUES ('optimize')")
    con.execute("INSERT INTO person_fts(person_fts) VALUES ('optimize')")
    con.commit()
    con.execute("VACUUM")
    con.close()
    return {"issues": count, "stories": story_id, "people": len(person_id)}


def name_registry(*cats: Catalog) -> NameRegistry:
    reg = NameRegistry()
    for issue in (i for cat in cats for i in cat.issues):
        if issue.cover_artist_raw:
            reg.add(issue.cover_artist_raw)
        for s in issue.stories:
            for c in s.credits:
                reg.add(c.raw)
    return reg
