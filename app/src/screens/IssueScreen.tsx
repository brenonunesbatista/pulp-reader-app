import { getContents, getIssue } from '../data/catalogRepo'
import type { StoryInIssue } from '../data/models'
import { getProgress } from '../data/progressRepo'
import { useDb } from '../db/useDb'
import { useIsActive, useNav } from '../nav/context'
import { AvailabilityBadge, Cover, ErrorBox, Loading, StoryLine, TopBar } from '../ui/components'
import { monthYear } from '../ui/format'
import { useAsync } from '../ui/useAsync'

export function IssueScreen({ id }: { id: number }) {
  const { catalog, user } = useDb()
  const nav = useNav()
  const active = useIsActive()
  const data = useAsync(async () => {
    const issue = await getIssue(catalog, id)
    if (!issue) throw new Error(`Issue ${id} not found`)
    return { issue, contents: await getContents(catalog, id) }
  }, [catalog, id])
  const progress = useAsync(() => getProgress(user, id), [user, id, active])

  if (data.status === 'loading') return <div className="screen"><TopBar /><Loading /></div>
  if (data.status === 'error') return <div className="screen"><TopBar /><ErrorBox error={data.error} /></div>
  const { issue, contents } = data.data
  const readable = issue.availability === 'ia'
  const resume = progress.status === 'ok' ? progress.data : null
  const openAt = (s: StoryInIssue) => nav.push({ name: 'reader', issueId: issue.id, leaf: s.iaLeaf ?? 0 })

  return (
    <div className="screen">
      <TopBar title={monthYear(issue.year, issue.month)} />
      <div className="issue-layout">
        <div className="issue-cover-col">
          <Cover path={issue.coverPath} className="cover-large" alt={issue.title} />
        </div>
        <div className="issue-info">
          <h2>{issue.title}</h2>
          <dl className="meta">
            {issue.coverArtist && <><dt>Cover</dt><dd>{issue.coverArtist}</dd></>}
            {issue.editor && <><dt>Editor</dt><dd>{issue.editor}</dd></>}
            <dt>Scan</dt><dd>{issue.iaIdentifier ?? 'Not on the Internet Archive'} <AvailabilityBadge issue={issue} /></dd>
          </dl>
          <div className="actions">
            {readable ? (
              <>
                {resume && (
                  <button className="btn primary" onClick={() => nav.push({ name: 'reader', issueId: issue.id, leaf: resume.page })}>
                    Continue · page {resume.page + 1}
                  </button>
                )}
                <button className={`btn ${resume ? '' : 'primary'}`} onClick={() => nav.push({ name: 'reader', issueId: issue.id, leaf: 0 })}>
                  {resume ? 'From the cover' : 'Read now'}
                </button>
              </>
            ) : (
              <button className="btn" disabled>No scan on the Internet Archive</button>
            )}
            <button className="btn" disabled title="Downloads arrive in Phase 4">Download</button>
          </div>

          <h3 className="section-title">Contents</h3>
          {contents.length === 0 && <p className="muted">No contents listed.</p>}
          <div className="toc">
            {contents.map((s) => <StoryLine key={s.id} story={s} onOpen={openAt} />)}
          </div>
        </div>
      </div>
    </div>
  )
}
