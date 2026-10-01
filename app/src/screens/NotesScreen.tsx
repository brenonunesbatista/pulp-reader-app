import { useMemo, useState } from 'react'
import { deleteHighlight, HIGHLIGHT_COLORS, setBookmark } from '../data/annotationRepo'
import type { NoteEntry } from '../notes/markdown'
import { useDb } from '../db/useDb'
import { useIsActive, useNav } from '../nav/context'
import { gatherNotes } from '../notes/gather'
import { cleanText, exportFileName, notesMarkdown } from '../notes/markdown'
import { copyText, shareMarkdown } from '../notes/share'
import { ErrorBox, Loading, Screen, SectionHeader, SubMasthead } from '../ui/components'
import { HIGHLIGHT_HEX } from '../ui/format'
import { Icon } from '../ui/icons'
import { useAsync } from '../ui/useAsync'

/** Every highlight, note and bookmark across issues: search, color filter, open in the reader, export. */
export function NotesScreen() {
  const { catalog, user } = useDb()
  const nav = useNav()
  const active = useIsActive()
  const [tick, setTick] = useState(0)
  const data = useAsync(() => gatherNotes(catalog, user), [catalog, user, active, tick])
  const [q, setQ] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null) // entry key awaiting the second tap
  const remove = async (issueId: number, e: NoteEntry, key: string) => {
    if (confirm !== key) return setConfirm(key)
    setConfirm(null)
    if (e.kind === 'bookmark') await setBookmark(user, issueId, e.leaf, false)
    else if (e.highlightId !== undefined) await deleteHighlight(user, e.highlightId)
    setTick((t) => t + 1)
  }

  const shown = useMemo(() => {
    if (data.status !== 'ok') return []
    const needle = q.trim().toLowerCase()
    const filtering = !!needle || !!color
    return data.data.map((i) => ({
      ...i,
      entries: i.entries.filter((e) => {
        if (filtering && e.kind === 'bookmark') return false
        if (color && e.color !== color) return false
        return !needle || `${e.text ?? ''} ${e.note ?? ''} ${e.story ?? ''}`.toLowerCase().includes(needle)
      }),
    })).filter((i) => i.entries.length)
  }, [data, q, color])

  const exportShown = async (mode: 'share' | 'copy') => {
    const md = notesMarkdown(shown)
    if (mode === 'copy') {
      await copyText(md)
      setMsg('Markdown copied')
      window.setTimeout(() => setMsg(null), 1800)
    } else {
      await shareMarkdown(exportFileName(shown), md, 'Banca notes')
    }
  }
  const total = shown.reduce((n, i) => n + i.entries.filter((e) => e.kind === 'highlight').length, 0)

  return (
    <Screen masthead={<SubMasthead title="Notes" />}>
      {data.status === 'loading' && <Loading />}
      {data.status === 'error' && <ErrorBox error={data.error} />}
      {data.status === 'ok' && data.data.length === 0 && (
        <p className="muted">No highlights yet. In the reader, long-press text and pick a color; tap the bookmark to mark a page.</p>
      )}
      {data.status === 'ok' && data.data.length > 0 && (
        <>
          <div className="filter-band">
            <div className="chips">
              <input className="chip notes-search" type="search" placeholder="Search highlights and notes…" value={q}
                     onChange={(e) => setQ(e.target.value)} />
              <button className={`chip ${color === null ? 'on' : ''}`} onClick={() => setColor(null)}>All</button>
              {HIGHLIGHT_COLORS.map((c) => (
                <button key={c} className={`chip ${color === c ? 'on' : ''}`} onClick={() => setColor(color === c ? null : c)}
                        aria-label={`${c} highlights`}>
                  <span className="color-chip" style={{ background: HIGHLIGHT_HEX[c] }} />
                </button>
              ))}
              <span className="mast-spacer" />
              <button className="chip" disabled={!shown.length} onClick={() => void exportShown('share')}><Icon name="share" size={18} />Export</button>
              <button className="chip" disabled={!shown.length} onClick={() => void exportShown('copy')}><Icon name="copy" size={18} />Copy</button>
            </div>
            <div className="muted small num">
              {msg ?? `${total} ${total === 1 ? 'highlight' : 'highlights'} in ${shown.length} ${shown.length === 1 ? 'issue' : 'issues'}${q || color ? ' (filtered)' : ''}`}
            </div>
          </div>
          {shown.map((i) => (
            <section key={i.issueId} className="notes-issue">
              <SectionHeader title={i.heading} aside={
                <button className="person-link" onClick={() => nav.push({ name: 'issue', id: i.issueId })}>Issue</button>} />
              {i.entries.map((e, k) => (
                <div key={k} className={`note-row ${e.kind}`} role="button" tabIndex={0}
                     style={{ ['--hlc' as string]: HIGHLIGHT_HEX[e.color ?? 'yellow'] }}
                     onClick={() => nav.push({ name: 'reader', issueId: i.issueId, leaf: e.leaf })}>
                  <div className="meta num">
                    <span>p. {e.page}{e.story ? ` · ${e.story}` : ''}{e.kind === 'bookmark' ? ' · Bookmark' : ''}</span>
                    <button className={`note-del ${confirm === `${i.issueId}-${k}` ? 'confirm' : ''}`}
                            aria-label={e.kind === 'bookmark' ? 'Delete bookmark' : 'Delete highlight'}
                            onBlur={() => setConfirm(null)}
                            onClick={(ev) => { ev.stopPropagation(); void remove(i.issueId, e, `${i.issueId}-${k}`) }}>
                      {confirm === `${i.issueId}-${k}` ? 'Delete?' : <Icon name="trash" size={18} />}
                    </button>
                  </div>
                  {e.text && <p className="text">{cleanText(e.text)}</p>}
                  {e.note && <p className="note"><Icon name="edit" size={15} /> {e.note}</p>}
                </div>
              ))}
            </section>
          ))}
          {shown.length === 0 && <p className="muted">Nothing matches.</p>}
        </>
      )}
    </Screen>
  )
}
