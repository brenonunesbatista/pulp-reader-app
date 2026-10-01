// Leaf ↔ printed page map, read from the OCR (docs/archive-findings.md §5; same idea as tools/spike/ia_pagemap.py).
// Printed page numbers sit alone near the top or bottom edge of a page. Unnumbered pages (covers, ads, plates) take
// their number from the nearest numbered neighbour's offset, so inserted plates do not shift the rest of the issue.
import type { OcrPage } from './engine/ocrTypes'

export interface PageMap {
  /** printed page number for every leaf (null = before the first numbered page, e.g. covers) */
  printed: (number | null)[]
  /** most common leaf − printed offset (for reports) */
  offset: number | null
  /** leaves where a number was actually read */
  anchors: number
}

const EDGE = 0.08

/** Printed number found on one page, or null. */
export function readPageNumber(page: OcrPage): number | null {
  for (const w of page.words) {
    if (!/^\d{1,3}$/.test(w.t)) continue
    if (w.y0 < EDGE || w.y1 > 1 - EDGE) return Number(w.t)
  }
  return null
}

export function computePageMap(pages: OcrPage[]): PageMap {
  const n = pages.length
  const read = pages.map(readPageNumber)
  // keep a number only if its offset agrees with the next/previous reading (drops stray digits in headers/art)
  const off = read.map((p, leaf) => (p === null ? null : leaf - p))
  const anchor: (number | null)[] = off.map((o, i) => {
    if (o === null) return null
    const near = [off[i - 1], off[i + 1], off[i - 2], off[i + 2]].filter((x) => x !== null && x !== undefined)
    return near.some((x) => x === o) ? o : null
  })
  const anchors = anchor.filter((o) => o !== null).length
  const counts = new Map<number, number>()
  for (const o of anchor) if (o !== null) counts.set(o, (counts.get(o) ?? 0) + 1)
  const offset = anchors ? [...counts].sort((a, b) => b[1] - a[1])[0][0] : null

  const printed: (number | null)[] = new Array(n).fill(null)
  if (offset === null) return { printed, offset, anchors }
  // offset of the previous anchor: pages after an unnumbered plate keep counting; pages before the first anchor
  // (covers, front matter) stay unnumbered
  let prev: number | null = null
  for (let i = 0; i < n; i++) {
    if (anchor[i] !== null) prev = anchor[i]
    const p = prev === null ? null : i - prev
    printed[i] = p !== null && p >= 1 ? p : null
  }
  return { printed, offset, anchors }
}

/** Leaf of a printed page (exact match, else the closest leaf before it), or null if the map does not cover it. */
export function leafForPrinted(map: PageMap, page: number): number | null {
  const exact = map.printed.indexOf(page)
  if (exact >= 0) return exact
  let best: number | null = null
  map.printed.forEach((p, leaf) => { if (p !== null && p < page) best = leaf })
  return best !== null && (map.printed[best] ?? 0) >= page - 2 ? best + 1 : null
}
