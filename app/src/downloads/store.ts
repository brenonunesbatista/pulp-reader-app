// Where downloaded issues live. Android: app data dir (`files/downloads/<ident>/`, not the cache dir, so the system
// never evicts it), written by the native downloader straight to disk and read back through the WebView file URL.
// Browser dev / tests: in memory (object URLs).
import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { USER_AGENT } from '../reader/engine/config'
import type { LocalFiles } from '../reader/engine/ia'

export interface DownloadStore {
  /** file name → size (complete files only) */
  list(ident: string): Promise<Map<string, number>>
  /** fetch `url` into `<ident>/<file>`; returns its size in bytes */
  download(url: string, ident: string, file: string): Promise<number>
  writeJson(ident: string, file: string, value: unknown): Promise<number>
  /** null when nothing of this issue is stored */
  local(ident: string): Promise<LocalFiles | null>
  remove(ident: string): Promise<void>
  removeAll(): Promise<void>
}

const ROOT = 'downloads'
const DIR = Directory.Data
const dirOf = (ident: string) => `${ROOT}/${ident}`

class NativeStore implements DownloadStore {
  private made = new Set<string>()

  async list(ident: string) {
    try {
      const r = await Filesystem.readdir({ path: dirOf(ident), directory: DIR })
      return new Map(r.files.filter((f) => !f.name.endsWith('.part')).map((f) => [f.name, f.size ?? 0]))
    } catch {
      return new Map<string, number>()
    }
  }

  private async mkdir(ident: string) {
    if (this.made.has(ident)) return
    try {
      await Filesystem.mkdir({ path: dirOf(ident), directory: DIR, recursive: true })
    } catch {
      /* already exists */
    }
    this.made.add(ident)
  }

  async download(url: string, ident: string, file: string) {
    await this.mkdir(ident)
    // write to .part and rename: a download cut by an app kill never looks complete
    const part = `${dirOf(ident)}/${file}.part`
    const path = `${dirOf(ident)}/${file}`
    await Filesystem.downloadFile({ url, path: part, directory: DIR, headers: { 'User-Agent': USER_AGENT },
      connectTimeout: 15000, readTimeout: 30000 })
    await Filesystem.rename({ from: part, to: path, directory: DIR, toDirectory: DIR })
    return (await Filesystem.stat({ path, directory: DIR })).size
  }

  async writeJson(ident: string, file: string, value: unknown) {
    await this.mkdir(ident)
    const data = JSON.stringify(value)
    await Filesystem.writeFile({ path: `${dirOf(ident)}/${file}`, directory: DIR, encoding: Encoding.UTF8, data })
    return data.length
  }

  async local(ident: string): Promise<LocalFiles | null> {
    const files = await this.list(ident)
    if (!files.size) return null
    const { uri } = await Filesystem.getUri({ path: dirOf(ident), directory: DIR })
    const base = Capacitor.convertFileSrc(uri)
    return {
      has: (f) => files.has(f),
      url: (f) => `${base}/${f}`,
      readJson: async <T,>(f: string) => {
        try {
          const r = await Filesystem.readFile({ path: `${dirOf(ident)}/${f}`, directory: DIR, encoding: Encoding.UTF8 })
          return JSON.parse(r.data as string) as T
        } catch {
          return null
        }
      },
    }
  }

  async remove(ident: string) {
    this.made.delete(ident)
    try {
      await Filesystem.rmdir({ path: dirOf(ident), directory: DIR, recursive: true })
    } catch {
      /* not there */
    }
  }

  async removeAll() {
    this.made.clear()
    try {
      await Filesystem.rmdir({ path: ROOT, directory: DIR, recursive: true })
    } catch {
      /* nothing downloaded */
    }
  }
}

/** In-memory store (browser dev, tests). `fetchBlob` is injectable for tests. */
export class MemoryStore implements DownloadStore {
  files = new Map<string, Map<string, Blob | string>>()
  private fetchBlob: (url: string) => Promise<Blob>

  constructor(fetchBlob?: (url: string) => Promise<Blob>) {
    this.fetchBlob = fetchBlob ?? (async (url) => {
      const r = await fetch(url)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.blob()
    })
  }

  private dir(ident: string) {
    let d = this.files.get(ident)
    if (!d) this.files.set(ident, (d = new Map()))
    return d
  }

  async list(ident: string) {
    const d = this.files.get(ident)
    return new Map([...(d ?? [])].map(([k, v]) => [k, typeof v === 'string' ? v.length : v.size]))
  }

  async download(url: string, ident: string, file: string) {
    const b = await this.fetchBlob(url)
    this.dir(ident).set(file, b)
    return b.size
  }

  async writeJson(ident: string, file: string, value: unknown) {
    const s = JSON.stringify(value)
    this.dir(ident).set(file, s)
    return s.length
  }

  async local(ident: string): Promise<LocalFiles | null> {
    const d = this.files.get(ident)
    if (!d?.size) return null
    const urls = new Map<string, string>()
    return {
      has: (f) => d.has(f),
      url: (f) => {
        let u = urls.get(f)
        const v = d.get(f)
        if (!u && v instanceof Blob) urls.set(f, (u = URL.createObjectURL(v)))
        return u ?? ''
      },
      readJson: async <T,>(f: string) => {
        const v = d.get(f)
        return typeof v === 'string' ? (JSON.parse(v) as T) : null
      },
    }
  }

  async remove(ident: string) {
    this.files.delete(ident)
  }

  async removeAll() {
    this.files.clear()
  }
}

let store: DownloadStore | null = null
export function getStore(): DownloadStore {
  return (store ??= Capacitor.isNativePlatform() ? new NativeStore() : new MemoryStore())
}
