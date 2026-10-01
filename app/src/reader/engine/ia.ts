// Internet Archive access for the reader: IIIF manifest (page list + sizes) and djvu.xml OCR.
// Lookup order: downloaded files (Phase 5) → disk cache → network. The same fetchers fill downloads.
import { readCache, writeCache } from './diskCache'
import { getDownloadText } from './http'
import { metrics } from './metrics'
import type { OcrPage } from './ocrTypes'

export interface PageInfo {
  w: number
  h: number
  /** IIIF image service id */
  svc: string
}

/** Files of a downloaded (or partly downloaded) issue: `manifest.json`, `ocr.json`, `p<leaf>.jpg`, `t<leaf>.jpg`. */
export interface LocalFiles {
  has(file: string): boolean
  /** URL usable by fetch / <img> */
  url(file: string): string
  readJson<T>(file: string): Promise<T | null>
}

export const pageFile = (leaf: number) => `p${leaf}.jpg`
export const thumbFile = (leaf: number) => `t${leaf}.jpg`

interface IiifManifest {
  items: { width: number; height: number; items: { items: { body: { service: { id: string }[] } }[] }[] }[]
}

export async function fetchManifest(ident: string): Promise<PageInfo[]> {
  const r = await fetch(`https://iiif.archive.org/iiif/3/${ident}/manifest.json`)
  if (!r.ok) throw new Error(`manifest HTTP ${r.status}`)
  const text = await r.text()
  metrics.addBytes(text.length)
  const m = JSON.parse(text) as IiifManifest
  return m.items.map((c) => ({ w: c.width, h: c.height, svc: c.items[0].items[0].body.service[0].id }))
}

export async function loadManifest(ident: string, local?: LocalFiles | null): Promise<PageInfo[]> {
  const t = performance.now()
  const own = local?.has('manifest.json') ? await local.readJson<PageInfo[]>('manifest.json') : null
  if (own?.length) {
    metrics.set('manifest', `downloaded, ${own.length} pages`)
    return own
  }
  const key = `manifest-${ident}`
  const cached = await readCache<PageInfo[]>(key)
  if (cached?.length) {
    metrics.set('manifest', `cached, ${cached.length} pages`)
    return cached
  }
  const pages = await fetchManifest(ident)
  metrics.set('manifest', `${Math.round(performance.now() - t)} ms, ${pages.length} pages`)
  void writeCache(key, pages)
  return pages
}

export function iiifUrl(p: PageInfo, width: number): string {
  const w = Math.min(width, p.w)
  return w >= p.w ? `${p.svc}/full/max/0/default.jpg` : `${p.svc}/full/${w},/0/default.jpg`
}

/** compact on-disk form: per page [w, h, [[text, x0, y0, x1, y1, line], …]] (≈40 % of djvu.xml) */
export type CompactOcr = [number, number, [string, number, number, number, number, number][]][]
const r4 = (x: number) => Math.round(x * 1e4) / 1e4

const expand = (c: CompactOcr): OcrPage[] =>
  c.map(([w, h, ws]) => ({ w, h, words: ws.map(([t, x0, y0, x1, y1, line]) => ({ t, x0, y0, x1, y1, line })) }))
const compact = (pages: OcrPage[]): CompactOcr =>
  pages.map((p) => [p.w, p.h, p.words.map((w) => [w.t, r4(w.x0), r4(w.y0), r4(w.x1), r4(w.y1), w.line])])

/** Download `<id>_djvu.xml` and parse it off the main thread. */
export async function fetchOcr(ident: string): Promise<CompactOcr> {
  const t0 = performance.now()
  const xml = await getDownloadText(ident, `${ident}_djvu.xml`)
  const t1 = performance.now()
  const worker = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' })
  const pages = await new Promise<OcrPage[]>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<OcrPage[]>) => resolve(e.data)
    worker.onerror = (e) => reject(new Error(e.message))
    worker.postMessage(xml)
  }).finally(() => worker.terminate())
  metrics.set('ocr', `download ${((t1 - t0) / 1000).toFixed(1)} s (${(xml.length / 1e6).toFixed(1)} MB), parse ${Math.round(performance.now() - t1)} ms`)
  return compact(pages)
}

/** OCR for an issue: downloaded copy, else the disk cache, else the network. */
export async function loadOcr(ident: string, local?: LocalFiles | null): Promise<OcrPage[]> {
  const t0 = performance.now()
  const own = local?.has('ocr.json') ? await local.readJson<CompactOcr>('ocr.json') : null
  if (own?.length) {
    metrics.set('ocr', `downloaded, ${Math.round(performance.now() - t0)} ms`)
    return expand(own)
  }
  const key = `ocr-${ident}`
  const cached = await readCache<CompactOcr>(key)
  if (cached?.length) {
    metrics.set('ocr', `cached, ${Math.round(performance.now() - t0)} ms`)
    return expand(cached)
  }
  const fresh = await fetchOcr(ident)
  void writeCache(key, fresh)
  return expand(fresh)
}
