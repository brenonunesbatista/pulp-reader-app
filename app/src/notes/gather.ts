// Collects highlights + bookmarks with story titles and printed page labels (Notes screen, Markdown export).
import { getPageMap, listAllBookmarks, listAllHighlights } from '../data/annotationRepo'
import { getContents, getIssuesByIds } from '../data/catalogRepo'
import type { IssueSummary } from '../data/models'
import type { Db } from '../db/types'
import { computeStarts, storyAt } from '../reader/layout'
import { monthYear } from '../ui/format'
import type { NoteEntry, NoteIssue } from './markdown'

export interface NotesIssue extends NoteIssue {
  issue: IssueSummary
}

export const issueHeading = (i: Pick<IssueSummary, 'title' | 'year' | 'month'>) =>
  `${i.title.replace(/,\s*\w+ \d{4}$/, '')} — ${monthYear(i.year, i.month)}`

/** all issues with notes (or only `onlyIssue`), most recently annotated first */
export async function gatherNotes(catalog: Db, user: Db, onlyIssue?: number): Promise<NotesIssue[]> {
  const [hls, bms] = await Promise.all([listAllHighlights(user), listAllBookmarks(user)])
  const keep = (id: number) => onlyIssue === undefined || id === onlyIssue
  const ids = [...new Set([...hls.map((h) => h.issueId), ...bms.map((b) => b.issueId)])].filter(keep)
  const latest = new Map<number, number>()
  for (const x of [...hls, ...bms]) latest.set(x.issueId, Math.max(latest.get(x.issueId) ?? 0, x.createdAt))
  ids.sort((a, b) => (latest.get(b) ?? 0) - (latest.get(a) ?? 0))
  const issues = await getIssuesByIds(catalog, ids)
  return Promise.all(issues.map(async (issue) => {
    const printed = issue.iaIdentifier ? await getPageMap(user, issue.iaIdentifier) : null
    const starts = computeStarts(await getContents(catalog, issue.id), printed, 0)
    const label = (leaf: number) => String(printed?.[leaf] ?? leaf + 1)
    const story = (leaf: number) => storyAt(starts, leaf)?.title ?? null
    const entries: (NoteEntry & { order: number })[] = [
      ...hls.filter((h) => h.issueId === issue.id).map((h) => ({
        kind: 'highlight' as const, leaf: h.page, page: label(h.page), story: story(h.page), text: h.text, note: h.note,
        color: h.color, highlightId: h.id, order: h.page * 10 + 1 + (h.rects[0]?.[1] ?? 0) })),
      // a bookmark comes first on its page
      ...bms.filter((b) => b.issueId === issue.id).map((b) => ({
        kind: 'bookmark' as const, leaf: b.page, page: label(b.page), story: story(b.page), order: b.page * 10 })),
    ]
    entries.sort((a, b) => a.order - b.order)
    return { issueId: issue.id, heading: issueHeading(issue), issue, entries: entries.map(({ order: _o, ...e }) => e) }
  }))
}
