// Reader A spike (baseline): PDF.js renders the IA PDF to canvas + PDF.js text layer.
import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { SpikeIssue } from '../config'
import { getDownloadBytes } from '../http'
import { metrics } from '../metrics'
import { MetricsOverlay } from '../MetricsOverlay'
import { PanZoom } from '../panzoom'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const MAX_CANVAS_PX = 4096 * 4096

interface Els { viewport: HTMLDivElement; content: HTMLDivElement; canvasLayer: HTMLDivElement; textLayer: HTMLDivElement; label: HTMLSpanElement }

class ReaderAController {
  private doc: PDFDocumentProxy | null = null
  private task: pdfjs.PDFDocumentLoadingTask | null = null
  private current = -1
  private pz: PanZoom
  private rendered = new Map<number, HTMLCanvasElement>() // current ±1 at fit resolution
  private renderingFor = new Map<number, Promise<HTMLCanvasElement | null>>()
  private openedAt = performance.now()
  private firstPaint = false
  private textLayer: pdfjs.TextLayer | null = null
  private zoomCanvas: HTMLCanvasElement | null = null
  private els: Els
  private ident: string
  private onError: (m: string) => void
  private pageSizes: { w: number; h: number }[] = []

  constructor(els: Els, ident: string, onChrome: () => void, onError: (m: string) => void) {
    this.els = els
    this.ident = ident
    this.onError = onError
    this.pz = new PanZoom(els.viewport, els.content, {
      onTurn: (d) => this.go(this.current + d),
      onCenterTap: onChrome,
      onZoomSettled: (s) => this.onZoom(s),
      isSelecting: () => !(document.getSelection()?.isCollapsed ?? true),
    })
  }

  get leaf() { return this.current }
  get pageCount() { return this.doc?.numPages ?? 0 }

  async init() {
    metrics.reset()
    try {
      const t0 = performance.now()
      const data = await getDownloadBytes(this.ident, `${this.ident}.pdf`)
      const t1 = performance.now()
      metrics.set('pdf download', `${((t1 - t0) / 1000).toFixed(1)} s, ${(data.byteLength / 1e6).toFixed(1)} MB`)
      const base = `${import.meta.env.BASE_URL}pdfjs/`
      this.task = pdfjs.getDocument({ data, wasmUrl: `${base}wasm/`, standardFontDataUrl: `${base}standard_fonts/` })
      this.doc = await this.task.promise
      metrics.set('pdf open', `${Math.round(performance.now() - t1)} ms, ${this.doc.numPages} pages`)
      // page sizes (first page only up front; others lazily) — assume uniform for layout until rendered
      const p1 = await this.doc.getPage(1)
      const vp = p1.getViewport({ scale: 1 })
      this.pageSizes = Array.from({ length: this.doc.numPages }, () => ({ w: vp.width, h: vp.height }))
      this.go(0)
    } catch (e) {
      this.onError(String(e))
    }
  }

  destroy() {
    this.pz.destroy()
    this.textLayer?.cancel()
    void this.task?.destroy()
  }

  go(leaf: number) {
    if (!this.doc || leaf < 0 || leaf >= this.doc.numPages || leaf === this.current) return
    metrics.turnBegin(this.rendered.has(leaf))
    this.current = leaf
    this.zoomCanvas = null
    const sz = this.pageSizes[leaf]
    this.pz.setPage(sz.w, sz.h)
    this.els.canvasLayer.replaceChildren()
    this.els.textLayer.replaceChildren()
    this.els.label.textContent = `${leaf + 1} / ${this.doc.numPages}`
    const c = this.rendered.get(leaf)
    if (c) this.show(leaf, c)
    else this.render(leaf).then((cv) => cv && this.show(leaf, cv))
    // keep only current ±1, prerender neighbours after the current page
    for (const k of this.rendered.keys()) if (Math.abs(k - leaf) > 1) this.rendered.delete(k)
    window.setTimeout(() => { void this.render(leaf + 1).then(() => this.render(leaf - 1)) }, 0)
  }

  private show(leaf: number, canvas: HTMLCanvasElement) {
    if (leaf !== this.current) return
    this.els.canvasLayer.replaceChildren(canvas)
    metrics.turnEnd()
    if (!this.firstPaint) {
      this.firstPaint = true
      requestAnimationFrame(() => metrics.set('first page', `${Math.round(performance.now() - this.openedAt)} ms`))
    }
    window.setTimeout(() => void this.renderText(leaf), 50)
  }

  private render(leaf: number, scale = 1): Promise<HTMLCanvasElement | null> {
    if (!this.doc || leaf < 0 || leaf >= this.doc.numPages) return Promise.resolve(null)
    if (scale !== 1) return this.draw(leaf, scale)
    const done = this.rendered.get(leaf)
    if (done) return Promise.resolve(done)
    let p = this.renderingFor.get(leaf)
    if (!p) {
      p = this.draw(leaf, 1).finally(() => this.renderingFor.delete(leaf))
      this.renderingFor.set(leaf, p)
    }
    return p
  }

  private async draw(leaf: number, scale: number): Promise<HTMLCanvasElement | null> {
    if (!this.doc) return null
    const t0 = performance.now()
    const page = await this.doc.getPage(leaf + 1)
    const base = page.getViewport({ scale: 1 })
    this.pageSizes[leaf] = { w: base.width, h: base.height }
    const { w: fitW } = this.pz.fitSize
    const dpr = window.devicePixelRatio || 1
    let s = (fitW / base.width) * dpr * scale
    if (base.width * s * base.height * s > MAX_CANVAS_PX) s = Math.sqrt(MAX_CANVAS_PX / (base.width * base.height))
    const vp = page.getViewport({ scale: s })
    const canvas = document.createElement('canvas')
    canvas.width = Math.floor(vp.width)
    canvas.height = Math.floor(vp.height)
    await page.render({ canvas, viewport: vp }).promise
    metrics.set(scale === 1 ? 'render' : 'render zoom', `${Math.round(performance.now() - t0)} ms (${canvas.width}x${canvas.height})`)
    if (scale === 1 && Math.abs(leaf - this.current) <= 1) this.rendered.set(leaf, canvas)
    return canvas
  }

  private async renderText(leaf: number) {
    if (!this.doc || leaf !== this.current) return
    const t0 = performance.now()
    this.textLayer?.cancel()
    const page = await this.doc.getPage(leaf + 1)
    const { w: fitW } = this.pz.fitSize
    const vp = page.getViewport({ scale: fitW / page.getViewport({ scale: 1 }).width })
    const layer = this.els.textLayer
    layer.replaceChildren()
    layer.style.setProperty('--total-scale-factor', String(vp.scale))
    layer.style.setProperty('--scale-factor', String(vp.scale))
    this.textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: layer, viewport: vp })
    await this.textLayer.render()
    metrics.set('text layer', `${Math.round(performance.now() - t0)} ms, ${layer.querySelectorAll('span').length} spans`)
  }

  private async onZoom(scale: number) {
    if (scale < 1.4) {
      if (this.zoomCanvas) {
        const c = this.rendered.get(this.current)
        if (c) this.els.canvasLayer.replaceChildren(c)
        this.zoomCanvas = null
      }
      return
    }
    const leaf = this.current
    const c = await this.render(leaf, scale)
    if (c && leaf === this.current) {
      this.zoomCanvas = c
      this.els.canvasLayer.replaceChildren(c)
    }
  }
}

export function ReaderA({ issue, onBack }: { issue: SpikeIssue; onBack: () => void }) {
  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const canvasLayer = useRef<HTMLDivElement>(null)
  const textLayer = useRef<HTMLDivElement>(null)
  const label = useRef<HTMLSpanElement>(null)
  const ctl = useRef<ReaderAController | null>(null)
  const [chrome, setChrome] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const c = new ReaderAController(
      { viewport: viewport.current!, content: content.current!, canvasLayer: canvasLayer.current!,
        textLayer: textLayer.current!, label: label.current! },
      issue.id, () => setChrome((v) => !v), setError)
    ctl.current = c
    void c.init()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') c.go(c.leaf + 1)
      if (e.key === 'ArrowLeft') c.go(c.leaf - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      c.destroy()
    }
  }, [issue.id])

  return (
    <div className="reader">
      <div ref={viewport} className="viewport">
        <div ref={content} className="page">
          <div ref={canvasLayer} className="img-layer" />
          <div ref={textLayer} className="textLayer" />
        </div>
      </div>
      <div className={`topbar ${chrome ? '' : 'hidden'}`}>
        <button onClick={onBack}>‹ Back</button>
        <b>A (PDF.js) · {issue.label}</b>
        <span ref={label} />
        <button onClick={() => ctl.current?.go(issue.storyLeaf)}>Story n{issue.storyLeaf}</button>
        <button onClick={() => { const c = ctl.current!; c.go(Math.max(0, c.leaf - 10)) }}>−10</button>
        <button onClick={() => { const c = ctl.current!; c.go(Math.min(c.pageCount - 1, c.leaf + 10)) }}>+10</button>
      </div>
      {error && <div className="error">{error}</div>}
      <MetricsOverlay />
    </div>
  )
}
