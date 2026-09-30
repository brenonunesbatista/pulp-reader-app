"""Write a Catalog to SQLite (SPEC §3) with FTS5 search tables. Deterministic: same input → same file."""
from __future__ import annotations

import sqlite3
from pathlib import Path

from .model import Catalog
from .names import NameRegistry, clean, key


def _key(raw: str) -> str:
    return key(clean(raw))

MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
               "November", "December"]

SCHEMA = """
PRAGMA page_size = 4096;
CREATE TABLE catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE magazine (id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, source TEXT);
CREATE TABLE issue (
  id INTEGER PRIMARY KEY,
  magazine_id INTEGER NOT NULL REFERENCES magazine(id),
  slug TEXT NOT NULL UNIQUE,
  year INTEGER NOT NULL, month INTEGER NOT NULL, title TEXT NOT NULL,
  volume INTEGER, number INTEGER,
  cover_artist TEXT, editor TEXT,
  ia_identifier TEXT,
  availability TEXT NOT NULL CHECK (availability IN ('ia','hathitrust','none')),
  cover_path TEXT,
  page_count INTEGER            -- unknown at build time; filled from the IIIF manifest by the app
);
CREATE INDEX issue_by_date ON issue(magazine_id, year, month);
CREATE TABLE story (
  id INTEGER PRIMARY KEY,
  issue_id INTEGER NOT NULL REFERENCES issue(id),
  title TEXT NOT NULL, part_info TEXT,
  type_code TEXT, type_label TEXT,
  page_printed INTEGER,
  ia_leaf INTEGER,              -- 0-based leaf from the guide link: a hint, can be off (docs/archive-findings.md §5)
  sort_order INTEGER NOT NULL,
  note TEXT
);
CREATE INDEX story_by_issue ON story(issue_id, sort_order);
CREATE TABLE person (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE story_person (
  story_id INTEGER NOT NULL REFERENCES story(id), person_id INTEGER NOT NULL REFERENCES person(id),
  role TEXT NOT NULL CHECK (role IN ('author','editor','translator','illustrator')),
  raw_name TEXT NOT NULL,
  PRIMARY KEY (story_id, person_id, role)
);
CREATE INDEX story_person_by_person ON story_person(person_id);
CREATE TABLE issue_person (
  issue_id INTEGER NOT NULL REFERENCES issue(id), person_id INTEGER NOT NULL REFERENCES person(id),
  role TEXT NOT NULL CHECK (role IN ('editor','cover_artist')),
  raw_name TEXT NOT NULL,
  PRIMARY KEY (issue_id, person_id, role)
);
CREATE INDEX issue_person_by_person ON issue_person(person_id);

-- Search (SPEC §2.1): prefix matching, case/accent-insensitive. rowid = id of the base table.
CREATE VIRTUAL TABLE issue_fts USING fts5(
  magazine, title, year, month, cover_artist, editor,
  tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3 4');
CREATE VIRTUAL TABLE story_fts USING fts5(
  title, series, authors, translators, type_label, issue_title,
  tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3 4');
CREATE VIRTUAL TABLE person_fts USING fts5(
  name, roles,
  tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3 4');
"""


def write(cat: Catalog, db_path: Path, cover_paths: dict[str, str], source_sha256: str) -> dict[str, int]:
    if db_path.exists():
        db_path.unlink()
    con = sqlite3.connect(db_path)
    con.executescript(SCHEMA)
    con.executemany("INSERT INTO catalog_meta VALUES (?, ?)", [
        ("schema_version", "1"), ("source", cat.source), ("source_sha256", source_sha256)])
    con.execute("INSERT INTO magazine VALUES (1, ?, ?, ?)", (cat.magazine_name, cat.magazine_slug, cat.source))

    # people first, so ids are stable (sorted by display name)
    reg = name_registry(cat)
    person_id = {k: i for i, k in enumerate(reg.keys(), 1)}
    con.executemany("INSERT INTO person VALUES (?, ?)", [(p, reg.display(k)) for k, p in person_id.items()])
    roles: dict[int, set[str]] = {}

    def pid(raw: str) -> int:
        return person_id[_key(raw)]

    story_id = 0
    for iid, issue in enumerate(cat.issues, 1):
        editors = []
        for s in issue.stories:
            if s.type_code == "ed":
                editors += [c.raw for c in s.credits if c.role == "author"]
        editors = list(dict.fromkeys(reg.display(_key(e)) for e in editors))
        cover_artist = reg.display(_key(issue.cover_artist_raw)) if issue.cover_artist_raw else None
        con.execute("INSERT INTO issue VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)", (
            iid, 1, issue.slug, issue.year, issue.month, issue.title, issue.volume, issue.number,
            cover_artist, " & ".join(editors) or None, issue.ia_identifier, issue.availability,
            cover_paths.get(issue.slug), None))
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
    return {"issues": len(cat.issues), "stories": story_id, "people": len(person_id)}


def name_registry(cat: Catalog) -> NameRegistry:
    reg = NameRegistry()
    for issue in cat.issues:
        if issue.cover_artist_raw:
            reg.add(issue.cover_artist_raw)
        for s in issue.stories:
            for c in s.credits:
                reg.add(c.raw)
    return reg
