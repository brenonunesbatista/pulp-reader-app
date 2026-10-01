// Highlights and bookmarks (user.db). Rects are normalized (0..1) per page, so they survive any zoom or layout.
import type { Db } from '../db/types'

export type Rect = [number, number, number, number]

/** highlight colors (no fixed meaning); yellow is the default */
export const HIGHLIGHT_COLORS = ['yellow', 'red', 'blue', 'green'] as const
export type HighlightColor = (typeof HIGHLIGHT_COLORS)[number]

export interface Highlight {
  id: number
  issueId: number
  page: number // leaf
  rects: Rect[]
  text: string
  color: string
  note: string | null
  createdAt: number
}

export interface Bookmark {
  issueId: number
  page: number
  createdAt: number
}

interface HighlightRow {
  id: number; issue_id: number; page: number; rects_json: string; text: string; color: string; note: string | null
  created_at: number
}

const toHighlight = (r: HighlightRow): Highlight => ({
  id: r.id, issueId: r.issue_id, page: r.page, rects: JSON.parse(r.rects_json) as Rect[], text: r.text, color: r.color,
  note: r.note, createdAt: r.created_at,
})

export async function listHighlights(db: Db, issueId: number): Promise<Highlight[]> {
  const r = await db.query<HighlightRow>(`SELECT * FROM highlight WHERE issue_id = ? ORDER BY page, id`, [issueId])
  return r.map(toHighlight)
}

export async function addHighlight(db: Db, h: Omit<Highlight, 'id' | 'createdAt' | 'note' | 'color'> & { color?: string },
  now = Date.now()): Promise<number> {
  await db.run(`INSERT INTO highlight (issue_id, page, rects_json, text, color, note, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)`,
    [h.issueId, h.page, JSON.stringify(h.rects), h.text, h.color ?? 'yellow', now])
  const r = await db.query<{ id: number }>(`SELECT max(id) AS id FROM highlight WHERE issue_id = ?`, [h.issueId])
  return r[0].id
}

export async function updateHighlight(db: Db, id: number, p: { color?: string; note?: string | null }): Promise<void> {
  if (p.color !== undefined) await db.run(`UPDATE highlight SET color = ? WHERE id = ?`, [p.color, id])
  if (p.note !== undefined) await db.run(`UPDATE highlight SET note = ? WHERE id = ?`, [p.note?.trim() ? p.note.trim() : null, id])
}

/** every highlight, grouped by issue then page (Notes screen, export all) */
export async function listAllHighlights(db: Db): Promise<Highlight[]> {
  const r = await db.query<HighlightRow>(`SELECT * FROM highlight ORDER BY issue_id, page, id`)
  return r.map(toHighlight)
}

export async function listAllBookmarks(db: Db): Promise<Bookmark[]> {
  const r = await db.query<{ issue_id: number; page: number; created_at: number }>(
    `SELECT * FROM bookmark ORDER BY issue_id, page`)
  return r.map((b) => ({ issueId: b.issue_id, page: b.page, createdAt: b.created_at }))
}

export async function deleteHighlight(db: Db, id: number): Promise<void> {
  await db.run(`DELETE FROM highlight WHERE id = ?`, [id])
}

export async function listBookmarks(db: Db, issueId: number): Promise<Bookmark[]> {
  const r = await db.query<{ issue_id: number; page: number; created_at: number }>(
    `SELECT * FROM bookmark WHERE issue_id = ? ORDER BY page`, [issueId])
  return r.map((b) => ({ issueId: b.issue_id, page: b.page, createdAt: b.created_at }))
}

export async function setBookmark(db: Db, issueId: number, page: number, on: boolean, now = Date.now()): Promise<void> {
  if (on) await db.run(`INSERT OR IGNORE INTO bookmark (issue_id, page, created_at) VALUES (?, ?, ?)`, [issueId, page, now])
  else await db.run(`DELETE FROM bookmark WHERE issue_id = ? AND page = ?`, [issueId, page])
}

// ---- page map (OCR-derived leaf → printed page, per scan) -----------------------------------------------------

export async function getPageMap(db: Db, ident: string): Promise<(number | null)[] | null> {
  const r = await db.query<{ printed_json: string }>(`SELECT printed_json FROM page_map WHERE ia_identifier = ?`, [ident])
  return r.length ? (JSON.parse(r[0].printed_json) as (number | null)[]) : null
}

export async function savePageMap(db: Db, ident: string, printed: (number | null)[], offset: number | null,
  now = Date.now()): Promise<void> {
  await db.run(`INSERT OR REPLACE INTO page_map (ia_identifier, printed_json, offset, updated_at) VALUES (?, ?, ?, ?)`,
    [ident, JSON.stringify(printed), offset, now])
}
