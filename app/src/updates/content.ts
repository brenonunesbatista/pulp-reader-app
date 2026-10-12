// Content updates over the air (Phase 12): the Atlas and the magazine descriptions live in atlas.db, which
// tools/publish_content.py publishes to the repo's updates/ folder with a manifest. The app installs a newer one
// (checked size + sha256) without a new APK; catalog.db and user.db are never touched.
import type { Db } from '../db/types'

export const UPDATES_URL = 'https://raw.githubusercontent.com/brenonunesbatista/pulp-reader-app/main/updates/'
/** atlas.db schema this app reads (tools/atlas/build_atlas.py SCHEMA_VERSION) */
export const ATLAS_SCHEMA = 2

export interface AtlasRelease {
  version: number // commit time of the content (Unix seconds)
  schema: number
  url: string // relative to the manifest
  size: number
  sha256: string
  entities: number
  paths: number
  magazines: number
  published: string
}

export interface ContentManifest {
  format: number
  atlas?: AtlasRelease
}

/** the release to install, if the manifest has a newer atlas.db this app can read */
export function pickUpdate(m: ContentManifest, installedVersion: number, schema = ATLAS_SCHEMA): AtlasRelease | null {
  const a = m.format === 1 ? m.atlas : undefined
  if (!a || a.schema !== schema || !(a.version > installedVersion)) return null
  return a
}

export async function installedVersion(atlas: Db): Promise<number> {
  try {
    const r = await atlas.query<{ value: string }>(`SELECT value FROM atlas_meta WHERE key = 'content_version'`)
    return Number(r[0]?.value ?? 0) || 0
  } catch {
    return 0
  }
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function fetchManifest(base = UPDATES_URL, f: typeof fetch = fetch): Promise<ContentManifest> {
  const r = await f(`${base}manifest.json?t=${Date.now()}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(`manifest HTTP ${r.status}`)
  return (await r.json()) as ContentManifest
}

/** download a release and check it is the file the manifest describes */
export async function downloadRelease(a: AtlasRelease, base = UPDATES_URL, f: typeof fetch = fetch): Promise<Uint8Array> {
  const r = await f(new URL(a.url, base).href + `?v=${a.version}`, { cache: 'no-store' })
  if (!r.ok) throw new Error(`atlas.db HTTP ${r.status}`)
  const bytes = new Uint8Array(await r.arrayBuffer())
  if (bytes.byteLength !== a.size) throw new Error(`atlas.db is ${bytes.byteLength} bytes, expected ${a.size}`)
  if ((await sha256Hex(bytes)) !== a.sha256) throw new Error('atlas.db checksum does not match the manifest')
  return bytes
}
