import { getPersonWorks } from '../data/catalogRepo'
import { useDb } from '../db/useDb'
import { useNav } from '../nav/context'
import { ErrorBox, IssueCard, Loading, Screen, SectionHeader, StoryRow, SubMasthead } from '../ui/components'
import { roleLabel, initials } from '../ui/format'
import { useAsync } from '../ui/useAsync'

export function PersonScreen({ id }: { id: number }) {
  const { catalog } = useDb()
  const nav = useNav()
  const data = useAsync(() => getPersonWorks(catalog, id), [catalog, id])

  if (data.status !== 'ok' || !data.data) {
    return (
      <Screen masthead={<SubMasthead />}>
        {data.status === 'loading' ? <Loading /> : <ErrorBox error={data.status === 'error' ? data.error : 'Not found'} />}
      </Screen>
    )
  }
  const { person, stories, issues } = data.data
  const covers = issues.filter((i) => i.role === 'cover_artist')
  const edited = issues.filter((i) => i.role === 'editor')
  const years = [...stories.map((s) => s.issue.year), ...issues.map((i) => i.year)]
  const span = years.length ? `${Math.min(...years)}–${Math.max(...years)}` : ''

  return (
    <Screen masthead={<SubMasthead title="People" />}>
      <div className="person-hero">
        <span className="avatar">{initials(person.name)}</span>
        <div>
          <h1>{person.name}</h1>
          <div className="muted num">
            {person.roles.map(roleLabel).join(' · ')}{span && ` · ${span}`}
            {stories.length > 0 && ` · ${stories.length} works`}{covers.length > 0 && ` · ${covers.length} covers`}
          </div>
        </div>
      </div>
      {stories.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <SectionHeader title="Works" aside={<span className="aside num">{stories.length}</span>} />
          <div className="toc">
            {stories.map((s) => (
              <StoryRow key={`${s.id}-${s.role}`} story={s} showIssue
                        onOpen={(x) => nav.push({ name: 'reader', issueId: x.issue.id, leaf: x.iaLeaf ?? 0 })} />
            ))}
          </div>
        </section>
      )}
      {covers.length > 0 && (
        <section style={{ marginBottom: 36 }}>
          <SectionHeader title="Covers" aside={<span className="aside num">{covers.length}</span>} />
          <div className="issue-grid">
            {covers.map((i) => <IssueCard key={i.id} issue={i} onOpen={() => nav.push({ name: 'issue', id: i.id })} />)}
          </div>
        </section>
      )}
      {edited.length > 0 && (
        <section>
          <SectionHeader title="Edited" aside={<span className="aside num">{edited.length}</span>} />
          <div className="issue-grid">
            {edited.map((i) => <IssueCard key={i.id} issue={i} onOpen={() => nav.push({ name: 'issue', id: i.id })} />)}
          </div>
        </section>
      )}
    </Screen>
  )
}
