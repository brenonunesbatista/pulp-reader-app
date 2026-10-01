import { getContents, getIssue, issuePeople } from '../data/catalogRepo'
import type { StoryInIssue } from '../data/models'
import { getProgress } from '../data/progressRepo'
import { useDb } from '../db/useDb'
import { useIsActive, useNav } from '../nav/context'
import { Cover, ErrorBox, Loading, Screen, SectionHeader, StoryRow, SubMasthead } from '../ui/components'
import { monthYear, coverTag } from '../ui/format'
import { Icon } from '../ui/icons'
import { useAsync } from '../ui/useAsync'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December']

export function IssueScreen({ id }: { id: number }) {
  const { catalog, user } = useDb()
  const nav = useNav()
  const active = useIsActive()
  const data = useAsync(async () => {
    const issue = await getIssue(catalog, id)
    if (!issue) throw new Error(`Issue ${id} not found`)
    return { issue, contents: await getContents(catalog, id), people: await issuePeople(catalog, id) }
  }, [catalog, id])
  const progress = useAsync(() => getProgress(user, id), [user, id, active])

  if (data.status !== 'ok') {
    return (
      <Screen section="pulp" masthead={<SubMasthead />}>
        {data.status === 'loading' ? <Loading /> : <ErrorBox error={data.error} />}
      </Screen>
    )
  }
  const { issue, contents } = data.data
  const magazine = issue.title.replace(/,\s*\w+ \d{4}$/, '')
  const readable = issue.availability === 'ia'
  const resume = progress.status === 'ok' ? progress.data : null
  const openAt = (s: StoryInIssue) => nav.push({ name: 'reader', issueId: issue.id, leaf: s.iaLeaf ?? 0 })
  const current = resume ? [...contents].reverse().find((s) => s.iaLeaf !== null && s.iaLeaf <= resume.page) : undefined
  const kicker = [issue.volume && `Vol. ${issue.volume}`, issue.number && `No. ${issue.number}`, `${MONTHS[issue.month - 1]} ${issue.year}`]
    .filter(Boolean).join(' · ')

  return (
    <Screen section="pulp" masthead={<SubMasthead title={magazine} sub={monthYear(issue.year, issue.month)} />}>
      <div className="issue-layout">
        <div className="issue-hero">
          <Cover path={issue.coverPath} alt={issue.title} tag={coverTag(issue)} noScan={!readable} stamp={readable} eager />
          <div className="muted small num">{readable ? `Scan: ${issue.iaIdentifier}` : 'Not on the Internet Archive'}</div>
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="issue-kicker num">{kicker}</div>
          <h1 className="issue-title">{magazine}</h1>
          <div className="credits-line">
            {(['cover_artist', 'editor'] as const).map((role) => {
              const people = data.data.people.filter((p) => p.role === role)
              return people.length > 0 && (
                <div key={role}>
                  <span className="muted">{role === 'editor' ? 'Editor' : 'Cover'}</span>
                  {people.map((p, i) => (
                    <span key={p.id}>{i > 0 && ', '}
                      <button className="person-link" onClick={() => nav.push({ name: 'person', id: p.id })}>{p.name}</button>
                    </span>
                  ))}
                </div>
              )
            })}
          </div>
          <div className="btn-row">
            {readable && resume && (
              <button className="btn primary num" onClick={() => nav.push({ name: 'reader', issueId: issue.id, leaf: resume.page })}>
                <Icon name="read" size={22} />Continue · page {resume.page + 1}
              </button>
            )}
            {readable && (
              <button className={`btn ${resume ? '' : 'primary'}`} onClick={() => nav.push({ name: 'reader', issueId: issue.id, leaf: 0 })}>
                {resume ? 'Start over' : <><Icon name="read" size={22} />Read now</>}
              </button>
            )}
            {!readable && <button className="btn" disabled>No scan available</button>}
            <button className="btn" disabled title="Downloads arrive in a later phase"><Icon name="download" size={20} />Download</button>
          </div>
          <SectionHeader title="Contents" aside={<span className="aside num">{contents.length} items</span>} />
          {contents.length === 0 && <p className="muted">No contents listed.</p>}
          <div className="toc">
            {contents.map((s) => (
              <StoryRow key={s.id} story={s} onOpen={openAt} current={s === current}
                        note={s === current && resume ? `reading, p. ${resume.page + 1}` : undefined} />
            ))}
          </div>
        </div>
      </div>
    </Screen>
  )
}
