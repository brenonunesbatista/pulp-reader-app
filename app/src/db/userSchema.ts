// User data (SPEC §3). Separate database: catalog updates must never touch it.
import type { Db } from './types'

/** Ordered migrations; index + 1 = schema version. Only ever append. */
export const USER_MIGRATIONS: string[] = [
  `CREATE TABLE download (
     issue_id INTEGER PRIMARY KEY,
     state TEXT NOT NULL CHECK (state IN ('none','downloading','paused','done','error')),
     bytes INTEGER NOT NULL DEFAULT 0, pages_done INTEGER NOT NULL DEFAULT 0, pages_total INTEGER NOT NULL DEFAULT 0,
     updated_at INTEGER NOT NULL);
   CREATE TABLE progress (
     issue_id INTEGER PRIMARY KEY,
     page INTEGER NOT NULL, offset_x REAL NOT NULL DEFAULT 0, offset_y REAL NOT NULL DEFAULT 0,
     zoom REAL NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL);
   CREATE INDEX progress_recent ON progress(updated_at DESC);
   CREATE TABLE highlight (
     id INTEGER PRIMARY KEY, issue_id INTEGER NOT NULL, page INTEGER NOT NULL,
     rects_json TEXT NOT NULL, text TEXT NOT NULL, color TEXT NOT NULL, note TEXT, created_at INTEGER NOT NULL);
   CREATE INDEX highlight_by_issue ON highlight(issue_id, page);
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
  // v2 (Phase 3): progress knows the scan length (shelf progress bars); bookmarks; OCR-derived page map per scan
  `ALTER TABLE progress ADD COLUMN page_count INTEGER;
   CREATE TABLE bookmark (
     issue_id INTEGER NOT NULL, page INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (issue_id, page));
   CREATE TABLE page_map (
     ia_identifier TEXT PRIMARY KEY, printed_json TEXT NOT NULL, offset INTEGER, updated_at INTEGER NOT NULL);`,
]

export async function migrateUserDb(db: Db): Promise<number> {
  await db.exec('CREATE TABLE IF NOT EXISTS user_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  const rows = await db.query<{ value: string }>("SELECT value FROM user_meta WHERE key = 'version'")
  let version = rows.length ? Number(rows[0].value) : 0
  while (version < USER_MIGRATIONS.length) {
    await db.exec(USER_MIGRATIONS[version])
    version++
    await db.run("INSERT OR REPLACE INTO user_meta (key, value) VALUES ('version', ?)", [String(version)])
  }
  return version
}
