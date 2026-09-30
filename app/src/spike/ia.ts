// Internet Archive access for reader B: IIIF manifest (page list + sizes) and djvu.xml OCR.
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
  const r = await fetch(`https://iiif.archive.org/iiif/3/${ident}/manifest.json`)
  if (!r.ok) throw new Error(`manifest HTTP ${r.status}`)
  const text = await r.text()
  metrics.addBytes(text.length)
  const m = JSON.parse(text) as IiifManifest
  return m.items.map((c) => ({ w: c.width, h: c.height, svc: c.items[0].items[0].body.service[0].id }))
}

export function iiifUrl(p: PageInfo, width: number): string {
  const w = Math.min(width, p.w)
  return w >= p.w ? `${p.svc}/full/max/0/default.jpg` : `${p.svc}/full/${w},/0/default.jpg`
}

/** Download `<id>_djvu.xml` and parse it off the main thread. */
export async function loadOcr(ident: string): Promise<OcrPage[]> {
  const t0 = performance.now()
  const xml = await getDownloadText(ident, `${ident}_djvu.xml`)
  const t1 = performance.now()
  const worker = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' })
  const pages = await new Promise<OcrPage[]>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<OcrPage[]>) => resolve(e.data)
    worker.onerror = (e) => reject(new Error(e.message))
    worker.postMessage(xml)
  })
  worker.terminate()
  metrics.set('ocr download', `${((t1 - t0) / 1000).toFixed(1)} s, ${(xml.length / 1e6).toFixed(1)} MB`)
  metrics.set('ocr parse', `${Math.round(performance.now() - t1)} ms`)
  return pages
}
