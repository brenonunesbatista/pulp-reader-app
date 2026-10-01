// Reader engine: IIIF page images + invisible OCR text layer, one page or a two-page spread per "unit".
// Owns the page DOM (no React state per frame); React only renders the chrome around it.
import type { Rect } from '../data/annotationRepo'
import { getStore } from '../downloads/store'
import { DECODE_AHEAD, DECODE_BEHIND, FETCH_AHEAD, LOW_WIDTH, SHARP_WIDTH } from './engine/config'
import { iiifUrl, loadManifest, loadOcr, pageFile, thumbFile, type LocalFiles, type PageInfo } from './engine/ia'
import { ImageLoader } from './engine/imageLoader'
import { metrics } from './engine/metrics'
import type { OcrPage } from './engine/ocrTypes'
import { PanZoom } from './engine/panzoom'
import { buildTextLayer, selectedWordIndices, wordsToRects } from './engine/textLayer'
import { buildUnits, unitOfLeaf, type Unit } from './layout'

type Kind = 'low' | 'high' | 'max'
interface Slots { low?: HTMLImageElement; high?: HTMLImageElement; max?: HTMLImageElement }
interface PageSlot { leaf: number; root: HTMLDivElement; img: HTMLDivElement; hl: HTMLDivElement; text: HTMLDivElement; cssW: number }

export interface DrawnHighlight { id: number; page: number; rects: Rect[]; color: string; note: boolean }
export interface View { zoom: number; cx: number; cy: number }

export interface ReaderEvents {
  /** `local` = how many pages are on the device (downloaded) */
  onReady: (pages: PageInfo[], local: number) => void
  onUnit: (leaves: number[]) => void
  onOcr: (pages: OcrPage[]) => void
  onCenterTap: () => void
  /** a tap landed on a highlight */
  onHighlightTap: (id: number) => void
  onView: () => void
  onError: (message: string) => void
}

export class ReaderController {
  pages: PageInfo[] = []
  private units: Unit[] = []
  private unit = -1
  private spread = false
  private ocr: OcrPage[] | null = null
  private local: LocalFiles | null = null
  private loader = new ImageLoader()
  private decoded = new Map<number, Slots>()
  private loading = new Set<string>()
  private slots: PageSlot[] = []
  private pz: PanZoom
  private openedAt = performance.now()
  private firstPaint = false
  private unitPainted = false
  private textTimer = 0
  private highlights: DrawnHighlight[] = []
  private destroyed = false
  debugText = false
  private content: HTMLElement
  private ident: string
  private ev: ReaderEvents

  constructor(viewport: HTMLElement, content: HTMLElement, ident: string, ev: ReaderEvents) {
    this.content = content
    this.ident = ident
    this.ev = ev
    this.pz = new PanZoom(viewport, content, {
      onTurn: (d) => this.go(this.unit + d),
      onCenterTap: () => ev.onCenterTap(),
      onTapAt: (p) => {
        const id = this.highlightAt(p.x, p.y)
        if (id === null) return false
        ev.onHighlightTap(id)
        return true
      },
      onZoomSettled: (s) => this.onZoom(s),
      onViewChange: () => ev.onView(),
      isSelecting: () => !(document.getSelection()?.isCollapsed ?? true),
    })
  }

  async init(startLeaf: number, opts: { spread: boolean; fitWidth: boolean; view?: View }) {
    metrics.reset()
    try {
      // downloaded files (Phase 5) replace the network for page images, thumbnails, manifest and OCR
      this.local = await getStore().local(this.ident).catch(() => null)
      this.pages = await loadManifest(this.ident, this.local)
      if (this.destroyed) return
      this.spread = opts.spread
      this.pz.fitWidth = opts.fitWidth
      this.units = buildUnits(this.pages.length, this.spread)
      this.ev.onReady(this.pages, this.local ? this.pages.filter((_, l) => this.local!.has(pageFile(l))).length : 0)
      // guide leaves can point past the end of a scan (docs/archive-findings.md §5)
      this.go(unitOfLeaf(this.units, Math.max(0, Math.min(startLeaf, this.pages.length - 1))))
      if (opts.view && opts.view.zoom > 1.01) this.pz.setView(opts.view)
      this.ocr = await loadOcr(this.ident, this.local)
      if (this.destroyed) return
      this.ev.onOcr(this.ocr)
      this.scheduleText()
    } catch (e) {
      if (!this.destroyed) this.ev.onError(String(e))
    }
  }

  destroy() {
    this.destroyed = true
    this.pz.destroy()
    for (const s of this.decoded.values()) this.releaseSlots(s)
    this.decoded.clear()
    this.loader.retain(new Map())
    window.clearTimeout(this.textTimer)
  }

  get pageCount() { return this.pages.length }
  get leaves(): number[] { return this.units[this.unit] ?? [] }
  get zoom() { return this.pz.scale }
  getView(): View { return this.pz.getView() }

  /** Screen size/orientation changed: switch single pages ↔ spreads and rebuild the page DOM (text layer positions
   *  depend on the fitted size), staying on the same leaf. */
  setLayout(spread: boolean, fitWidth: boolean) {
    this.pz.fitWidth = fitWidth
    if (!this.pages.length) return
    const leaf = this.leaves[0] ?? 0
    this.spread = spread
    this.units = buildUnits(this.pages.length, spread)
    this.unit = -1
    this.go(unitOfLeaf(this.units, leaf))
  }

  goLeaf(leaf: number) {
    if (!this.units.length) return
    const u = unitOfLeaf(this.units, Math.max(0, Math.min(leaf, this.pages.length - 1)))
    if (u !== this.unit) this.go(u)
  }

  /** page-turn buttons: same as a gesture turn (zoom is kept when zoomed) */
  turn(dir: -1 | 1) { this.pz.turn(dir) }

  private go(u: number) {
    if (u < 0 || u >= this.units.length || u === this.unit) return
    const leaves = this.units[u]
    metrics.turnBegin(leaves.every((l) => this.decoded.get(l)?.low || this.decoded.get(l)?.high))
    this.unit = u
    this.unitPainted = false
    // common height; widths scaled to it, so both pages of a spread line up
    const h = Math.max(...leaves.map((l) => this.pages[l].h))
    const widths = leaves.map((l) => (this.pages[l].w * h) / this.pages[l].h)
    const total = widths.reduce((a, b) => a + b, 0)
    this.pz.setPage(total, h)
    const fit = this.pz.fitSize
    let left = 0
    this.slots = leaves.map((leaf, i) => {
      const root = document.createElement('div')
      root.className = 'pg'
      root.style.cssText = `left:${(left / total) * 100}%;width:${(widths[i] / total) * 100}%`
      left += widths[i]
      const img = document.createElement('div'); img.className = 'pg-img'
      const hl = document.createElement('div'); hl.className = 'pg-hl'
      const text = document.createElement('div'); text.className = 'pg-ocr'
      root.append(img, hl, text)
      return { leaf, root, img, hl, text, cssW: (fit.w * widths[i]) / total }
    })
    this.content.replaceChildren(...this.slots.map((s) => s.root))
    for (const l of leaves) this.attach(l)
    this.drawHighlights()
    this.ensureWindow()
    this.scheduleText()
    this.ev.onUnit(leaves)
  }

  /** thumbnail for the strip / page index: downloaded copy if present */
  thumbUrl(leaf: number, width: number): string {
    const p = this.pages[leaf]
    return this.local?.has(thumbFile(leaf)) ? this.local.url(thumbFile(leaf)) : p ? iiifUrl(p, width) : ''
  }

  /** null = nothing to fetch for this kind (a downloaded page has no low-res placeholder: the sharp file is local) */
  private urlFor(leaf: number, kind: Kind): string | null {
    const p = this.pages[leaf]
    if (kind !== 'max' && this.local?.has(pageFile(leaf))) return kind === 'high' ? this.local.url(pageFile(leaf)) : null
    return kind === 'low' ? iiifUrl(p, LOW_WIDTH) : kind === 'high' ? iiifUrl(p, SHARP_WIDTH) : iiifUrl(p, p.w)
  }

  /** Put the best decoded image for `leaf` into its slot (if it is on screen). */
  private attach(leaf: number) {
    const slot = this.slots.find((s) => s.leaf === leaf)
    const s = this.decoded.get(leaf)
    const img = s?.max ?? s?.high ?? s?.low
    if (!slot || !img) return
    if (slot.img.firstChild !== img) slot.img.replaceChildren(img)
    if (!this.unitPainted) {
      this.unitPainted = true
      metrics.turnEnd()
    }
    if (!this.firstPaint) {
      this.firstPaint = true
      requestAnimationFrame(() =>
        metrics.set('first page', `${Math.round(performance.now() - this.openedAt)} ms (${img === s?.low ? 'low' : 'sharp'})`))
    }
  }

  private unitLeaves(from: number, to: number): number[] {
    const out: number[] = []
    for (let u = from; u <= to; u++) if (u >= 0 && u < this.units.length) out.push(...this.units[u])
    return out
  }

  private inDecodeWindow(leaf: number) {
    return this.unitLeaves(this.unit - DECODE_BEHIND, this.unit + DECODE_AHEAD).includes(leaf)
  }

  private ensureWindow() {
    const decodeSet = new Set(this.unitLeaves(this.unit - DECODE_BEHIND, this.unit + DECODE_AHEAD))
    const current = new Set(this.leaves)
    for (const [leaf, s] of this.decoded) {
      if (!decodeSet.has(leaf)) {
        this.releaseSlots(s)
        this.decoded.delete(leaf)
      } else if (!current.has(leaf) && s.max) {
        this.loader.release(s.max)
        delete s.max
      }
    }
    // priority: current unit, next, previous, next+1 … (low-res first so a page is never blank)
    const order: number[] = [...this.leaves]
    for (let d = 1; d <= Math.max(DECODE_AHEAD, DECODE_BEHIND); d++) {
      if (d <= DECODE_AHEAD) order.push(...this.unitLeaves(this.unit + d, this.unit + d))
      if (d <= DECODE_BEHIND) order.push(...this.unitLeaves(this.unit - d, this.unit - d))
    }
    const keep = new Map<string, number>()
    let prio = 0
    for (const leaf of order) {
      for (const kind of ['low', 'high'] as Kind[]) {
        const s = this.decoded.get(leaf)
        if (s?.[kind] || (kind === 'low' && s?.high)) continue
        const url = this.urlFor(leaf, kind)
        if (!url) continue
        keep.set(url, prio)
        this.request(leaf, kind, url, prio++)
      }
    }
    // download-only further ahead: low-res of all first, then sharp
    const ahead = this.unitLeaves(this.unit + DECODE_AHEAD + 1, this.unit + FETCH_AHEAD)
    for (const kind of ['low', 'high'] as Kind[]) {
      for (const leaf of ahead) {
        const url = this.urlFor(leaf, kind)
        if (!url) continue
        keep.set(url, prio)
        this.loader.prefetch(url, prio++)
      }
    }
    if (this.pz.scale > 1.4) this.onZoom(this.pz.scale)
    this.loader.retain(keep)
  }

  private request(leaf: number, kind: Kind, url: string, prio: number) {
    if (this.loading.has(url)) return
    this.loading.add(url)
    this.loader.load(url, prio).then(
      (img) => {
        this.loading.delete(url)
        if (this.destroyed || !this.inDecodeWindow(leaf) || (kind === 'max' && !this.leaves.includes(leaf))) {
          this.loader.release(img)
          return
        }
        img.className = 'scan'
        const s = this.decoded.get(leaf) ?? {}
        if (s[kind]) this.loader.release(s[kind]!)
        s[kind] = img
        this.decoded.set(leaf, s)
        this.attach(leaf)
        if (kind !== 'low' && s.low) { // sharp arrived: free the placeholder (after it left the screen)
          const low = s.low
          delete s.low
          requestAnimationFrame(() => this.loader.release(low))
        }
        if (kind === 'high' && this.leaves.includes(leaf)) this.onZoom(this.pz.scale)
      },
      (e) => {
        this.loading.delete(url)
        if ((e as DOMException)?.name !== 'AbortError') metrics.set('last error', `${kind} n${leaf}: ${String(e)}`)
      },
    )
  }

  private releaseSlots(s: Slots) {
    for (const img of [s.low, s.high, s.max]) if (img) this.loader.release(img)
  }

  /** zoomed in: fetch native resolution for the pages on screen */
  private onZoom(scale: number) {
    if (scale < 1.4 || !navigator.onLine) return // native resolution is online only (downloads keep 1200 px)
    for (const leaf of this.leaves) {
      const p = this.pages[leaf]
      if (!p || p.w <= SHARP_WIDTH || this.decoded.get(leaf)?.max || !this.decoded.get(leaf)?.high) continue
      this.request(leaf, 'max', this.urlFor(leaf, 'max')!, -1)
    }
  }

  // ---- OCR text layer + highlights -------------------------------------------------------------------------------

  private scheduleText() {
    window.clearTimeout(this.textTimer)
    if (!this.ocr) return
    // after the image is on screen, so the text layer never delays a page turn
    this.textTimer = window.setTimeout(() => this.renderText(), 60)
  }

  renderText() {
    if (!this.ocr) return
    const { h } = this.pz.fitSize
    let ms = 0
    let words = 0
    for (const slot of this.slots) {
      const page = this.ocr[slot.leaf]
      if (!page) continue
      ms += buildTextLayer(slot.text, page, slot.cssW, h, this.debugText)
      words += page.words.length
    }
    metrics.set('text layer', `${Math.round(ms)} ms, ${words} words`)
  }

  /** Normalized rects + text of the current selection (caller persists it), or null. */
  selection(): { leaf: number; rects: Rect[]; text: string } | null {
    if (!this.ocr) return null
    for (const slot of this.slots) {
      const idx = selectedWordIndices(slot.text)
      if (idx.length) return { leaf: slot.leaf, ...wordsToRects(this.ocr[slot.leaf], idx) }
    }
    return null
  }

  setHighlights(list: DrawnHighlight[]) {
    this.highlights = list
    this.drawHighlights()
  }

  /** highlight under a client point (on the pages currently shown), with a little slack for fingers */
  private highlightAt(x: number, y: number): number | null {
    for (const slot of this.slots) {
      const r = slot.root.getBoundingClientRect()
      if (!r.width || x < r.left || x > r.right || y < r.top || y > r.bottom) continue
      const nx = (x - r.left) / r.width
      const ny = (y - r.top) / r.height
      const padX = 8 / r.width
      const padY = 8 / r.height
      for (const h of this.highlights) {
        if (h.page !== slot.leaf || !h.rects.length) continue
        if (h.rects.some(([x0, y0, x1, y1]) => nx >= x0 - padX && nx <= x1 + padX && ny >= y0 - padY && ny <= y1 + padY)) return h.id
        // the note marker sits just past the end of the first line
        const [, y0, x1] = h.rects[0]
        if (h.note && Math.abs(x - (r.left + x1 * r.width + 14)) < 26 && Math.abs(y - (r.top + y0 * r.height)) < 26) return h.id
      }
    }
    return null
  }

  private drawHighlights() {
    for (const slot of this.slots) {
      const frag = document.createDocumentFragment()
      for (const h of this.highlights) {
        if (h.page !== slot.leaf) continue
        if (h.note && h.rects.length) {
          // small note marker at the end of the highlight's first line
          const m = document.createElement('span')
          m.className = 'hl-note'
          m.dataset.c = h.color
          m.style.cssText = `left:${h.rects[0][2] * 100}%;top:${h.rects[0][1] * 100}%`
          frag.append(m)
        }
        for (const [x0, y0, x1, y1] of h.rects) {
          const d = document.createElement('div')
          d.dataset.c = h.color
          d.style.cssText = `left:${x0 * 100}%;top:${y0 * 100}%;width:${(x1 - x0) * 100}%;height:${(y1 - y0) * 100}%`
          frag.append(d)
        }
      }
      slot.hl.replaceChildren(frag)
    }
  }
}
