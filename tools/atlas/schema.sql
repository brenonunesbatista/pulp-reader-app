-- atlas.db: curated Atlas content (built by tools/atlas/build_atlas.py from content/atlas, reviewed entities only).
-- Shipped with the app next to catalog.db; read-only in the app. Shared with the app tests.
CREATE TABLE atlas_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE entity (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,          -- person | work | film | series | radio | music | artwork | magazine | issue | event | movement | theme
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL,
  lane TEXT,                   -- timeline lane (NULL: not on the timeline)
  date TEXT,                   -- YYYY[-MM[-DD]]
  end_date TEXT,
  year INTEGER,                -- from date, for sorting and timeline columns
  end_year INTEGER,
  body TEXT NOT NULL,          -- Markdown with [n] citations; "## Why it matters" section
  why TEXT,                    -- the "Why it matters" text, also in body
  image_url TEXT, image_credit TEXT, image_license TEXT, image_source TEXT,
  catalog_cover TEXT,          -- "<magazine slug>/YYYY-MM" (cover from catalog.db's covers)
  imdb TEXT, spotify_album TEXT
);
CREATE INDEX entity_year ON entity(year);

CREATE TABLE entity_theme (entity_id TEXT NOT NULL, theme_id TEXT NOT NULL, PRIMARY KEY (entity_id, theme_id));
CREATE INDEX entity_theme_by_theme ON entity_theme(theme_id);

-- every link is stored twice: as declared (inverse = 0) and from the other side (inverse = 1)
CREATE TABLE link (src TEXT NOT NULL, rel TEXT NOT NULL, dst TEXT NOT NULL, inverse INTEGER NOT NULL, note TEXT);
CREATE INDEX link_by_src ON link(src);

-- where to read an entity in Banca; resolved against catalog.db at runtime (slug + issue month + story title)
CREATE TABLE catalog_ref (entity_id TEXT NOT NULL, magazine TEXT NOT NULL, year INTEGER NOT NULL, month INTEGER NOT NULL,
  story TEXT, sort INTEGER NOT NULL);
CREATE INDEX catalog_ref_by_entity ON catalog_ref(entity_id);

CREATE TABLE source (entity_id TEXT NOT NULL, n INTEGER NOT NULL, title TEXT NOT NULL, url TEXT NOT NULL, PRIMARY KEY (entity_id, n));

CREATE TABLE path (id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE path_stop (path_id TEXT NOT NULL, pos INTEGER NOT NULL, entity_id TEXT NOT NULL, why TEXT NOT NULL,
  PRIMARY KEY (path_id, pos));

CREATE VIRTUAL TABLE entity_fts USING fts5(id UNINDEXED, title, subtitle, body, tokenize = 'unicode61 remove_diacritics 2', prefix = '2 3 4');
