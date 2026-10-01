import { leafForPrinted } from './pageMap'

// Reading units: one page, or a two-page spread (front cover alone, then pairs: leaves 1–2, 3–4, …).
export type Unit = number[]

export function buildUnits(pageCount: number, spread: boolean): Unit[] {
  if (!spread) return Array.from({ length: pageCount }, (_, i) => [i])
  const units: Unit[] = pageCount ? [[0]] : []
  for (let i = 1; i < pageCount; i += 2) units.push(i + 1 < pageCount ? [i, i + 1] : [i])
  return units
}

export function unitOfLeaf(units: Unit[], leaf: number): number {
  const i = units.findIndex((u) => u.includes(leaf))
  return i >= 0 ? i : Math.max(0, Math.min(units.length - 1, leaf))
}

export interface StoryStart {
  id: number
  title: string
  credit: string
  partInfo: string | null
  leaf: number
}

/** Story start leaves from the contents, corrected by the OCR page map when known (guide leaf otherwise). */
export function computeStarts(
  contents: { id: number; title: string; partInfo: string | null; pagePrinted: number | null; iaLeaf: number | null
    credits: { role: string; name: string }[] }[],
  printed: (number | null)[] | null, pageCount: number,
): StoryStart[] {
  const n = pageCount || Infinity
  return contents.flatMap((s) => {
    const corrected = printed && s.pagePrinted !== null ? leafForPrinted({ printed, offset: null, anchors: 1 }, s.pagePrinted) : null
    const l = corrected ?? s.iaLeaf
    if (l === null || l >= n) return []
    return [{ id: s.id, title: s.title, partInfo: s.partInfo, leaf: l,
      credit: s.credits.filter((c) => c.role === 'author').map((c) => c.name).join(', ') }]
  }).sort((a, b) => a.leaf - b.leaf)
}

/** Story being read at `leaf` (last one starting at or before it). */
export function storyAt(starts: StoryStart[], leaf: number): StoryStart | null {
  let best: StoryStart | null = null
  for (const s of starts) if (s.leaf <= leaf && (!best || s.leaf >= best.leaf)) best = s
  return best
}

/** Pages from `leaf` to the end of the current story (next story start, or the end of the issue). */
export function pagesToEnd(starts: StoryStart[], leaf: number, pageCount: number): number {
  const nexts = starts.map((s) => s.leaf).filter((l) => l > leaf)
  return (nexts.length ? Math.min(...nexts) : pageCount) - leaf
}
