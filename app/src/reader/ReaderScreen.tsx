// Banca reader screen: page engine (ReaderController) + chrome, panels, page index, progress, annotations.
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  addHighlight, deleteHighlight, getPageMap, listBookmarks, listHighlights, savePageMap, setBookmark, updateHighlight,
  type Bookmark, type Highlight,
} from '../data/annotationRepo'
import { getContents, getIssue } from '../data/catalogRepo'
import { getProgress, saveProgress } from '../data/progressRepo'
import { useDb } from '../db/useDb'
import { useDownload, useNetworkState } from '../downloads/context'
import { useNav } from '../nav/context'
import { monthYear } from '../ui/format'
import { Icon } from '../ui/icons'
import { useSettings } from '../ui/settingsContext'
import { useAsync } from '../ui/useAsync'
import { nativeDisplay, setBrightness, setImmersive } from './display'
import type { PageInfo } from './engine/ia'
import { MetricsOverlay } from './MetricsOverlay'
import { computeStarts, pagesToEnd, storyAt, type StoryStart } from './layout'
import { computePageMap } from './pageMap'
import { gatherNotes } from '../notes/gather'
import { exportFileName, issueMarkdown } from '../notes/markdown'
import { copyText, searchWeb, shareMarkdown } from '../notes/share'
import { ColorDots, ContentsDrawer, DisplayPanel, HighlightCard, NotesDrawer, PageIndex, ReaderBottomBar } from './ReaderPanels'
import { ReaderController } from './ReaderController'
import './reader.css'

const SAVE_DEBOUNCE_MS = 800
type Panel = 'display' | 'contents' | 'notes' | 'pages' | null

function layoutFor() {
  const w = window.innerWidth
  const h = window.innerHeight
  return { spread: w > h && w >= 900, fitWidth: h > w && w < 600, compact: w < 600 }
}

export function ReaderScreen({ issueId, leaf = 0, storyId }: { issueId: number; leaf?: number; storyId?: number }) {
  const { catalog, user } = useDb()
  const nav = useNav()
  const { settings, update } = useSettings()
  const data = useAsync(async () => {
    const issue = await getIssue(catalog, issueId)
    if (!issue?.iaIdentifier) throw new Error('This issue has no scan on the Internet Archive.')
    const [contents, progress, printed] = await Promise.all([
      getContents(catalog, issueId), getProgress(user, issueId), getPageMap(user, issue.iaIdentifier)])
    return { issue, contents, progress, printed }
  }, [catalog, user, issueId])

  const viewport = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const ctl = useRef<ReaderController | null>(null)
  const [pages, setPages] = useState<PageInfo[]>([])
  const [localPages, setLocalPages] = useState(0)
  const download = useDownload(issueId)
  const { online } = useNetworkState()
  const [leaves, setLeaves] = useState<number[]>([])
  const [printed, setPrinted] = useState<(number | null)[] | null>(null)
  const [chrome, setChrome] = useState(true)
  const [panel, setPanel] = useState<Panel>(null)
  const [hasSel, setHasSel] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [card, setCard] = useState<{ id: number; editNote: boolean } | null>(null)
  const [lastColor, setLastColor] = useState('yellow')
  const [toast, setToast] = useState<string | null>(null)
  const [layout, setLayout] = useState(layoutFor)
  const moved = useRef(0)
  const pending = useRef<{ page: number } | null>(null)
  const timer = useRef(0)

  // ---- progress ---------------------------------------------------------------------------------------------
  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    const c = ctl.current
    if (!pending.current || !c) return
    pending.current = null
    const v = c.getView()
    void saveProgress(user, { issueId, page: c.leaves[0] ?? 0, offsetX: v.cx, offsetY: v.cy, zoom: v.zoom, pageCount: c.pageCount })
  }, [user, issueId])
  const scheduleSave = useCallback(() => {
    pending.current = { page: 0 }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, SAVE_DEBOUNCE_MS)
  }, [flush])

  // ---- engine lifecycle -------------------------------------------------------------------------------------
  useEffect(() => {
    if (data.status !== 'ok') return
    const { issue, progress } = data.data
    setPrinted(data.data.printed)
    const c = new ReaderController(viewport.current!, content.current!, issue.iaIdentifier!, {
      onReady: (p, local) => { setPages(p); setLocalPages(local) },
      onUnit: (ls) => { moved.current++; setLeaves(ls); scheduleSave() },
      onOcr: (ocr) => {
        if (data.data.printed) return
        const map = computePageMap(ocr)
        if (map.anchors < 3) return // no reliable page numbers in this scan
        setPrinted(map.printed)
        void savePageMap(user, issue.iaIdentifier!, map.printed, map.offset)
      },
      onCenterTap: () => { setCard(null); setPanel(null); setChrome((v) => !v) },
      onHighlightTap: (id) => { setPanel(null); setCard({ id, editNote: false }) },
      onView: scheduleSave,
      onError: setError,
    })
    ctl.current = c
    const l = layoutFor()
    const resume = progress && progress.page === leaf ? { zoom: progress.zoom, cx: progress.offsetX, cy: progress.offsetY } : undefined
    void c.init(leaf, { spread: l.spread, fitWidth: l.fitWidth, view: resume })
    return () => {
      flush()
      c.destroy()
      ctl.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one engine per opened issue
  }, [data.status])

  // annotations
  const reloadNotes = useCallback(async () => {
    setHighlights(await listHighlights(user, issueId))
    setBookmarks(await listBookmarks(user, issueId))
  }, [user, issueId])
  useEffect(() => { void reloadNotes() }, [reloadNotes])
  useEffect(() => { ctl.current?.setHighlights(highlights.map((h) => ({ id: h.id, page: h.page, rects: h.rects, color: h.color, note: !!h.note }))) }, [highlights, pages])

  // story starts, with leaves corrected by the OCR page map when available
  const starts = useMemo<StoryStart[]>(() => {
    if (data.status !== 'ok') return []
    return computeStarts(data.data.contents, printed, pages.length)
  }, [data, printed, pages.length])

  // opened from a story: once the page map corrects its leaf, jump there (unless the reader already moved)
  useEffect(() => {
    if (!storyId || moved.current > 1) return
    const s = starts.find((x) => x.id === storyId)
    if (s && ctl.current && !ctl.current.leaves.includes(s.leaf)) ctl.current.goLeaf(s.leaf)
  }, [starts, storyId])

  // ---- device: immersive, brightness, pause, resize ------------------------------------------------------------
  useEffect(() => {
    void setImmersive(true)
    return () => { void setImmersive(false); void setBrightness(null) }
  }, [])
  useEffect(() => { void setBrightness(settings.brightness) }, [settings.brightness])
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return
    const h = CapApp.addListener('pause', flush)
    return () => void h.then((x) => x.remove())
  }, [flush])
  useLayoutEffect(() => {
    let t = 0
    const onResize = () => {
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        // the on-screen keyboard (writing a note) shrinks the window: keep the layout
        if (document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement) return
        const l = layoutFor()
        setLayout(l)
        ctl.current?.setLayout(l.spread, l.fitWidth)
      }, 150)
    }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); window.clearTimeout(t) }
  }, [])

  // selection toolbar + keyboard (desktop dev)
  useEffect(() => {
    const onSel = () => {
      const sel = document.getSelection()
      setHasSel(!!sel && !sel.isCollapsed && !!content.current?.contains(sel.anchorNode))
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') ctl.current?.turn(1)
      if (e.key === 'ArrowLeft') ctl.current?.turn(-1)
    }
    document.addEventListener('selectionchange', onSel)
    window.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('selectionchange', onSel); window.removeEventListener('keydown', onKey) }
  }, [])

  // ---- actions --------------------------------------------------------------------------------------------------
  const thumb = useCallback((l: number, w: number) => ctl.current?.thumbUrl(l, w) ?? '', [])
  const goLeaf = useCallback((l: number) => { ctl.current?.goLeaf(l); setPanel(null) }, [])
  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(null), 1800) }
  const highlight = async (color: string, withNote = false) => {
    const sel = ctl.current?.selection()
    if (!sel) return
    setLastColor(color)
    const id = await addHighlight(user, { issueId, page: sel.leaf, rects: sel.rects, text: sel.text, color })
    document.getSelection()?.removeAllRanges()
    await reloadNotes()
    if (withNote) setCard({ id, editNote: true })
  }
  const copy = () => {
    void copyText(document.getSelection()?.toString() ?? '').then(() => flash('Copied'))
    document.getSelection()?.removeAllRanges()
  }
  const searchSelection = () => {
    const text = document.getSelection()?.toString() ?? ''
    document.getSelection()?.removeAllRanges()
    void searchWeb(text)
  }
  const cardHl = card ? highlights.find((h) => h.id === card.id) : undefined
  const editHighlight = async (id: number, p: { color?: string; note?: string }) => {
    if (p.color) setLastColor(p.color)
    await updateHighlight(user, id, p)
    await reloadNotes()
  }
  const exportIssue = async (mode: 'share' | 'copy') => {
    const [notes] = await gatherNotes(catalog, user, issueId)
    if (!notes) return
    const md = issueMarkdown(notes)
    if (mode === 'copy') { await copyText(md); flash('Markdown copied') }
    else await shareMarkdown(exportFileName([notes]), md, notes.heading)
  }
  const bookmarked = bookmarks.find((b) => leaves.includes(b.page))
  const toggleBookmark = async () => {
    if (!leaves.length) return
    await setBookmark(user, issueId, bookmarked?.page ?? leaves[0], !bookmarked)
    await reloadNotes()
  }
  const removeHighlight = async (id: number) => { setCard(null); await deleteHighlight(user, id); await reloadNotes() }
  const removeBookmark = async (page: number) => { await setBookmark(user, issueId, page, false); await reloadNotes() }
  const toggle = (p: Exclude<Panel, null>) => setPanel((cur) => (cur === p ? null : p))

  // ---- render -------------------------------------------------------------------------------------------------
  const issue = data.status === 'ok' ? data.data.issue : null
  const first = leaves[0] ?? 0
  const story = storyAt(starts, first)
  const label = (l: number) => (printed?.[l] ? String(printed[l]) : String(l + 1))
  const pageLabel = leaves.length ? `p. ${leaves.map(label).join('–')}` : ''
  const toEnd = story ? pagesToEnd(starts, leaves[leaves.length - 1] ?? first, pages.length) : 0
  const onDevice = pages.length > 0 && (localPages >= pages.length || download?.state === 'done')
  const failure = error ?? (data.status === 'error' ? data.error : null)
  const failureText = failure && !online && !onDevice
    ? "You're offline and this issue isn't downloaded. Download it from the issue page to read it without a connection."
    : failure
  const scanFilter = [
    settings.enhance ? 'grayscale(.2) contrast(1.45) brightness(1.06)' : '',
    settings.readerTheme === 'night' ? 'invert(.92) hue-rotate(180deg) sepia(.25) brightness(.9)' : '',
  ].join(' ').trim() || 'none'

  return (
    <div className={`reader ${chrome ? 'chrome' : ''}`} data-rtheme={settings.readerTheme}
         style={{ ['--scan-filter' as string]: scanFilter }}>
      <div ref={viewport} className="r-viewport"><div ref={content} className="r-content" /></div>
      {settings.warmth > 0 && <div className="r-warm" style={{ opacity: settings.warmth * 0.35 }} />}
      {!nativeDisplay && settings.brightness !== null && <div className="r-dim" style={{ opacity: (1 - settings.brightness) * 0.7 }} />}
      {!pages.length && !error && <div className="r-loading">LOADING…</div>}

      <button className="r-side prev" aria-label="Previous page" onClick={() => ctl.current?.turn(-1)}><Icon name="back" stroke={2.2} /></button>
      <button className="r-side next" aria-label="Next page" onClick={() => ctl.current?.turn(1)}><Icon name="forward" stroke={2.2} /></button>

      <header className="r-bar r-top">
        <button className="r-btn" aria-label="Back" onClick={nav.back}><Icon name="back" size={26} stroke={2.2} /></button>
        <div className="r-title">
          <div className="t">{story?.title ?? issue?.title ?? ''}{story?.credit && <span className="by"> — {story.credit}</span>}</div>
          <div className="s">{issue ? `${issue.title.replace(/,\s*\w+ \d{4}$/, '')} · ${monthYear(issue.year, issue.month)}` : ''}
            {story?.partInfo ? ` · ${story.partInfo}` : ''}
            {pages.length > 0 && !onDevice && (
              <span className={`r-net ${online ? '' : 'off'}`}>{online ? 'online' : localPages ? `offline · ${localPages} pages here` : 'offline'}</span>
            )}</div>
        </div>
        {!layout.compact && <>
          <button className={`r-btn ${panel === 'contents' ? 'on' : ''}`} aria-label="Contents" onClick={() => toggle('contents')}><Icon name="contents" /></button>
          <button className="r-btn" aria-label="Page index" onClick={() => toggle('pages')}><Icon name="pages" /></button>
          <button className={`r-btn ${panel === 'display' ? 'on' : ''}`} aria-label="Display" onClick={() => toggle('display')}><Icon name="light" /></button>
          <button className={`r-btn ${settings.enhance ? 'on' : ''}`} aria-label="Enhance text" onClick={() => update('enhance', !settings.enhance)}><Icon name="enhance" /></button>
          <button className={`r-btn ${panel === 'notes' ? 'on' : ''}`} aria-label="Highlights and bookmarks" onClick={() => toggle('notes')}><Icon name="highlight" /></button>
        </>}
        <button className="r-btn" aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark this page'} onClick={() => void toggleBookmark()}
                style={{ color: bookmarked ? '#F2B705' : undefined }}>
          <Icon name="bookmark" filled={!!bookmarked} />
        </button>
      </header>

      <ReaderBottomBar pages={pages} thumb={thumb} leaves={leaves} starts={starts} label={label} pageLabel={pageLabel}
                       storyEnd={story ? `${story.title} · ${toEnd <= 1 ? 'last page' : `${toEnd} pages to the end`}${story.partInfo ? ` of ${story.partInfo.replace(' of ', '/')}` : ''}` : ''}
                       compact={layout.compact} panel={panel} enhance={settings.enhance}
                       onGo={goLeaf} onToggle={toggle} onEnhance={() => update('enhance', !settings.enhance)} />

      {panel === 'display' && chrome && <DisplayPanel />}
      {panel === 'contents' && chrome && <ContentsDrawer starts={starts} current={story} label={label} onGo={goLeaf} />}
      {panel === 'notes' && chrome && (
        <NotesDrawer highlights={highlights} bookmarks={bookmarks} label={label} onGo={goLeaf}
                     onOpenHighlight={(h) => { goLeaf(h.page); setCard({ id: h.id, editNote: false }) }}
                     onDeleteBookmark={(p) => void removeBookmark(p)}
                     onExport={() => void exportIssue('share')} onCopy={() => void exportIssue('copy')} />
      )}
      {panel === 'pages' && issue && (
        <PageIndex pages={pages} thumb={thumb} starts={starts} current={leaves} label={label} compact={layout.compact}
                   title={`${issue.title.replace(/,\s*\w+ \d{4}$/, '')} · ${monthYear(issue.year, issue.month)} · ${pages.length} pages`}
                   printed={printed} onGo={goLeaf} onClose={() => setPanel(null)} />
      )}

      {hasSel && !card && (
        <div className="r-selbar">
          <div className="dots"><ColorDots value={lastColor} onPick={(c) => void highlight(c)} /></div>
          <button onClick={() => void highlight(lastColor, true)}>Note</button>
          <button onClick={searchSelection}>Search web</button>
          <button onClick={copy}>Copy</button>
        </div>
      )}
      {cardHl && card && (
        <HighlightCard key={cardHl.id} h={cardHl} pageLabel={label(cardHl.page)} editNote={card.editNote}
                       onColor={(c) => void editHighlight(cardHl.id, { color: c })}
                       onNote={(n) => void editHighlight(cardHl.id, { note: n })}
                       onSearch={() => void searchWeb(cardHl.text)}
                       onCopy={() => void copyText(cardHl.text).then(() => flash('Copied'))}
                       onDelete={() => void removeHighlight(cardHl.id)} onClose={() => setCard(null)} />
      )}
      {toast && <div className="r-toast">{toast}</div>}
      {failureText && <div className="r-error">{failureText}</div>}
      {settings.perfOverlay && <MetricsOverlay />}
    </div>
  )
}
