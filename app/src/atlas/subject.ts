// Timeline of a subject and the curator inbox export (pure, tested).
import type { AtlasGraph, EntitySummary, InboxItem, Lane, TimelineItem } from '../data/atlasRepo'

/** id of a user's own timeline item in the timeline (never collides with Atlas ids, which are slugs) */
export const mineId = (id: number) => `mine:${id}`

/** a user's own item drawn like an Atlas entry (type event, the lane they chose) */
export function personalSummary(i: TimelineItem): EntitySummary {
  return { id: mineId(i.id), type: 'event', title: i.title ?? '', subtitle: i.note ?? '', lane: i.lane, date: String(i.year),
    year: i.year, endYear: null, image: { url: null, credit: null, license: null, source: null, catalogCover: null } }
}

/** What a timeline shows: Atlas entries with a lane and a year (limited to the subject, if any), plus the entities added
 *  to a saved timeline even when outside the subject, plus the user's own items; `mineOnly` keeps only the added ones. */
export function timelineEntries(g: AtlasGraph, o: { subject: Set<string> | null; added: TimelineItem[]; mineOnly: boolean
  hidden: Set<Lane> }): EntitySummary[] {
  const pinned = new Set(o.added.flatMap((i) => (i.entityId ? [i.entityId] : [])))
  const shown = (e: EntitySummary) => !!e.lane && !!e.year && !o.hidden.has(e.lane)
  const atlas = [...g.entities.values()].filter((e) => shown(e)
    && (pinned.has(e.id) || (!o.mineOnly && (!o.subject || o.subject.has(e.id)))))
  const own = o.added.filter((i) => !i.entityId).map(personalSummary).filter(shown)
  return [...atlas, ...own]
}

/** The entities a subject timeline shows: the search matches, everything directly linked to them, and the members
 *  of any matched theme. Only curated links are used — nothing is generated. */
export function subjectIds(g: AtlasGraph, matches: string[]): Set<string> {
  const out = new Set<string>()
  for (const id of matches) {
    if (!g.entities.has(id)) continue
    out.add(id)
    for (const l of g.links) if (l.src === id) out.add(l.dst)
    if (g.entities.get(id)?.type === 'theme') {
      for (const [e, ts] of g.themes) if (ts.includes(id)) out.add(e)
    }
  }
  return out
}

const day = (t: number) => new Date(t).toISOString().slice(0, 10)

/** Inbox as Markdown, to paste into the conversation that curates the Atlas. */
export function inboxMarkdown(items: InboxItem[], now = Date.now()): string {
  const sug = items.filter((i) => i.kind === 'suggestion')
  const miss = items.filter((i) => i.kind === 'search').sort((a, b) => b.count - a.count || b.updatedAt - a.updatedAt)
  const out = [`# Banca Atlas inbox (${day(now)})`, '']
  out.push(`## Suggestions (${sug.length})`, '')
  for (const s of sug) out.push(`- ${s.text}${s.context ? ` — from ${s.context}` : ''} (${day(s.createdAt)})`)
  if (!sug.length) out.push('- (none)')
  out.push('', `## Atlas searches that found nothing (${miss.length})`, '')
  for (const m of miss) out.push(`- "${m.text}"${m.count > 1 ? ` ×${m.count}` : ''} (last ${day(m.updatedAt)})`)
  if (!miss.length) out.push('- (none)')
  return out.join('\n') + '\n'
}
