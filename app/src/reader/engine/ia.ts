// Internet Archive access for the reader: IIIF manifest (page list + sizes) and djvu.xml OCR, both cached on disk.
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

interface IiifManifest {
  items: { width: number; height: number; items: { items: { body: { service: { id: string }[] } }[] }[] }[]
}

export async function loadManifest(ident: string): Promise<PageInfo[]> {
  const key = `manifest-${ident}`
  const cached = await readCache<PageInfo[]>(key)
  if (cached?.length) {
    metrics.set('manifest', `cached, ${cached.length} pages`)
    return cached
  }
  const t = performance.now()
  const r = await fetch(`https://iiif.archive.org/iiif/3/${ident}/manifest.json`)
  if (!r.ok) throw new Error(`manifest HTTP ${r.status}`)
  const text = await r.text()
  metrics.addBytes(text.length)
  const m = JSON.parse(text) as IiifManifest
  const pages = m.items.map((c) => ({ w: c.width, h: c.height, svc: c.items[0].items[0].body.service[0].id }))
  metrics.set('manifest', `${Math.round(performance.now() - t)} ms, ${pages.length} pages`)
  void writeCache(key, pages)
  return pages
}

export function iiifUrl(p: PageInfo, width: number): string {
  const w = Math.min(width, p.w)
  return w >= p.w ? `${p.svc}/full/max/0/default.jpg` : `${p.svc}/full/${w},/0/default.jpg`
}

/** compact on-disk form: per page [w, h, [[text, x0, y0, x1, y1, line], …]] (≈40 % of djvu.xml) */
type CompactPage = [number, number, [string, number, number, number, number, number][]]
const r4 = (x: number) => Math.round(x * 1e4) / 1e4

/** OCR for an issue: from the disk cache, else download `<id>_djvu.xml` and parse it off the main thread. */
export async function loadOcr(ident: string): Promise<OcrPage[]> {
  const key = `ocr-${ident}`
  const t0 = performance.now()
  const cached = await readCache<CompactPage[]>(key)
  if (cached?.length) {
    const pages = cached.map(([w, h, ws]) => ({ w, h, words: ws.map(([t, x0, y0, x1, y1, line]) => ({ t, x0, y0, x1, y1, line })) }))
    metrics.set('ocr', `cached, ${Math.round(performance.now() - t0)} ms`)
    return pages
  }
  const xml = await getDownloadText(ident, `${ident}_djvu.xml`)
  const t1 = performance.now()
  const worker = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' })
  const pages = await new Promise<OcrPage[]>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<OcrPage[]>) => resolve(e.data)
    worker.onerror = (e) => reject(new Error(e.message))
    worker.postMessage(xml)
  })
  worker.terminate()
  metrics.set('ocr', `download ${((t1 - t0) / 1000).toFixed(1)} s (${(xml.length / 1e6).toFixed(1)} MB), parse ${Math.round(performance.now() - t1)} ms`)
  void writeCache(key, pages.map((p): CompactPage => [p.w, p.h, p.words.map((w) => [w.t, r4(w.x0), r4(w.y0), r4(w.x1), r4(w.y1), w.line])]))
  return pages
}
