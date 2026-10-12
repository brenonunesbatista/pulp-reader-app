// Internet Archive access for the reader: IIIF manifest (page list + sizes) and djvu.xml OCR.
// Lookup order: downloaded files (Phase 5) → disk cache → network. The same fetchers fill downloads.
import { readCache, writeCache } from './diskCache'
import { getDownloadText } from './http'
import { packPageSvc, scanParts, sizedImageUrl } from './scan'
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

/** pages of a pack issue from its `<stem>_scandata.xml` (pages not added to access formats are skipped, as in IIIF) */
export function parseScandata(xml: string, item: string, stem: string): PageInfo[] {
  const out: PageInfo[] = []
  for (const m of xml.matchAll(/<page leafNum="(\d+)">([\s\S]*?)<\/page>/g)) {
    const body = m[2]
    if (/<addToAccessFormats>false<\/addToAccessFormats>/.test(body)) continue
    const num = (tag: string) => Number(new RegExp(`<${tag}>(\\d+)</${tag}>`).exec(body)?.[1] ?? 0)
    const crop = /<cropBox>([\s\S]*?)<\/cropBox>/.exec(body)?.[1] ?? ''
    const cw = Number(/<w>(\d+)<\/w>/.exec(crop)?.[1] ?? 0)
    const ch = Number(/<h>(\d+)<\/h>/.exec(crop)?.[1] ?? 0)
    out.push({ w: cw || num('origWidth'), h: ch || num('origHeight'), svc: packPageSvc(item, stem, Number(m[1]), out.length) })
  }
  return out
}

const itemFileNames = new Map<string, Promise<string[]>>()

/** names of an item's files (metadata API, CORS-enabled; once per item per session) */
function itemFiles(item: string): Promise<string[]> {
  let p = itemFileNames.get(item)
  if (!p) {
    p = fetch(`https://archive.org/metadata/${encodeURIComponent(item)}/files`)
      .then((r) => (r.ok ? r.json() : { result: [] }))
      .then((j: { result?: { name: string }[] }) => (j.result ?? []).map((f) => f.name))
    itemFileNames.set(item, p)
  }
  return p
}

/** The stem of a plain item's derived files. Usually the identifier, but uploads keep their own file name
 *  ("Whiz Comics 002 (1940-02)_djvu.xml" in item fawcett_Whiz_Comics_002_1940-02): then the item's single file with
 *  that suffix names it. */
async function stemFor(ident: string, suffix: string): Promise<string> {
  const s = scanParts(ident)
  if (s.pack) return s.stem
  const names = await itemFiles(ident).catch(() => [] as string[])
  if (!names.length || names.includes(ident + suffix)) return ident
  const own = names.filter((n) => n.endsWith(suffix))
  return own.length === 1 ? own[0].slice(0, -suffix.length) : ident
}

async function fromScandata(item: string, stem: string): Promise<PageInfo[]> {
  if (item === stem) stem = await stemFor(item, '_scandata.xml')
  const pages = parseScandata(await getDownloadText(item, `${stem}_scandata.xml`), item, stem)
  if (!pages.length) throw new Error('no pages in scandata')
  return pages
}

/** IIIF manifest (2 tries on server errors) */
async function fromIiif(ident: string): Promise<PageInfo[]> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`https://iiif.archive.org/iiif/3/${ident}/manifest.json`)
    if (r.ok) {
      const text = await r.text()
      metrics.addBytes(text.length)
      const m = JSON.parse(text) as IiifManifest
      return m.items.map((c) => ({ w: c.width, h: c.height, svc: c.items[0].items[0].body.service[0].id }))
    }
    if (r.status < 500 || attempt >= 1) throw new Error(`manifest HTTP ${r.status}`)
    await new Promise((res) => setTimeout(res, 1500))
  }
}

/** Page list of a scan: pack issues from their scandata; plain items from the IIIF manifest, falling back to the
 *  item's own scandata when the manifest service fails (it answers 500 for some items while the files are fine) */
export async function fetchManifest(ident: string): Promise<PageInfo[]> {
  const s = scanParts(ident)
  if (s.pack) return fromScandata(s.item, s.stem)
  try {
    return await fromIiif(ident)
  } catch (e) {
    try {
      return await fromScandata(ident, ident)
    } catch {
      throw e
    }
  }
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

/** page image `width` px wide: IIIF, or the BookReader page URL of a pack issue IIIF cannot serve (engine/scan.ts) */
export function iiifUrl(p: PageInfo, width: number): string {
  return sizedImageUrl(p.svc, width, p.w)
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
  const { item, stem } = scanParts(ident)
  let xml: string
  try {
    xml = await getDownloadText(item, `${stem}_djvu.xml`)
  } catch (e) {
    // the OCR file may carry the uploaded file's name instead of the identifier
    const real = /HTTP 404/.test(String(e)) ? await stemFor(ident, '_djvu.xml') : stem
    if (real === stem) throw e
    xml = await getDownloadText(item, `${real}_djvu.xml`)
  }
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
