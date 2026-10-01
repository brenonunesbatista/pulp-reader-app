import { useMemo, useState } from 'react'
import { HIGHLIGHT_COLORS } from '../data/annotationRepo'
import { useDb } from '../db/useDb'
import { useIsActive, useNav } from '../nav/context'
import { gatherNotes } from '../notes/gather'
import { exportFileName, notesMarkdown } from '../notes/markdown'
import { copyText, shareMarkdown } from '../notes/share'
import { Cover, ErrorBox, Loading, Screen, SectionHeader, SubMasthead } from '../ui/components'
import { HIGHLIGHT_HEX } from '../ui/format'
import { Icon } from '../ui/icons'
import { useAsync } from '../ui/useAsync'

/** Every highlight, note and bookmark across issues: search, color filter, open in the reader, export. */
export function NotesScreen() {
  const { catalog, user } = useDb()
  const nav = useNav()
  const active = useIsActive()
  const data = useAsync(() => gatherNotes(catalog, user), [catalog, user, active])
  const [q, setQ] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

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
              <SectionHeader title={i.heading} />
              <div className="notes-body">
                <button className="notes-cover" onClick={() => nav.push({ name: 'issue', id: i.issueId })} aria-label={`Open ${i.heading}`}>
                  <Cover path={i.issue.coverPath} alt={i.heading} small />
                </button>
                <div className="notes-list">
                  {i.entries.map((e, k) => (
                    <button key={k} className="note-row" onClick={() => nav.push({ name: 'reader', issueId: i.issueId, leaf: e.leaf })}>
                      <span className="pg num">p. {e.page}</span>
                      <span>
                        {e.story && <span className="story">{e.story}</span>}
                        {e.kind === 'bookmark'
                          ? <span className="bm"><Icon name="bookmark" size={16} filled /> Bookmark</span>
                          : <span className="quote" style={{ ['--hlc' as string]: HIGHLIGHT_HEX[e.color ?? 'yellow'] }}>“{e.text}”</span>}
                        {e.note && <span className="note">{e.note}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ))}
          {shown.length === 0 && <p className="muted">Nothing matches.</p>}
        </>
      )}
    </Screen>
  )
}
