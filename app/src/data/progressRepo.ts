// Reading progress (user.db). Saves are debounced by the caller (see screens/ReaderScreen.tsx).
import type { Db } from '../db/types'
import type { Progress } from './models'

interface ProgressRow { issue_id: number; page: number; offset_x: number; offset_y: number; zoom: number; updated_at: number }

const toProgress = (r: ProgressRow): Progress => ({
  issueId: r.issue_id, page: r.page, offsetX: r.offset_x, offsetY: r.offset_y, zoom: r.zoom, updatedAt: r.updated_at,
})

export async function saveProgress(db: Db, p: Omit<Progress, 'updatedAt'>, now = Date.now()): Promise<void> {
  await db.run(
    `INSERT INTO progress (issue_id, page, offset_x, offset_y, zoom, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(issue_id) DO UPDATE SET page = excluded.page, offset_x = excluded.offset_x,
       offset_y = excluded.offset_y, zoom = excluded.zoom, updated_at = excluded.updated_at`,
    [p.issueId, p.page, p.offsetX, p.offsetY, p.zoom, now])
}

export async function getProgress(db: Db, issueId: number): Promise<Progress | null> {
  const r = await db.query<ProgressRow>(`SELECT * FROM progress WHERE issue_id = ?`, [issueId])
  return r.length ? toProgress(r[0]) : null
}

/** most recently read first (Library "Continue reading" shelf) */
export async function recentProgress(db: Db, limit = 12): Promise<Progress[]> {
  const r = await db.query<ProgressRow>(`SELECT * FROM progress ORDER BY updated_at DESC LIMIT ?`, [limit])
  return r.map(toProgress)
}
