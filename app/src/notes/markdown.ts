// Markdown export of highlights, notes and bookmarks (SPEC §4 "Export"). Pure: the caller resolves story titles and
// printed page labels.
export interface NoteEntry {
  kind: 'highlight' | 'bookmark'
  leaf: number
  /** printed page label (OCR page map) or leaf + 1 */
  page: string
  story: string | null
  text?: string
  note?: string | null
  color?: string
  /** highlight row id (for editing; not exported) */
  highlightId?: number
}

export interface NoteIssue {
  issueId: number
  /** e.g. "Amazing Stories — Apr 1926" */
  heading: string
  entries: NoteEntry[] // in reading order
}

const quote = (t: string) => t.trim().split(/\n+/).map((l) => `> ${l.trim()}`).join('\n')

export function issueMarkdown(issue: NoteIssue): string {
  const out: string[] = [`# ${issue.heading}`]
  let section = ''
  for (const e of issue.entries) {
    const head = `## p. ${e.page}${e.story ? ` — ${e.story}` : ''}`
    if (head !== section) {
      out.push('', head)
      section = head
    }
    if (e.kind === 'bookmark') {
      out.push('', '*Bookmark*')
      continue
    }
    out.push('', quote(e.text ?? ''))
    if (e.color && e.color !== 'yellow') out.push(`*(${e.color})*`)
    if (e.note?.trim()) out.push('', `Note: ${e.note.trim()}`)
  }
  return out.join('\n') + '\n'
}

export function notesMarkdown(issues: NoteIssue[]): string {
  return issues.filter((i) => i.entries.length).map(issueMarkdown).join('\n')
}

/** file name for an export: banca-notes-amazing-stories-apr-1926.md / banca-notes-2026-10-01.md */
export function exportFileName(issues: NoteIssue[], today = new Date()): string {
  const slug = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return issues.length === 1 ? `banca-notes-${slug(issues[0].heading)}.md` : `banca-notes-${today.toISOString().slice(0, 10)}.md`
}
