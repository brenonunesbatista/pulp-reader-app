import type { ReactNode } from 'react'
import type { Credit, IssueSummary, Story, StoryInIssue } from '../data/models'
import { useNav } from '../nav/context'
import { DownloadBadge } from './DownloadBadge'
import { coverUrl, monthYear, typeTagClass } from './format'
import { Icon } from './icons'
import { useSizeClass } from './sizeClass'

// ---- covers ---------------------------------------------------------------------------------------------------------

export function Cover({ path, alt = '', tag, noScan = false, stamp = false, small = false, eager = false, dl }: {
  path: string | null; alt?: string; tag?: string; noScan?: boolean; stamp?: boolean; small?: boolean; eager?: boolean
  /** issue id: show its download badge */
  dl?: number
}) {
  const src = coverUrl(path)
  return (
    <span className={`cover ${small ? 'small' : ''} ${noScan ? 'noscan' : ''}`}>
      <span className={`cover-art ${src ? '' : 'missing'}`}>
        {src && <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} decoding="async" draggable={false} />}
      </span>
      {tag && !noScan && <span className="price-tag">{tag}</span>}
      {noScan && <span className="noscan-band">NO SCAN</span>}
      {stamp && <span className="stamp">READABLE</span>}
      {dl !== undefined && !noScan && <DownloadBadge issueId={dl} />}
    </span>
  )
}


export function IssueCard({ issue, onOpen, meta }: { issue: IssueSummary; onOpen: () => void; meta?: ReactNode }) {
  const noScan = issue.availability !== 'ia'
  return (
    <button className="issue-card" onClick={onOpen}>
      <Cover path={issue.coverPath} alt={issue.title} noScan={noScan} dl={issue.id} />
      <span className="date num">{monthYear(issue.year, issue.month)}</span>
      <span className="meta">{meta ?? issue.coverArtist ?? '—'}</span>
      {issue.storyCount > 0 && <span className="meta num">{issue.storyCount} items</span>}
    </button>
  )
}

// ---- headings & chrome --------------------------------------------------------------------------------------------

export function SectionHeader({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      <span className="rule" />
      {aside}
    </div>
  )
}

export type Section = 'pulp' | 'rpg' | 'atlas' | 'search' | null

/** Full masthead (Library): wordmark, section tabs, search, settings. On phones the tabs move to the bottom nav. */
export function Masthead({ section, children }: { section: Section; children?: ReactNode }) {
  const nav = useNav()
  const compact = useSizeClass() === 'compact'
  return (
    <header className="masthead">
      <button className="wordmark" onClick={() => nav.reset({ name: 'library' })}>BANCA</button>
      {!compact && <SectionTabs section={section} />}
      {children ?? (
        <button className="mast-search" onClick={() => nav.push({ name: 'search' })}>
          <Icon name="search" size={20} />
          <span className="placeholder">{compact ? 'Search…' : 'Search titles, authors, editors, cover artists, translators…'}</span>
        </button>
      )}
      <button className="sq-btn" aria-label="Notes and highlights" onClick={() => nav.push({ name: 'notes' })}>
        <Icon name="highlight" size={22} />
      </button>
      <button className="sq-btn" aria-label="Settings" onClick={() => nav.push({ name: 'settings' })}>
        <Icon name="settings" size={22} />
      </button>
    </header>
  )
}

function SectionTabs({ section }: { section: Section }) {
  const nav = useNav()
  return (
    <nav className="tabs">
      <button className={`tab ${section === 'pulp' ? 'on' : ''}`} onClick={() => nav.reset({ name: 'library' })}>PULP</button>
      <button className={`tab ${section === 'rpg' ? 'on' : ''}`} onClick={() => nav.push({ name: 'soon', what: 'rpg' })}>RPG</button>
      <button className={`tab ${section === 'atlas' ? 'on' : ''}`} onClick={() => nav.push({ name: 'soon', what: 'atlas' })}>ATLAS</button>
    </nav>
  )
}

/** Slim masthead for inner screens: back, title, optional subtitle and actions. */
export function SubMasthead({ title, sub, children }: { title?: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  const nav = useNav()
  return (
    <header className="masthead slim">
      {nav.depth > 1 && (
        <button className="sq-btn" aria-label="Back" onClick={nav.back}><Icon name="back" stroke={2.2} /></button>
      )}
      {title && <div className="masthead-title">{title}</div>}
      {sub && <div className="masthead-sub">{sub}</div>}
      <span className="mast-spacer" />
      {children}
    </header>
  )
}

/** Phone bottom navigation (Pulp · RPG · Atlas · Search). */
export function BottomNav({ section }: { section: Section }) {
  const nav = useNav()
  const items: { key: Exclude<Section, null>; label: string; icon: Parameters<typeof Icon>[0]['name']; go: () => void }[] = [
    { key: 'pulp', label: 'PULP', icon: 'pulp', go: () => nav.reset({ name: 'library' }) },
    { key: 'rpg', label: 'RPG', icon: 'dice', go: () => nav.push({ name: 'soon', what: 'rpg' }) },
    { key: 'atlas', label: 'ATLAS', icon: 'atlas', go: () => nav.push({ name: 'soon', what: 'atlas' }) },
    { key: 'search', label: 'SEARCH', icon: 'search', go: () => nav.push({ name: 'search' }) },
  ]
  return (
    <nav className="bottom-nav">
      {items.map((it) => (
        <button key={it.key} className={section === it.key ? 'on' : ''} onClick={section === it.key ? undefined : it.go}>
          <Icon name={it.icon} size={22} />{it.label}
        </button>
      ))}
    </nav>
  )
}

/** Screen frame: masthead + scrolling body (+ bottom nav on phones). */
export function Screen({ masthead, section = null, children }: { masthead: ReactNode; section?: Section; children: ReactNode }) {
  const compact = useSizeClass() === 'compact'
  return (
    <div className={`screen ${compact ? 'has-bottom-nav' : ''}`}>
      {masthead}
      <main className="screen-body">{children}</main>
      {compact && <BottomNav section={section} />}
    </div>
  )
}

// ---- contents -------------------------------------------------------------------------------------------------------


export function TypeTag({ story }: { story: Pick<Story, 'typeCode' | 'typeLabel' | 'partInfo'> }) {
  const cls = typeTagClass(story)
  const label = cls === 'serial' ? 'Serial' : story.typeLabel ?? story.typeCode ?? ''
  return label ? <span className={`type-tag ${cls}`}>{label}</span> : null
}

export function Credits({ credits }: { credits: Credit[] }) {
  const nav = useNav()
  if (!credits.length) return null
  return (
    <>
      {credits.map((c, i) => (
        <span key={`${c.personId}-${c.role}`}>
          {i > 0 && (c.role === 'translator' ? '; tr. ' : ', ')}
          <button className="person-link" onClick={(e) => { e.stopPropagation(); nav.push({ name: 'person', id: c.personId }) }}>
            {c.name}
          </button>
        </span>
      ))}
    </>
  )
}

/** One contents line: page · title (part) · credits · type tag. Tapping opens the reader at the story. */
export function StoryRow({ story, showIssue = false, current = false, note, onOpen }: {
  story: StoryInIssue; showIssue?: boolean; current?: boolean; note?: string; onOpen?: (s: StoryInIssue) => void
}) {
  const readable = !!story.issue.iaIdentifier
  return (
    <div className={`story-row ${current ? 'current' : ''} ${readable ? '' : 'unreadable'}`} role={readable ? 'button' : undefined}
         onClick={() => readable && onOpen?.(story)}>
      <span className="story-page num">{story.pagePrinted ?? ''}</span>
      <span>
        <span className="title" style={{ display: 'block' }}>
          {story.title}{story.partInfo && <span className="muted"> ({story.partInfo})</span>}
        </span>
        <span className="sub">
          <Credits credits={story.credits} />
          {showIssue && <> · {monthYear(story.issue.year, story.issue.month)}</>}
          {note && <span className="note">  · {note}</span>}
        </span>
      </span>
      <TypeTag story={story} />
    </div>
  )
}

export function Loading() {
  return <div className="loading">Loading…</div>
}

export function ErrorBox({ error }: { error: string }) {
  return <div className="error-box">{error}</div>
}
