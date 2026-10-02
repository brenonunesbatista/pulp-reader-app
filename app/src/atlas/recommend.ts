// "Explore next": graph recommendations with a visible reason (docs/design/banca-atlas.md). Pure, tested.
// Scores come from the curated links (read next > adaptations > influence > publishing), shared themes, the next stop
// on a path and the same year in another lane; the user's history lowers what was already explored, read or listed.
import type { AtlasGraph, LinkRel } from '../data/atlasRepo'
import { linkLabel } from './forms'

export interface Rec { id: string; score: number; reason: string }

export interface Signals {
  /** entity → last visit time */
  visited: Map<string, number>
  wanted: Set<string>
  done: Set<string>
  /** entities read in Banca (their catalog issue has reading progress) */
  read: Set<string>
}

export const NO_SIGNALS: Signals = { visited: new Map(), wanted: new Set(), done: new Set(), read: new Set() }

const REL_WEIGHT: Record<LinkRel, number> = {
  read_next: 10, adapted_as: 8, influenced: 7, created_by: 5, cover_of: 5, collected_in: 5, published_in: 4, context: 3,
}

function personalize(score: number, id: string, s: Signals): number {
  let f = 1
  if (s.done.has(id)) f *= 0.2
  else if (s.wanted.has(id)) f *= 0.8
  if (s.read.has(id)) f *= 0.5
  if (s.visited.has(id)) f *= 0.6
  return score * f
}

type Acc = Map<string, { score: number; best: number; reason: string }>

function add(acc: Acc, id: string, score: number, reason: string) {
  const cur = acc.get(id) ?? { score: 0, best: 0, reason }
  cur.score += score
  if (score > cur.best) { cur.best = score; cur.reason = reason }
  acc.set(id, cur)
}

/** Raw candidates around one entity (no personalization). `pathStops` = ordered entity ids of a path. */
function around(g: AtlasGraph, id: string, pathStops: string[]): Acc {
  const acc: Acc = new Map()
  for (const l of g.links) {
    if (l.src !== id) continue
    const label = l.rel === 'read_next' && !l.inverse && l.note ? l.note : linkLabel(l.rel, l.inverse)
    // seen from the other side a link counts a bit less; "read next" backwards (where you came from) barely counts
    const factor = !l.inverse ? 1 : l.rel === 'read_next' ? 0.2 : 0.8
    add(acc, l.dst, REL_WEIGHT[l.rel] * factor, label.toUpperCase())
  }
  for (const t of g.themes.get(id) ?? []) {
    const theme = g.entities.get(t)
    for (const [other, ts] of g.themes) {
      if (other !== id && ts.includes(t)) add(acc, other, 4, `Same theme: ${theme?.title ?? t}`.toUpperCase())
    }
  }
  const pos = pathStops.indexOf(id)
  if (pos >= 0 && pos + 1 < pathStops.length) add(acc, pathStops[pos + 1], 6, 'NEXT ON YOUR PATH')
  const me = g.entities.get(id)
  if (me?.year && me.lane) {
    for (const e of g.entities.values()) {
      if (e.id !== id && e.year === me.year && e.lane && e.lane !== me.lane) add(acc, e.id, 1.5, 'HAPPENED THE SAME YEAR')
    }
  }
  acc.delete(id)
  return acc
}

function rank(acc: Acc, g: AtlasGraph, s: Signals, exclude: Set<string>, limit: number): Rec[] {
  return [...acc]
    .filter(([id]) => !exclude.has(id) && g.entities.get(id)?.type !== 'theme')
    .map(([id, v]) => ({ id, score: personalize(v.score, id, s), reason: v.reason }))
    .sort((a, b) => b.score - a.score || (g.entities.get(a.id)?.year ?? 0) - (g.entities.get(b.id)?.year ?? 0))
    .slice(0, limit)
}

/** Explore next on an entity page. */
export function recommendFrom(g: AtlasGraph, id: string, s: Signals = NO_SIGNALS, pathStops: string[] = [], limit = 6): Rec[] {
  return rank(around(g, id, pathStops), g, s, new Set([id]), limit)
}

/** Explore next on the Atlas home: around what was read in Banca and explored recently; a path start when new. */
export function recommendHome(g: AtlasGraph, s: Signals, pathStops: string[] = [], limit = 8): Rec[] {
  const seeds: { id: string; weight: number; reason: string }[] = []
  for (const id of s.read) {
    const e = g.entities.get(id)
    if (e) seeds.push({ id, weight: 1, reason: `Because you read ${e.title}` })
  }
  const recent = [...s.visited].sort((a, b) => b[1] - a[1]).slice(0, 5)
  recent.forEach(([id], i) => {
    const e = g.entities.get(id)
    if (e) seeds.push({ id, weight: 0.9 - i * 0.12, reason: `Because you explored ${e.title}` })
  })
  if (!seeds.length) {
    return pathStops.slice(0, limit).map((id, i) => ({ id, score: limit - i, reason: i === 0 ? 'START HERE' : 'NEXT ON YOUR PATH' }))
  }
  const acc: Acc = new Map()
  for (const seed of seeds) {
    for (const [id, v] of around(g, seed.id, pathStops)) add(acc, id, v.score * seed.weight, seed.reason.toUpperCase())
  }
  return rank(acc, g, s, new Set([...seeds.map((x) => x.id), ...s.visited.keys()]), limit)
}
