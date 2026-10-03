// Timeline of a subject and the curator inbox export (pure, tested).
import type { AtlasGraph, InboxItem } from '../data/atlasRepo'

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
