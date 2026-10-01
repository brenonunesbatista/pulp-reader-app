// Reader B spike: IIIF page images + invisible OCR text layer.
import { useEffect, useRef, useState } from 'react'
import { DECODE_AHEAD, DECODE_BEHIND, FETCH_AHEAD, LOW_WIDTH, SHARP_WIDTH, type SpikeIssue } from '../config'
import { iiifUrl, loadManifest, loadOcr, type PageInfo } from '../ia'
import { metrics } from '../metrics'
import { MetricsOverlay } from '../MetricsOverlay'
import type { OcrPage } from '../ocrTypes'
import { PanZoom } from '../panzoom'
import { ImageLoader } from './imageLoader'
import { buildTextLayer, selectedWordIndices, wordsToRects, type Rect } from './textLayer'

type Kind = 'low' | 'high' | 'max'
interface Slots { low?: HTMLImageElement; high?: HTMLImageElement; max?: HTMLImageElement }
interface Highlight { leaf: number; rects: Rect[]; text: string }

interface Els {
  viewport: HTMLDivElement
  content: HTMLDivElement
  imgLayer: HTMLDivElement
  hlLayer: HTMLDivElement
  textLayer: HTMLDivElement
  label: HTMLSpanElement
}

class ReaderBController {
  private pages: PageInfo[] = []
  private ocr: OcrPage[] | null = null
  private loader = new ImageLoader()
  private decoded = new Map<number, Slots>()
  private loading = new Set<string>()
  private current = -1
  private pz: PanZoom
  private openedAt = performance.now()
  private firstPaint = false
  private textTimer = 0
  highlights: Highlight[] = []
  debugText = false
  onPage?: (leaf: number, zoom: number) => void
  private els: Els
  private ident: string
  private onError: (m: string) => void

  constructor(els: Els, ident: string, onChromeToggle: () => void, onError: (m: string) => void) {
    this.els = els
    this.ident = ident
    this.onError = onError
    this.pz = new PanZoom(els.viewport, els.content, {
      onTurn: (d) => this.go(this.current + d),
      onCenterTap: onChromeToggle,
      onZoomSettled: (s) => this.onZoom(s),
      isSelecting: () => !(document.getSelection()?.isCollapsed ?? true),
    })
  }

  async init(startLeaf: number) {
    metrics.reset()
    try {
      const t = performance.now()
      this.pages = await loadManifest(this.ident)
      metrics.set('manifest', `${Math.round(performance.now() - t)} ms, ${this.pages.length} pages`)
      // guide leaves can point past the end of a scan (see docs/archive-findings.md §5)
      this.go(Math.max(0, Math.min(startLeaf, this.pages.length - 1)))
      this.ocr = await loadOcr(this.ident)
      this.scheduleText()
    } catch (e) {
      this.onError(String(e))
    }
  }

  destroy() {
    this.pz.destroy()
    for (const s of this.decoded.values()) this.releaseSlots(s)
    this.decoded.clear()
    this.loader.retain(new Map())
    window.clearTimeout(this.textTimer)
  }

  get pageCount() {
    return this.pages.length
  }

  get leaf() {
    return this.current
  }

  go(leaf: number) {
    if (leaf < 0 || leaf >= this.pages.length || leaf === this.current) return
    const p = this.pages[leaf]
    const have = this.decoded.get(leaf)
    metrics.turnBegin(!!(have?.low || have?.high))
    this.current = leaf
    this.pz.setPage(p.w, p.h)
    this.els.imgLayer.replaceChildren()
    this.els.textLayer.replaceChildren()
    this.els.label.textContent = `${leaf + 1} / ${this.pages.length}  (leaf n${leaf})`
    this.attach(leaf)
    this.renderHighlights()
    this.ensureWindow()
    this.scheduleText()
    this.onPage?.(leaf, this.pz.scale)
  }

  private urlFor(leaf: number, kind: Kind) {
    const p = this.pages[leaf]
    return kind === 'low' ? iiifUrl(p, LOW_WIDTH) : kind === 'high' ? iiifUrl(p, SHARP_WIDTH) : iiifUrl(p, p.w)
  }

  /** Put the best decoded image for `leaf` on screen (only if it is the current page). */
  private attach(leaf: number) {
    if (leaf !== this.current) return
    const s = this.decoded.get(leaf)
    const img = s?.max ?? s?.high ?? s?.low
    if (!img) return
    if (this.els.imgLayer.firstChild !== img) this.els.imgLayer.replaceChildren(img)
    metrics.turnEnd()
    if (!this.firstPaint) {
      this.firstPaint = true
      requestAnimationFrame(() =>
        metrics.set('first page', `${Math.round(performance.now() - this.openedAt)} ms (${img === s?.low ? 'low' : 'sharp'})`))
    }
  }

  private ensureWindow() {
    const cur = this.current
    // drop decoded pages outside the decode window (keeps ≤ 4 decoded pages)
    for (const [leaf, s] of this.decoded) {
      if (!this.inDecodeWindow(leaf)) {
        this.releaseSlots(s)
        this.decoded.delete(leaf)
      } else if (leaf !== cur && s.max) {
        this.loader.release(s.max)
        delete s.max
      }
    }
    // 1) decode window, by priority: current, next, previous, next+1 … (low-res first so a page is never blank)
    const decode: [number, Kind][] = [[cur, 'low'], [cur, 'high']]
    for (let d = 1; d <= Math.max(DECODE_AHEAD, DECODE_BEHIND); d++) {
      if (d <= DECODE_AHEAD) decode.push([cur + d, 'low'], [cur + d, 'high'])
      if (d <= DECODE_BEHIND) decode.push([cur - d, 'low'], [cur - d, 'high'])
    }
    // 2) download-only window further ahead: low-res of all first (fast), then sharp
    const fetchOnly: [number, Kind][] = []
    for (const kind of ['low', 'high'] as Kind[]) {
      for (let d = DECODE_AHEAD + 1; d <= FETCH_AHEAD; d++) fetchOnly.push([cur + d, kind])
    }
    const keep = new Map<string, number>()
    let prio = 0
    for (const [leaf, kind] of decode) {
      if (leaf < 0 || leaf >= this.pages.length) continue
      const s = this.decoded.get(leaf)
      if (s?.[kind] || (kind === 'low' && s?.high)) continue // low is pointless once sharp is decoded
      const url = this.urlFor(leaf, kind)
      keep.set(url, prio)
      this.request(leaf, kind, url, prio++)
    }
    for (const [leaf, kind] of fetchOnly) {
      if (leaf >= this.pages.length) continue
      const url = this.urlFor(leaf, kind)
      keep.set(url, prio)
      this.loader.prefetch(url, prio++)
    }
    if (this.decoded.get(cur)?.high && this.pz.scale > 1.4) this.onZoom(this.pz.scale)
    this.loader.retain(keep)
  }

  private inDecodeWindow(leaf: number) {
    return leaf >= this.current - DECODE_BEHIND && leaf <= this.current + DECODE_AHEAD
  }

  private request(leaf: number, kind: Kind, url: string, prio: number) {
    if (this.loading.has(url)) return
    this.loading.add(url)
    this.loader.load(url, prio).then(
      (img) => {
        this.loading.delete(url)
        if (!this.inDecodeWindow(leaf) || (kind === 'max' && leaf !== this.current)) {
          this.loader.release(img)
          return
        }
        const s = this.decoded.get(leaf) ?? {}
        if (s[kind]) this.loader.release(s[kind]!)
        s[kind] = img
        if (kind !== 'low' && s.low) { // sharp arrived: free the placeholder
          if (leaf !== this.current) { this.loader.release(s.low); delete s.low }
        }
        this.decoded.set(leaf, s)
        this.attach(leaf)
        // page reached through a zoomed turn: fetch full resolution once the sharp image is in
        if (leaf === this.current && kind === 'high') this.onZoom(this.pz.scale)
        if (leaf === this.current && kind !== 'low' && s.low) {
          const low = s.low
          delete s.low
          requestAnimationFrame(() => this.loader.release(low))
        }
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

  private onZoom(scale: number) {
    const p = this.pages[this.current]
    if (!p || scale < 1.4 || p.w <= SHARP_WIDTH || this.decoded.get(this.current)?.max) return
    const url = this.urlFor(this.current, 'max')
    this.request(this.current, 'max', url, -1)
  }

  private scheduleText() {
    window.clearTimeout(this.textTimer)
    if (!this.ocr) return
    // after the image is on screen, so the text layer never delays a page turn
    this.textTimer = window.setTimeout(() => this.renderText(), 50)
  }

  renderText() {
    const page = this.ocr?.[this.current]
    if (!page) return
    const { w, h } = this.pz.fitSize
    const ms = buildTextLayer(this.els.textLayer, page, w, h, this.debugText)
    metrics.set('text layer', `${Math.round(ms)} ms, ${page.words.length} words`)
  }

  highlightSelection(): boolean {
    const page = this.ocr?.[this.current]
    if (!page) return false
    const idx = selectedWordIndices(this.els.textLayer)
    if (!idx.length) return false
    const { rects, text } = wordsToRects(page, idx)
    this.highlights.push({ leaf: this.current, rects, text })
    document.getSelection()?.removeAllRanges()
    this.renderHighlights()
    return true
  }

  private renderHighlights() {
    const frag = document.createDocumentFragment()
    for (const h of this.highlights) {
      if (h.leaf !== this.current) continue
      for (const [x0, y0, x1, y1] of h.rects) {
        const d = document.createElement('div')
        d.style.cssText = `left:${x0 * 100}%;top:${y0 * 100}%;width:${(x1 - x0) * 100}%;height:${(y1 - y0) * 100}%`
        frag.append(d)
      }
    }
    this.els.hlLayer.replaceChildren(frag)
  }
}

export function ReaderB({ issue, onBack, startLeaf = 0, onPage }: {
  issue: SpikeIssue; onBack: () => void; startLeaf?: number; onPage?: (leaf: number, zoom: number) => void
}) {
  const onPageRef = useRef(onPage)
  useEffect(() => { onPageRef.current = onPage }, [onPage])
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const imgLayer = useRef<HTMLDivElement>(null)
  const hlLayer = useRef<HTMLDivElement>(null)
  const textLayer = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const ctl = useRef<ReaderBController | null>(null)
  const [chrome, setChrome] = useState(true)
  const [hasSel, setHasSel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hlCount, setHlCount] = useState(0)

  useEffect(() => {
    const c = new ReaderBController(
      { viewport: viewport.current!, content: content.current!, imgLayer: imgLayer.current!, hlLayer: hlLayer.current!,
        textLayer: textLayer.current!, label: label.current! },
      issue.id, () => setChrome((v) => !v), setError)
    ctl.current = c
    c.onPage = (leaf, zoom) => onPageRef.current?.(leaf, zoom)
    c.init(startLeaf)
    const onSel = () => {
      const sel = document.getSelection()
      setHasSel(!!sel && !sel.isCollapsed && !!textLayer.current?.contains(sel.anchorNode))
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') c.go(c.leaf + 1)
      if (e.key === 'ArrowLeft') c.go(c.leaf - 1)
    }
    document.addEventListener('selectionchange', onSel)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('selectionchange', onSel)
      window.removeEventListener('keydown', onKey)
      c.destroy()
    }
  }, [issue.id, startLeaf])

  return (
    <div className="reader">
      <div ref={viewport} className="viewport">
        <div ref={content} className="page">
          <div ref={imgLayer} className="img-layer" />
          <div ref={hlLayer} className="hl-layer" />
          <div ref={textLayer} className="ocr-layer" />
        </div>
      </div>
      <div className={`topbar ${chrome ? '' : 'hidden'}`}>
        <button onClick={onBack}>‹ Back</button>
        <b>B · {issue.label}</b>
        <span ref={label} />
        <button onClick={() => ctl.current?.go(issue.storyLeaf)}>Story n{issue.storyLeaf}</button>
        <button onClick={() => { const c = ctl.current!; c.go(Math.max(0, c.leaf - 10)) }}>−10</button>
        <button onClick={() => { const c = ctl.current!; c.go(Math.min(c.pageCount - 1, c.leaf + 10)) }}>+10</button>
        <button onClick={() => { const c = ctl.current!; c.debugText = !c.debugText; c.renderText() }}>OCR boxes</button>
        <span>{hlCount} highlights</span>
      </div>
      {error && <div className="error">{error}</div>}
      {hasSel && (
        <div className="seltoolbar">
          <button onClick={() => { if (ctl.current?.highlightSelection()) setHlCount((n) => n + 1) }}>Highlight</button>
          <button onClick={() => navigator.clipboard?.writeText(document.getSelection()?.toString() ?? '')}>Copy</button>
        </div>
      )}
      <MetricsOverlay />
    </div>
  )
}
