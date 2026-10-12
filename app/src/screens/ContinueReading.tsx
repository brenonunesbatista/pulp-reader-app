import { useState } from 'react'
import { getContents, getIssuesByIds } from '../data/catalogRepo'
import { deleteProgress, recentProgress } from '../data/progressRepo'
import { useDb } from '../db/useDb'
import { useIsActive, useNav } from '../nav/context'
import { Cover, SectionHeader } from '../ui/components'
import { coverTag, magazineOf, monthYear } from '../ui/format'
import { Icon } from '../ui/icons'
import { useAsync } from '../ui/useAsync'

/** "Continue reading" shelf (Atlas home and the PULP library): issues with progress, newest first; × forgets one. */
export function ContinueReading() {
  const { catalog, user } = useDb()
  const nav = useNav()
  const active = useIsActive()
  const [cleared, setCleared] = useState(0)
  const [confirmId, setConfirmId] = useState<number | null>(null)
  // reload whenever the screen becomes visible again (e.g. back from the reader)
  const shelf = useAsync(async () => {
    const recent = await recentProgress(user)
    const issues = await getIssuesByIds(catalog, recent.map((p) => p.issueId))
    return Promise.all(issues.map(async (issue) => {
      const progress = recent.find((p) => p.issueId === issue.id)!
      // story being read = last story starting at or before the saved leaf
      const toc = await getContents(catalog, issue.id)
      const story = [...toc].reverse().find((s) => s.iaLeaf !== null && s.iaLeaf <= progress.page)
      return { issue, progress, story: story?.title ?? null, pageCount: progress.pageCount }
    }))
  }, [catalog, user, active, cleared])
  const forget = async (issueId: number) => {
    if (confirmId !== issueId) return setConfirmId(issueId)
    setConfirmId(null)
    await deleteProgress(user, issueId)
    setCleared((n) => n + 1)
  }
  if (shelf.status !== 'ok' || shelf.data.length === 0) return null
  return (
    <section style={{ marginBottom: 36 }}>
      <SectionHeader title="Continue reading" />
      <div className="shelf">
        {shelf.data.map(({ issue, progress, story, pageCount }) => (
          <div key={issue.id} className="shelf-slot">
            <button className={`shelf-x ${confirmId === issue.id ? 'confirm' : ''}`} onBlur={() => setConfirmId(null)}
                    aria-label={`Remove ${issue.title} from Continue reading`} onClick={() => void forget(issue.id)}>
              {confirmId === issue.id ? 'Remove?' : <Icon name="close" size={16} stroke={2.6} />}
            </button>
            <button className="shelf-item" onClick={() => nav.push({ name: 'reader', issueId: issue.id, leaf: progress.page })}>
              <Cover path={issue.coverPath} alt={issue.title} tag={coverTag(issue)} dl={issue.id} />
              <div className="progress-bar">
                <i style={{ width: pageCount ? `${Math.round(((progress.page + 1) / pageCount) * 100)}%` : '0%' }} />
              </div>
              <div className="t">{magazineOf(issue.title)}</div>
              <div className="w num">{story ? `${story} · ` : `${monthYear(issue.year, issue.month)} · `}p. {progress.page + 1}</div>
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}
