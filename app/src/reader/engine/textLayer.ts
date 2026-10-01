// Invisible, selectable text layer built from OCR word boxes (normalized 0..1).
// Each word is an absolutely positioned transparent span, font-size = box height, scaleX to match box width.
import type { OcrPage } from './ocrTypes'

let measureCtx: CanvasRenderingContext2D | null = null
const FONT = 'serif'

export function buildTextLayer(layer: HTMLElement, page: OcrPage, cssW: number, cssH: number, debug: boolean): number {
  const t0 = performance.now()
  measureCtx ??= document.createElement('canvas').getContext('2d')!
  measureCtx.font = `100px ${FONT}`
  const frag = document.createDocumentFragment()
  let prevLine = -1
  page.words.forEach((w, i) => {
    if (prevLine !== -1) frag.append(w.line === prevLine ? ' ' : '\n')
    prevLine = w.line
    const left = w.x0 * cssW
    const top = w.y0 * cssH
    const bw = (w.x1 - w.x0) * cssW
    const bh = (w.y1 - w.y0) * cssH
    if (bw <= 0 || bh <= 0) return
    const measured = (measureCtx!.measureText(w.t).width * bh) / 100
    const span = document.createElement('span')
    span.textContent = w.t
    span.dataset.i = String(i)
    span.style.cssText = `left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;font-size:${bh.toFixed(1)}px;` +
      `transform:scaleX(${measured > 0 ? (bw / measured).toFixed(3) : 1})`
    frag.append(span)
  })
  layer.replaceChildren(frag)
  layer.classList.toggle('debug', debug)
  return performance.now() - t0
}

/** Word indices whose span intersects the current selection inside `layer`. */
export function selectedWordIndices(layer: HTMLElement): number[] {
  const sel = document.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return []
  const range = sel.getRangeAt(0)
  if (!layer.contains(range.commonAncestorContainer)) return []
  const out: number[] = []
  for (const span of layer.querySelectorAll<HTMLSpanElement>('span[data-i]')) {
    if (range.intersectsNode(span)) out.push(Number(span.dataset.i))
  }
  return out
}

export type Rect = [number, number, number, number]

/** Merge selected words into one normalized rect per OCR line. */
export function wordsToRects(page: OcrPage, idx: number[]): { rects: Rect[]; text: string } {
  const byLine = new Map<number, Rect>()
  const parts: string[] = []
  let prevLine = -1
  for (const i of idx) {
    const w = page.words[i]
    parts.push(prevLine === -1 ? w.t : (w.line === prevLine ? ' ' : '\n') + w.t)
    prevLine = w.line
    const r = byLine.get(w.line)
    byLine.set(w.line, r ? [Math.min(r[0], w.x0), Math.min(r[1], w.y0), Math.max(r[2], w.x1), Math.max(r[3], w.y1)]
      : [w.x0, w.y0, w.x1, w.y1])
  }
  return { rects: [...byLine.values()], text: parts.join('') }
}
