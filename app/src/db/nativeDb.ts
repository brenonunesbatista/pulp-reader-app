// Android backend: @capacitor-community/sqlite. The prebuilt catalog.db and atlas.db ship in public/assets/databases/
// (copied there by scripts/copy-databases.mjs, which also writes public/catalog/databases.sha256). They are installed
// into the app's database dir on first run, and again only when the shipped sha differs from the installed one
// (remembered in user.db settings) — content updates never touch user.db tables.
import { CapacitorSQLite, SQLiteConnection, type SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { Db, SqlParam } from './types'
import { migrateUserDb } from './userSchema'

class NativeDb implements Db {
  private conn: SQLiteDBConnection
  constructor(conn: SQLiteDBConnection) {
    this.conn = conn
  }

  async query<T>(sql: string, params: SqlParam[] = []): Promise<T[]> {
    const r = await this.conn.query(sql, params as never[])
    return (r.values ?? []) as T[]
  }

  async run(sql: string, params: SqlParam[] = []): Promise<void> {
    await this.conn.run(sql, params as never[], false)
  }

  async exec(sql: string): Promise<void> {
    await this.conn.execute(sql, false)
  }
}

const sqlite = new SQLiteConnection(CapacitorSQLite)

async function connect(name: string, readonly: boolean): Promise<SQLiteDBConnection> {
  const existing = (await sqlite.isConnection(name, readonly)).result
  const conn = existing ? await sqlite.retrieveConnection(name, readonly)
    : await sqlite.createConnection(name, false, 'no-encryption', 1, readonly)
  if (!(await conn.isDBOpen()).result) await conn.open()
  return conn
}

async function shippedSha(): Promise<string> {
  const r = await fetch('/catalog/databases.sha256')
  if (!r.ok) throw new Error('databases.sha256 missing from the app bundle')
  return (await r.text()).trim()
}

export async function openNative(): Promise<{ catalog: Db; atlas: Db; user: Db; info: string }> {
  const t0 = performance.now()
  const user = new NativeDb(await connect('user', false))
  await migrateUserDb(user)
  const shipped = await shippedSha()
  const installed = (await user.query<{ value: string }>("SELECT value FROM settings WHERE key = 'databases_sha256'"))[0]?.value
  const present = (await sqlite.isDatabase('catalog')).result && (await sqlite.isDatabase('atlas')).result
  const install = !present || installed !== shipped
  if (install) {
    await sqlite.copyFromAssets(true)
    await user.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('databases_sha256', ?)", [shipped])
  }
  const catalog = new NativeDb(await connect('catalog', true))
  const atlas = new NativeDb(await connect('atlas', true))
  return { catalog, atlas, user, info: `${install ? 'databases installed' : 'databases ready'} in ${Math.round(performance.now() - t0)} ms` }
}

function base64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Replace atlas.db with a downloaded (already verified) copy: write it to files/updates/, close the atlas
 *  connection, move it over atlasSQLite.db (the plugin's moveDatabasesAndAddSuffix, a rename) and reopen. When the
 *  new file does not open as an Atlas, the shipped databases are reinstalled. */
export async function installNativeAtlas(bytes: Uint8Array): Promise<Db> {
  const { Directory, Filesystem } = await import('@capacitor/filesystem')
  await Filesystem.writeFile({ path: 'updates/atlas.db', data: base64(bytes), directory: Directory.Data, recursive: true })
  if ((await sqlite.isConnection('atlas', true)).result) await sqlite.closeConnection('atlas', true)
  await sqlite.moveDatabasesAndAddSuffix('files/updates', ['atlas.db'])
  const atlas = new NativeDb(await connect('atlas', true))
  try {
    await atlas.query(`SELECT value FROM atlas_meta WHERE key = 'content_version'`)
    return atlas
  } catch (e) {
    await sqlite.closeConnection('atlas', true)
    await sqlite.copyFromAssets(true)
    throw e
  }
}
