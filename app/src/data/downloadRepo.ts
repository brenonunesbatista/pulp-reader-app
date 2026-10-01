// Download bookkeeping (user.db `download`). The files themselves live in app storage (downloads/store.ts).
import type { Db } from '../db/types'
import type { DownloadInfo, DownloadState } from './models'

interface DownloadRow {
  issue_id: number; ia_identifier: string | null; state: DownloadState | 'none'; bytes: number; pages_done: number
  pages_total: number; updated_at: number; error: string | null
}

export async function listDownloads(db: Db): Promise<DownloadInfo[]> {
  const rows = await db.query<DownloadRow>(
    `SELECT * FROM download WHERE state != 'none' AND ia_identifier IS NOT NULL ORDER BY updated_at DESC`)
  return rows.map((r) => ({
    issueId: r.issue_id, ident: r.ia_identifier!, state: r.state as DownloadState, bytes: r.bytes, pagesDone: r.pages_done,
    pagesTotal: r.pages_total, updatedAt: r.updated_at, error: r.error,
  }))
}

export async function saveDownload(db: Db, d: DownloadInfo): Promise<void> {
  await db.run(
    `INSERT OR REPLACE INTO download (issue_id, ia_identifier, state, bytes, pages_done, pages_total, updated_at, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.issueId, d.ident, d.state, d.bytes, d.pagesDone, d.pagesTotal, d.updatedAt, d.error])
}

export async function deleteDownload(db: Db, issueId: number): Promise<void> {
  await db.run(`DELETE FROM download WHERE issue_id = ?`, [issueId])
}

export async function deleteAllDownloads(db: Db): Promise<void> {
  await db.run(`DELETE FROM download`)
}
