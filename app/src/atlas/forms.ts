// Atlas vocabulary shared by screens and recommendations: lanes, entity types, link labels (docs/design/banca-atlas.md).
import type { CSSProperties } from 'react'
import type { EntitySummary, EntityType, Lane, LinkRel } from '../data/atlasRepo'

export const LANES: { id: Lane; label: string; short: string }[] = [
  { id: 'magazines', label: 'Magazines & stories', short: 'Magazines' },
  { id: 'books', label: 'Books', short: 'Books' },
  { id: 'film-tv', label: 'Film, TV & radio', short: 'Film & TV' },
  { id: 'music', label: 'Music', short: 'Music' },
  { id: 'visual-art', label: 'Visual art', short: 'Art' },
  { id: 'comics', label: 'Comics & manga', short: 'Comics' },
  { id: 'events', label: 'World events', short: 'World' },
]

/** CSS custom-property suffix per lane (app.css: --lane-<x>, --on-lane-<x>) */
export const LANE_TOKEN: Record<Lane, string> = {
  magazines: 'mag', books: 'book', 'film-tv': 'film', music: 'music', 'visual-art': 'art', comics: 'comic', events: 'world',
}

export const TYPE_LABEL: Record<EntityType, string> = {
  person: 'Person', work: 'Story', film: 'Film', series: 'Series', radio: 'Radio', music: 'Album', artwork: 'Visual art',
  magazine: 'Magazine', issue: 'Issue', event: 'Event', movement: 'Movement', theme: 'Theme',
}

/** lane used for a type's badge color when the entity itself has no lane (person, theme, movement) */
export function badgeLane(type: EntityType, lane: Lane | null): Lane | null {
  if (lane) return lane
  return type === 'movement' ? 'magazines' : null
}

/** icon path (24 px grid) per type, from the Atlas component board */
export const TYPE_ICON: Record<EntityType, string> = {
  work: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
  magazine: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
  issue: 'M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7',
  film: 'M3 6h18v12H3zM7 6v12M17 6v12M3 10h4M3 14h4M17 10h4M17 14h4',
  series: 'M3 6h18v12H3zM7 6v12M17 6v12M3 10h4M3 14h4M17 10h4M17 14h4',
  radio: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0M20 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0a3 3 0 1 1 6 0M20 16a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  artwork: 'M12 3a9 9 0 1 0 0 18c1 0 2-1 1-2.5S13 16 15 16h3a3 3 0 0 0 3-3c0-5.5-4-10-9-10M7.5 11.5h.01M10 7.5h.01M15 7.5h.01',
  event: 'M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8',
  movement: 'M4 19l5-14 5 14M6 14h6M18 3v6M15 6h6',
  person: 'M12 4a4 4 0 1 0 0 8a4 4 0 1 0 0-8M4 21c1-4 4-6 8-6s7 2 8 6',
  theme: 'M7 7h.01M3 3h8l10 10-8 8L3 11z',
}

/** Connection group label, read as "<this entity> <label> <other>" (declared) or the inverse wording. */
export function linkLabel(rel: LinkRel, inverse: boolean): string {
  if (!inverse) {
    return { influenced: 'Influenced', adapted_as: 'Adapted as', published_in: 'Published in', collected_in: 'Collected in',
      cover_of: 'Cover of', created_by: 'Created by', read_next: 'Read next', context: 'Context' }[rel]
  }
  return { influenced: 'Influenced by', adapted_as: 'Adapted from', published_in: 'Published here', collected_in: 'Collects',
    cover_of: 'Cover', created_by: 'Works', read_next: 'Leads here from', context: 'In context' }[rel]
}

/** link color family (spec: influence red, adaptation blue, theme teal, publishing ink, read next ochre) */
export function linkTone(rel: LinkRel): 'inf' | 'adapt' | 'publish' | 'next' {
  if (rel === 'influenced' || rel === 'context') return 'inf'
  if (rel === 'adapted_as') return 'adapt'
  if (rel === 'read_next') return 'next'
  return 'publish'
}

export function wantVerb(list: 'read' | 'watch' | 'listen' | 'see'): string {
  return { read: 'Read', watch: 'Watch', listen: 'Listen', see: 'See' }[list]
}

export function fmtDate(d: string | null): string {
  if (!d) return ''
  const [y, m, day] = d.split('-')
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (!m) return y
  return day ? `${Number(day)} ${MON[Number(m) - 1]} ${y}` : `${MON[Number(m) - 1]} ${y}`
}

/** inline CSS variables --lc / --on-lc for a lane color */
export function laneVars(lane: Lane | null): CSSProperties {
  if (!lane) return {}
  const t = LANE_TOKEN[lane]
  return { ['--lc' as string]: `var(--lane-${t})`, ['--on-lc' as string]: `var(--on-lane-${t})` }
}

export function dates(e: Pick<EntitySummary, 'date' | 'year' | 'endYear' | 'type'>, end?: string | null): string {
  if (!e.date) return ''
  if (e.type === 'person' && e.endYear) return `${e.year}–${e.endYear}`
  if (end) return `${fmtDate(e.date)} – ${fmtDate(end)}`
  return fmtDate(e.date)
}


/** badge label: works on the Books lane are books, the rest stories */
export function typeLabel(type: EntityType, lane: Lane | null): string {
  return type === 'work' && lane === 'books' ? 'Book' : TYPE_LABEL[type]
}
