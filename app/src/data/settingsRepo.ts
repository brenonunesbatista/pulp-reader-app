// Key/value app settings in user.db (`settings` table).
import type { Db } from '../db/types'

export type AppTheme = 'paper' | 'night'
export type ReaderTheme = 'paper' | 'sepia' | 'night'

export interface Settings {
  theme: AppTheme
  readerTheme: ReaderTheme
  brightness: number | null // 0..1, null = system brightness
  warmth: number // 0..1 warm overlay strength
  enhance: boolean
  perfOverlay: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'paper', readerTheme: 'paper', brightness: null, warmth: 0, enhance: false, perfOverlay: false,
}

export async function loadSettings(db: Db): Promise<Settings> {
  const rows = await db.query<{ key: string; value: string }>(`SELECT key, value FROM settings`)
  const s: Settings = { ...DEFAULT_SETTINGS }
  for (const { key, value } of rows) {
    if (key in s) {
      try {
        ;(s as unknown as Record<string, unknown>)[key] = JSON.parse(value)
      } catch {
        /* ignore malformed values: keep the default */
      }
    }
  }
  return s
}

export async function saveSetting<K extends keyof Settings>(db: Db, key: K, value: Settings[K]): Promise<void> {
  await db.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [key, JSON.stringify(value)])
}
