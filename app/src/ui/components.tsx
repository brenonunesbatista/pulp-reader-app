import type { ReactNode } from 'react'
import type { Credit, IssueSummary, StoryInIssue } from '../data/models'
import { useNav } from '../nav/context'
import { coverUrl, monthYear } from './format'

export function TopBar({ title, children, back = true }: { title?: ReactNode; children?: ReactNode; back?: boolean }) {
  const nav = useNav()
  return (
    <header className="topbar-app">
      {back && nav.depth > 1 && <button className="icon-btn" onClick={nav.back} aria-label="Back">‹</button>}
      {title && <h1 className="topbar-title">{title}</h1>}
      <div className="topbar-actions">{children}</div>
    </header>
  )
}

export function Cover({ path, className = '', alt = '' }: { path: string | null; className?: string; alt?: string }) {
  const src = coverUrl(path)
  return src ? <img className={`cover ${className}`} src={src} loading="lazy" decoding="async" alt={alt} draggable={false} />
    : <div className={`cover cover-missing ${className}`} />
}

export function AvailabilityBadge({ issue }: { issue: Pick<IssueSummary, 'availability'> }) {
  // Phase 4 adds Cloud / Downloading n% / Downloaded here
  return issue.availability === 'ia' ? <span className="badge badge-ok">Readable</span>
    : <span className="badge badge-off">No scan</span>
}

export function IssueCard({ issue, onOpen, extra }: { issue: IssueSummary; onOpen: () => void; extra?: ReactNode }) {
  return (
    <button className={`issue-card ${issue.availability === 'ia' ? '' : 'dimmed'}`} onClick={onOpen}>
      <Cover path={issue.coverPath} alt={issue.title} />
      <span className="issue-card-date">{monthYear(issue.year, issue.month)}</span>
      {issue.coverArtist && <span className="muted small">{issue.coverArtist}</span>}
      <span className="issue-card-meta">
        <AvailabilityBadge issue={issue} />
        {issue.storyCount > 0 && <span className="muted small">{issue.storyCount} items</span>}
        {extra}
      </span>
    </button>
  )
}

export function Credits({ credits }: { credits: Credit[] }) {
  const nav = useNav()
  if (!credits.length) return null
  return (
    <span className="credits">
      {credits.map((c, i) => (
        <span key={`${c.personId}-${c.role}`}>
          {i > 0 && (c.role === 'translator' ? '; tr. ' : ', ')}
          <a className="person-link" onClick={(e) => { e.stopPropagation(); nav.push({ name: 'person', id: c.personId }) }}>
            {c.name}
          </a>
        </span>
      ))}
    </span>
  )
}

/** One contents line: page · title (part) · credits · type. Tapping opens the reader at the story's leaf. */
export function StoryLine({ story, showIssue = false, onOpen }: {
  story: StoryInIssue; showIssue?: boolean; onOpen?: (s: StoryInIssue) => void
}) {
  const readable = !!story.issue.iaIdentifier
  return (
    <div className={`story-line ${readable ? 'readable' : ''}`} onClick={() => readable && onOpen?.(story)}
         role={readable ? 'button' : undefined}>
      <span className="story-page muted">{story.pagePrinted ?? ''}</span>
      <span className="story-main">
        <span className="story-title">{story.title}</span>
        {story.partInfo && <span className="muted"> · {story.partInfo}</span>}
        <span className="story-sub muted">
          <Credits credits={story.credits} />
          {showIssue && <> · {monthYear(story.issue.year, story.issue.month)}</>}
        </span>
      </span>
      <span className="story-type muted small" title={story.typeLabel ?? ''}>{story.typeLabel ?? story.typeCode}</span>
    </div>
  )
}

export function Loading() {
  return <div className="loading muted">Loading…</div>
}

export function ErrorBox({ error }: { error: string }) {
  return <div className="error-box">{error}</div>
}
