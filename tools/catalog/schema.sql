-- Catalog schema (SPEC §3). Single source: used by tools/catalog/db.py and the app tests.
PRAGMA page_size = 4096;
CREATE TABLE catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- categories keep content types apart (pulp / rpg / comics); magazines are listed by category, then sort
CREATE TABLE category (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL, sort INTEGER NOT NULL);
CREATE TABLE magazine (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, source TEXT,
  category_id INTEGER NOT NULL REFERENCES category(id), sort INTEGER NOT NULL);
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
-- other scans of the same issue on the Internet Archive (the issue row holds the best one)
CREATE TABLE issue_scan (
  issue_id INTEGER NOT NULL REFERENCES issue(id), ia_identifier TEXT NOT NULL, PRIMARY KEY (issue_id, ia_identifier));
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
