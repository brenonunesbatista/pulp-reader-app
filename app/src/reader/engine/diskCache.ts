// Small JSON cache on disk (app cache dir) for per-issue data that is expensive to fetch: IIIF manifests and parsed
// OCR. Android may clear the cache dir under storage pressure; everything here can be re-downloaded.
// Browser dev: in-memory only.
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'

const memory = new Map<string, unknown>()
const native = Capacitor.isNativePlatform()

const pathFor = (key: string) => `banca/${key.replace(/[^A-Za-z0-9._-]+/g, '_')}.json`

export async function readCache<T>(key: string): Promise<T | null> {
  if (!native) return (memory.get(key) as T) ?? null
  try {
    const r = await Filesystem.readFile({ path: pathFor(key), directory: Directory.Cache, encoding: Encoding.UTF8 })
    return JSON.parse(r.data as string) as T
  } catch {
    return null // missing or unreadable → caller re-downloads
  }
}

export async function writeCache(key: string, value: unknown): Promise<void> {
  if (!native) {
    memory.set(key, value)
    return
  }
  try {
    await Filesystem.writeFile({ path: pathFor(key), directory: Directory.Cache, encoding: Encoding.UTF8,
      data: JSON.stringify(value), recursive: true })
  } catch (e) {
    console.warn('[cache] write failed', key, e)
  }
}

/** bytes used by the cache (manifests + OCR of issues opened online) */
export async function cacheSize(): Promise<number> {
  if (!native) return [...memory.values()].reduce<number>((n, v) => n + JSON.stringify(v).length, 0)
  try {
    const r = await Filesystem.readdir({ path: 'banca', directory: Directory.Cache })
    return r.files.reduce((n, f) => n + (f.size ?? 0), 0)
  } catch {
    return 0
  }
}

export async function clearCache(): Promise<void> {
  memory.clear()
  if (!native) return
  try {
    await Filesystem.rmdir({ path: 'banca', directory: Directory.Cache, recursive: true })
  } catch {
    /* nothing cached yet */
  }
}
