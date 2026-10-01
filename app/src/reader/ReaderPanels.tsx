import { useEffect, useMemo, useRef, useState } from 'react'
import { HIGHLIGHT_COLORS, type Bookmark, type Highlight } from '../data/annotationRepo'
import { HIGHLIGHT_HEX } from '../ui/format'
import type { ReaderTheme } from '../data/settingsRepo'
import { Icon } from '../ui/icons'
import { useSettings } from '../ui/settingsContext'
import { INDEX_THUMB_WIDTH, THUMB_WIDTH } from './engine/config'
import type { PageInfo } from './engine/ia'
import { storyAt, type StoryStart } from './layout'

type Panel = 'display' | 'contents' | 'notes' | 'pages' | null
/** thumbnail URL for a leaf at a width (downloaded copy when present) */
export type Thumb = (leaf: number, width: number) => string

// ---- bottom bar: thumbnails, slider with story ticks, page labels (+ tool row on phones) --------------------------

export function ReaderBottomBar({ pages, thumb, leaves, starts, label, pageLabel, storyEnd, compact, panel, enhance, onGo, onToggle, onEnhance }: {
  pages: PageInfo[]; thumb: Thumb; leaves: number[]; starts: StoryStart[]; label: (l: number) => string; pageLabel: string; storyEnd: string
  compact: boolean; panel: Panel; enhance: boolean
  onGo: (leaf: number) => void; onToggle: (p: Exclude<Panel, null>) => void; onEnhance: () => void
}) {
  const [scrub, setScrub] = useState<number | null>(null)
  const n = pages.length
  const first = leaves[0] ?? 0
  const value = scrub ?? first
  const span = compact ? 4 : 7
  const strip = useMemo(() => {
    const from = Math.max(0, first - span)
    const to = Math.min(n - 1, (leaves[leaves.length - 1] ?? first) + span)
    return Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i)
  }, [first, leaves, n, span])
  const pct = n > 1 ? (value / (n - 1)) * 100 : 0
  const commit = () => { if (scrub !== null) { onGo(scrub); setScrub(null) } }
  const scrubStory = scrub !== null ? storyAt(starts, scrub) : null

  return (
    <footer className="r-bar r-bottom">
      <div className="r-strip">
        {strip.map((l) => (
          <button key={l} className={leaves.includes(l) ? 'cur' : ''} aria-label={`Page ${label(l)}`} onClick={() => onGo(l)}>
            {pages[l] && <img src={thumb(l, THUMB_WIDTH)} alt="" loading="lazy" decoding="async" draggable={false} />}
          </button>
        ))}
      </div>
      <div className="r-slider">
        <div className="track" />
        <div className="fill" style={{ width: `${pct}%` }} />
        {n > 1 && starts.map((s) => <div key={s.id} className="tick" style={{ left: `${(s.leaf / (n - 1)) * 100}%` }} />)}
        <input type="range" min={0} max={Math.max(0, n - 1)} step={1} value={value} aria-label="Page"
               onChange={(e) => setScrub(Number(e.target.value))} onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
      </div>
      <div className="r-meta">
        {scrub !== null
          ? <span><b>p. {label(scrub)}</b> / {n}{scrubStory ? ` · ${scrubStory.title}` : ''}</span>
          : <span><b>{pageLabel}</b> / {n}</span>}
        {!compact && scrub === null && <span>{storyEnd}</span>}
      </div>
      {compact && (
        <div className="r-tools">
          <button className={panel === 'contents' ? 'on' : ''} onClick={() => onToggle('contents')}><Icon name="contents" />Contents</button>
          <button onClick={() => onToggle('pages')}><Icon name="pages" />Pages</button>
          <button className={panel === 'display' ? 'on' : ''} onClick={() => onToggle('display')}><Icon name="light" />Display</button>
          <button className={enhance ? 'on' : ''} onClick={onEnhance}><Icon name="enhance" />Enhance</button>
          <button className={panel === 'notes' ? 'on' : ''} onClick={() => onToggle('notes')}><Icon name="highlight" />Notes</button>
        </div>
      )}
    </footer>
  )
}

// ---- display: reading theme, brightness, warm filter, enhance text ------------------------------------------------

const THEMES: { key: ReaderTheme; label: string; swatch: string }[] = [
  { key: 'paper', label: 'Paper', swatch: '#F3E8CF' }, { key: 'sepia', label: 'Sepia', swatch: '#E6D2A6' },
  { key: 'night', label: 'Night', swatch: '#1C1A16' },
]

export function DisplayPanel() {
  const { settings, update } = useSettings()
  const auto = settings.brightness === null
  return (
    <div className="r-panel r-display">
      <h3>Display</h3>
      <div className="seg">
        {THEMES.map((t) => (
          <button key={t.key} className={settings.readerTheme === t.key ? 'on' : ''} onClick={() => update('readerTheme', t.key)}>
            <span className="sw" style={{ background: t.swatch }} />{t.label}
          </button>
        ))}
      </div>
      <div>
        <div className="row"><span>Brightness</span><span className="num" style={{ color: '#5E4E3A' }}>{auto ? 'System' : `${Math.round(settings.brightness! * 100)}%`}</span></div>
        <input type="range" min={5} max={100} value={Math.round((settings.brightness ?? 0.7) * 100)} aria-label="Brightness"
               onChange={(e) => update('brightness', Number(e.target.value) / 100)} />
        <label className="switch" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={auto} onChange={(e) => update('brightness', e.target.checked ? null : 0.7)} />
          <span className="track" />Use system brightness
        </label>
      </div>
      <div>
        <div className="row"><span>Warm filter</span><span className="num" style={{ color: '#5E4E3A' }}>{Math.round(settings.warmth * 100)}%</span></div>
        <input className="warm" type="range" min={0} max={100} value={Math.round(settings.warmth * 100)} aria-label="Warm filter"
               onChange={(e) => update('warmth', Number(e.target.value) / 100)} />
      </div>
      <label className="switch enh">
        <span className="txt"><b>Enhance text</b><span className="sub">Darkens worn letters on old scans</span></span>
        <input type="checkbox" checked={settings.enhance} onChange={(e) => update('enhance', e.target.checked)} />
        <span className="track" />
      </label>
    </div>
  )
}

// ---- contents drawer ----------------------------------------------------------------------------------------------

export function ContentsDrawer({ starts, current, label, onGo }: {
  starts: StoryStart[]; current: StoryStart | null; label: (l: number) => string; onGo: (leaf: number) => void
}) {
  return (
    <aside className="r-panel r-drawer">
      <h3>Contents</h3>
      {starts.length === 0 && <p className="empty">No contents listed for this issue.</p>}
      {starts.map((s) => (
        <button key={s.id} className={`item ${current?.id === s.id ? 'cur' : ''}`} onClick={() => onGo(s.leaf)}>
          <span className="pg-no">{label(s.leaf)}</span>
          <span><span className="ti">{s.title}{s.partInfo ? ` (${s.partInfo})` : ''}</span><span className="au">{s.credit}</span></span>
          <span />
        </button>
      ))}
    </aside>
  )
}

// ---- highlights + bookmarks ---------------------------------------------------------------------------------------

export function NotesDrawer({ highlights, bookmarks, label, onGo, onOpenHighlight, onDeleteBookmark, onExport, onCopy }: {
  highlights: Highlight[]; bookmarks: Bookmark[]; label: (l: number) => string; onGo: (leaf: number) => void
  onOpenHighlight: (h: Highlight) => void; onDeleteBookmark: (page: number) => void
  onExport: () => void; onCopy: () => void
}) {
  const empty = !highlights.length && !bookmarks.length
  return (
    <aside className="r-panel r-drawer right">
      <h3>Notes</h3>
      {!empty && (
        <div className="export">
          <button onClick={onExport}><Icon name="share" size={18} />Export Markdown</button>
          <button onClick={onCopy}><Icon name="copy" size={18} />Copy</button>
        </div>
      )}
      <h4>Bookmarks</h4>
      {bookmarks.length === 0 && <p className="empty">Tap the bookmark in the top bar to mark a page.</p>}
      {bookmarks.map((b) => (
        <div key={b.page} className="item" role="button" onClick={() => onGo(b.page)}>
          <span className="pg-no">{label(b.page)}</span>
          <span className="ti">Page {label(b.page)}</span>
          <button className="del" aria-label="Remove bookmark" onClick={(e) => { e.stopPropagation(); onDeleteBookmark(b.page) }}><Icon name="trash" size={20} /></button>
        </div>
      ))}
      <h4>Highlights</h4>
      {highlights.length === 0 && <p className="empty">Long-press text on a page, then pick a color.</p>}
      {highlights.map((h) => (
        <div key={h.id} className="item" role="button" onClick={() => onGo(h.page)}>
          <span className="pg-no">{label(h.page)}</span>
          <span>
            <span className="quote" style={{ ['--hlc' as string]: HIGHLIGHT_HEX[h.color] }}>“{h.text.length > 180 ? `${h.text.slice(0, 180)}…` : h.text}”</span>
            {h.note && <span className="note">{h.note}</span>}
          </span>
          <button className="del" aria-label="Edit highlight" onClick={(e) => { e.stopPropagation(); onOpenHighlight(h) }}><Icon name="edit" size={20} /></button>
        </div>
      ))}
    </aside>
  )
}

// ---- page index ---------------------------------------------------------------------------------------------------

export function PageIndex({ pages, thumb, starts, current, label, printed, title, compact, onGo, onClose }: {
  pages: PageInfo[]; thumb: Thumb; starts: StoryStart[]; current: number[]; label: (l: number) => string; printed: (number | null)[] | null
  title: string; compact: boolean; onGo: (leaf: number) => void; onClose: () => void
}) {
  const startAt = useMemo(() => new Map(starts.map((s) => [s.leaf, s])), [starts])
  const curRef = useRef<HTMLButtonElement>(null)
  const [goTo, setGoTo] = useState('')
  useEffect(() => { curRef.current?.scrollIntoView({ block: 'center' }) }, [])
  const jump = () => {
    const p = Number(goTo)
    if (!p) return
    const leaf = printed?.indexOf(p) ?? -1
    onGo(leaf >= 0 ? leaf : Math.min(pages.length - 1, Math.max(0, p - 1)))
  }
  const current0 = current[0] ?? 0
  const cell = (l: number) => {
    const s = startAt.get(l)
    const cur = current.includes(l)
    return (
      <button key={l} ref={cur && l === current0 ? curRef : undefined} className={`thumb ${s ? 'start' : ''} ${cur ? 'cur' : ''}`} onClick={() => onGo(l)}>
        <span className="im"><img src={thumb(l, INDEX_THUMB_WIDTH)} alt="" loading="lazy" decoding="async" draggable={false} /></span>
        <span className="lb">{s ? s.title : label(l)}</span>
      </button>
    )
  }
  // phones: grouped by story; tablets: one grid + story list on the left
  const groups = useMemo(() => {
    const out: { head: string | null; leaves: number[] }[] = []
    let cur: { head: string | null; leaves: number[] } = { head: null, leaves: [] }
    pages.forEach((_, l) => {
      const s = startAt.get(l)
      if (s) { if (cur.leaves.length) out.push(cur); cur = { head: s.title, leaves: [] } }
      cur.leaves.push(l)
    })
    if (cur.leaves.length) out.push(cur)
    return out
  }, [pages, startAt])

  return (
    <div className="r-pages">
      <header>
        <button className="r-btn" aria-label="Close page index" onClick={onClose}><Icon name="close" size={26} stroke={2.2} /></button>
        <div className="ttl">PAGES</div>
        <div className="sub">{title}</div>
        <span className="mast-spacer" />
        <label>Go to page
          <input type="number" inputMode="numeric" value={goTo} onChange={(e) => setGoTo(e.target.value)}
                 onKeyDown={(e) => { if (e.key === 'Enter') jump() }} aria-label="Page number" />
        </label>
      </header>
      <div className="body">
        <nav aria-label="Stories in this issue">
          <div className="lbl">Jump to a story</div>
          {starts.map((s) => (
            <button key={s.id} className={storyAt(starts, current0)?.id === s.id ? 'cur' : ''} onClick={() => onGo(s.leaf)}>
              <span className="no">{label(s.leaf)}</span><span className="ti">{s.title}</span>
            </button>
          ))}
        </nav>
        <div className="grid-wrap">
          <div className="legend">
            <span><i style={{ borderColor: 'var(--pulp-red)' }} />Story starts</span>
            <span><i style={{ borderColor: 'var(--pulp-yellow)', background: '#2A2118' }} />You are here</span>
          </div>
          <div className="grid">
            {compact
              ? groups.map((g, i) => [
                g.head ? <div key={`h${i}`} className="group-head">{g.head}</div> : null,
                ...g.leaves.map(thumb),
              ])
              : pages.map((_, l) => cell(l))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---- highlight card: color, note, search, copy, delete -------------------------------------------------------------

export function ColorDots({ value, onPick }: { value?: string; onPick: (c: string) => void }) {
  return (
    <>
      {HIGHLIGHT_COLORS.map((c) => (
        <button key={c} className={`swatch-dot ${value === c ? 'on' : ''}`} data-c={c} aria-label={`${c} highlight`}
                onClick={() => onPick(c)} />
      ))}
    </>
  )
}

export function HighlightCard({ h, pageLabel, editNote, onColor, onNote, onSearch, onCopy, onDelete, onClose }: {
  h: Highlight; pageLabel: string; editNote: boolean
  onColor: (c: string) => void; onNote: (note: string) => void; onSearch: () => void; onCopy: () => void
  onDelete: () => void; onClose: () => void
}) {
  const [note, setNote] = useState(h.note ?? '')
  const [writing, setWriting] = useState(editNote || !!h.note)
  const [confirm, setConfirm] = useState(false)
  const done = () => {
    if (note.trim() !== (h.note ?? '')) onNote(note)
    onClose()
  }
  return (
    <div className="r-hlcard" role="dialog" aria-label="Highlight">
      <div className="quote" style={{ ['--hlc' as string]: HIGHLIGHT_HEX[h.color] }}>“{h.text}”</div>
      <div className="row">
        <ColorDots value={h.color} onPick={onColor} />
        <span className="muted small">p. {pageLabel}</span>
      </div>
      {writing && (
        <textarea value={note} placeholder="Write a note…" autoFocus={editNote}
                  onChange={(e) => setNote(e.target.value)} onBlur={() => { if (note.trim() !== (h.note ?? '')) onNote(note) }} />
      )}
      <div className="acts">
        {!writing && <button onClick={() => setWriting(true)}><Icon name="edit" size={18} />Note</button>}
        <button onClick={onSearch}><Icon name="search" size={18} />Search web</button>
        <button onClick={onCopy}><Icon name="copy" size={18} />Copy</button>
        <button className="danger" onClick={() => (confirm ? onDelete() : setConfirm(true))}>
          <Icon name="trash" size={18} />{confirm ? 'Tap to delete' : 'Delete highlight'}
        </button>
        <span className="sp" />
        <button className="primary" onClick={done}>Done</button>
      </div>
    </div>
  )
}
