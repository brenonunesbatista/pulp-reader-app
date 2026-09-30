// sqlite-wasm backend: desktop browser dev (`npm run dev`) and unit tests (Node). Not used on Android.
import sqlite3InitModule from '@sqlite.org/sqlite-wasm'
import type { Db, SqlParam } from './types'

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>
type OoDb = InstanceType<Sqlite3['oo1']['DB']>

let sqlite3: Promise<Sqlite3> | null = null
export function initSqlite(): Promise<Sqlite3> {
  sqlite3 ??= sqlite3InitModule()
  return sqlite3
}

class WasmDb implements Db {
  private db: OoDb
  constructor(db: OoDb) {
    this.db = db
  }

  async query<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    return this.db.selectObjects(sql, params) as T[]
  }

  async run(sql: string, params: SqlParam[] = []): Promise<void> {
    this.db.exec(sql, { bind: params })
  }

  async exec(sql: string): Promise<void> {
    this.db.exec(sql)
  }
}

/** Empty in-memory database. */
export async function memoryDb(): Promise<Db> {
  const s = await initSqlite()
  return new WasmDb(new s.oo1.DB(':memory:', 'c'))
}

/** In-memory database loaded from a SQLite file image. */
export async function dbFromBytes(bytes: Uint8Array): Promise<Db> {
  const s = await initSqlite()
  const db = new s.oo1.DB(':memory:', 'c')
  const p = s.wasm.allocFromTypedArray(bytes)
  const rc = s.capi.sqlite3_deserialize(db.pointer!, 'main', p, bytes.byteLength, bytes.byteLength,
    s.capi.SQLITE_DESERIALIZE_FREEONCLOSE | s.capi.SQLITE_DESERIALIZE_RESIZEABLE)
  db.checkRc(rc)
  return new WasmDb(db)
}
