/** Minimal async SQL interface shared by the native (Android) and web/test (sqlite-wasm) backends. */
export type SqlParam = string | number | null
export type Row = Record<string, unknown>

export interface Db {
  query<T = Row>(sql: string, params?: SqlParam[]): Promise<T[]>
  run(sql: string, params?: SqlParam[]): Promise<void>
  /** several statements, no params (schema/migrations) */
  exec(sql: string): Promise<void>
}

export interface Databases {
  catalog: Db // read-only, replaced when the app ships a new catalog
  atlas: Db // read-only curated Atlas content (tools/atlas), replaced with the catalog
  user: Db // progress/highlights/downloads/settings — never overwritten by catalog updates
}
