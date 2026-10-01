import { describe, expect, it } from 'vitest'
import type { OcrPage } from './engine/ocrTypes'
import { buildUnits, pagesToEnd, storyAt, unitOfLeaf } from './layout'
import { computePageMap, leafForPrinted, readPageNumber } from './pageMap'

/** synthetic OCR page: body words in the middle, optional page number in the header or footer */
function page(num?: number, where: 'top' | 'bottom' = 'top', stray?: string): OcrPage {
  const words = [{ t: 'Body', x0: 0.1, y0: 0.4, x1: 0.2, y1: 0.42, line: 1 }]
  if (num !== undefined) {
    const y = where === 'top' ? 0.03 : 0.95
    words.push({ t: String(num), x0: 0.48, y0: y, x1: 0.52, y1: y + 0.02, line: 0 })
  }
  if (stray) words.push({ t: stray, x0: 0.3, y0: 0.5, x1: 0.32, y1: 0.52, line: 2 })
  return { w: 1000, h: 1500, words }
}

describe('page map', () => {
  it('reads header/footer numbers only', () => {
    expect(readPageNumber(page(42))).toBe(42)
    expect(readPageNumber(page(7, 'bottom'))).toBe(7)
    expect(readPageNumber(page(undefined, 'top', '1926'))).toBeNull()
  })

  it('maps leaves to printed pages with the offset the scan really has (Mar 1940: leaf = printed − 1)', () => {
    // leaves 0–1: cover + inside cover (unnumbered); from leaf 2 on the pages read 3, 4, 5, … (leaf = printed − 1)
    const pages = [page(), page(), ...Array.from({ length: 10 }, (_, i) => page(i + 3, i % 2 ? 'bottom' : 'top'))]
    const map = computePageMap(pages)
    expect(map.offset).toBe(-1)
    expect(map.printed.slice(0, 4)).toEqual([null, null, 3, 4]) // covers stay unnumbered
    expect(leafForPrinted(map, 8)).toBe(7)
  })

  it('keeps counting across an unnumbered plate and ignores stray digits', () => {
    const pages = [page(), page(1), page(2), page(3), page(undefined, 'top', '77'), page(5), page(6), page(7)]
    // leaf 4 is an unnumbered illustration that still counts as page 4
    const map = computePageMap(pages)
    expect(map.printed).toEqual([null, 1, 2, 3, 4, 5, 6, 7])
    const withJunk = [page(), page(1), page(99), page(3), page(4), page(5)]
    expect(computePageMap(withJunk).printed[2]).toBe(2) // 99 disagrees with its neighbours → ignored
  })

  it('returns an empty map when no numbers are found', () => {
    const map = computePageMap([page(), page()])
    expect(map.offset).toBeNull()
    expect(leafForPrinted(map, 3)).toBeNull()
  })
})

describe('layout', () => {
  it('builds single pages and spreads (cover alone, then pairs)', () => {
    expect(buildUnits(4, false)).toEqual([[0], [1], [2], [3]])
    expect(buildUnits(6, true)).toEqual([[0], [1, 2], [3, 4], [5]])
    expect(unitOfLeaf(buildUnits(6, true), 4)).toBe(2)
  })

  it('finds the current story and pages to its end', () => {
    const starts = [{ id: 1, title: 'A', credit: '', partInfo: null, leaf: 4 }, { id: 2, title: 'B', credit: '', partInfo: null, leaf: 10 }]
    expect(storyAt(starts, 2)).toBeNull()
    expect(storyAt(starts, 7)?.title).toBe('A')
    expect(storyAt(starts, 10)?.title).toBe('B')
    expect(pagesToEnd(starts, 7, 20)).toBe(3)
    expect(pagesToEnd(starts, 12, 20)).toBe(8)
  })
})
