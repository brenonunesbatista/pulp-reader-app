import { getPersonWorks } from '../data/catalogRepo'
import { useDb } from '../db/useDb'
import { useNav } from '../nav/context'
import { ErrorBox, IssueCard, Loading, StoryLine, TopBar } from '../ui/components'
import { roleLabel } from '../ui/format'
import { useAsync } from '../ui/useAsync'

export function PersonScreen({ id }: { id: number }) {
  const { catalog } = useDb()
  const nav = useNav()
  const data = useAsync(() => getPersonWorks(catalog, id), [catalog, id])

  if (data.status === 'loading') return <div className="screen"><TopBar /><Loading /></div>
  if (data.status === 'error' || !data.data) {
    return <div className="screen"><TopBar /><ErrorBox error={data.status === 'error' ? data.error : 'Not found'} /></div>
  }
  const { person, stories, issues } = data.data
  const covers = issues.filter((i) => i.role === 'cover_artist')
  const edited = issues.filter((i) => i.role === 'editor')

  return (
    <div className="screen">
      <TopBar title={person.name} />
      <div className="page-pad">
        <p className="muted">{person.roles.map(roleLabel).join(' · ')}</p>
        {stories.length > 0 && (
          <section>
            <h3 className="section-title">Works ({stories.length})</h3>
            <div className="toc">
              {stories.map((s) => (
                <StoryLine key={`${s.id}-${s.role}`} story={s} showIssue
                           onOpen={(x) => nav.push({ name: 'reader', issueId: x.issue.id, leaf: x.iaLeaf ?? 0 })} />
              ))}
            </div>
          </section>
        )}
        {covers.length > 0 && (
          <section>
            <h3 className="section-title">Covers ({covers.length})</h3>
            <div className="issue-grid">
              {covers.map((i) => <IssueCard key={i.id} issue={i} onOpen={() => nav.push({ name: 'issue', id: i.id })} />)}
            </div>
          </section>
        )}
        {edited.length > 0 && (
          <section>
            <h3 className="section-title">Edited ({edited.length})</h3>
            <div className="issue-grid">
              {edited.map((i) => <IssueCard key={i.id} issue={i} onOpen={() => nav.push({ name: 'issue', id: i.id })} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
