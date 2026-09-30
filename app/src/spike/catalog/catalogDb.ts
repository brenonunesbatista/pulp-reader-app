// Spike access to the prebuilt catalog.db (native only: the web build would need jeep-sqlite/wasm).
import { Capacitor } from '@capacitor/core'
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'

export interface IssueRow {
  id: number; slug: string; year: number; month: number; title: string; cover_artist: string | null
  editor: string | null; ia_identifier: string | null; availability: string; cover_path: string | null; n: number
}
export interface StoryRow {
  id: number; title: string; part_info: string | null; type_code: string | null; type_label: string | null
  page_printed: number | null; ia_leaf: number | null; note: string | null; authors: string | null
  issue_id: number; issue_title: string; ia_identifier: string | null
}
export interface PersonRow { id: number; name: string; roles: string }

let db: SQLiteDBConnection | null = null
export let openInfo = ''

export async function openCatalog(): Promise<SQLiteDBConnection> {
  if (db) return db
  if (!Capacitor.isNativePlatform()) throw new Error('Catalog spike runs on the tablet only (native SQLite).')
  const sqlite = new SQLiteConnection(CapacitorSQLite)
  const t0 = performance.now()
  await sqlite.copyFromAssets(true) // spike: always refresh the prebuilt copy
  const t1 = performance.now()
  const conn = await sqlite.createConnection('catalog', false, 'no-encryption', 1, true)
  await conn.open()
  openInfo = `copy ${Math.round(t1 - t0)} ms, open ${Math.round(performance.now() - t1)} ms`
  db = conn
  return conn
}

export async function timed<T>(sql: string, values: unknown[] = []): Promise<{ rows: T[]; ms: number }> {
  const conn = await openCatalog()
  const t = performance.now()
  const r = await conn.query(sql, values as never[])
  return { rows: (r.values ?? []) as T[], ms: performance.now() - t }
}

const STORY_COLS = `s.id, s.title, s.part_info, s.type_code, s.type_label, s.page_printed, s.ia_leaf, s.note,
  (SELECT group_concat(p.name, ', ') FROM story_person sp JOIN person p ON p.id = sp.person_id
     WHERE sp.story_id = s.id AND sp.role = 'author') AS authors,
  i.id AS issue_id, i.title AS issue_title, i.ia_identifier`

export const Q = {
  issues: `SELECT i.id, i.slug, i.year, i.month, i.title, i.cover_artist, i.editor, i.ia_identifier, i.availability,
             i.cover_path, (SELECT count(*) FROM story s WHERE s.issue_id = i.id) AS n
           FROM issue i ORDER BY i.year, i.month, i.id`,
  issueStories: `SELECT ${STORY_COLS} FROM story s JOIN issue i ON i.id = s.issue_id WHERE s.issue_id = ? ORDER BY s.sort_order`,
  personStories: `SELECT ${STORY_COLS} FROM story_person sp JOIN story s ON s.id = sp.story_id JOIN issue i ON i.id = s.issue_id
                  WHERE sp.person_id = ? ORDER BY i.year, i.month, s.sort_order`,
  searchIssues: `SELECT i.id, i.slug, i.year, i.month, i.title, i.cover_artist, i.editor, i.ia_identifier, i.availability,
                   i.cover_path, 0 AS n
                 FROM issue_fts f JOIN issue i ON i.id = f.rowid WHERE issue_fts MATCH ? ORDER BY rank LIMIT 20`,
  searchStories: `SELECT ${STORY_COLS} FROM story_fts f JOIN story s ON s.id = f.rowid JOIN issue i ON i.id = s.issue_id
                  WHERE story_fts MATCH ? ORDER BY rank LIMIT 60`,
  searchPeople: `SELECT p.id, p.name, f.roles FROM person_fts f JOIN person p ON p.id = f.rowid
                 WHERE person_fts MATCH ? ORDER BY rank LIMIT 20`,
}

/** "wells time" → `"wells"* "time"*` (prefix on every token, quotes stripped). */
export function ftsQuery(input: string): string | null {
  const toks = input.toLowerCase().replace(/["*^:()]/g, ' ').split(/\s+/).filter(Boolean)
  return toks.length ? toks.map((t) => `"${t}"*`).join(' ') : null
}
