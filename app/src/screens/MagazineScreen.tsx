import { useMemo, useState } from 'react'
import { getMagazine, listIssues } from '../data/catalogRepo'
import type { IssueSummary } from '../data/models'
import { useDb } from '../db/useDb'
import { useNav } from '../nav/context'
import { ErrorBox, IssueCard, Loading, TopBar } from '../ui/components'
import { useAsync } from '../ui/useAsync'

const NO_ISSUES: IssueSummary[] = []
const decadeOf = (y: number) => Math.floor(y / 10) * 10

export function MagazineScreen({ id }: { id: number }) {
  const { catalog } = useDb()
  const nav = useNav()
  const data = useAsync(async () => ({ mag: await getMagazine(catalog, id), issues: await listIssues(catalog, id) }), [catalog, id])
  const [decade, setDecade] = useState<number | 'all'>('all')
  const [year, setYear] = useState<number | null>(null)
  const [readableOnly, setReadableOnly] = useState(false)

  const issues = data.status === 'ok' ? data.data.issues : NO_ISSUES
  const decades = useMemo(() => [...new Set(issues.map((i) => decadeOf(i.year)))], [issues])
  const years = useMemo(() => (decade === 'all' ? [] : [...new Set(issues.filter((i) => decadeOf(i.year) === decade)
    .map((i) => i.year))]), [issues, decade])
  const shown = useMemo(() => issues.filter((i) =>
    (decade === 'all' || decadeOf(i.year) === decade) && (year === null || i.year === year) &&
    (!readableOnly || i.availability === 'ia')), [issues, decade, year, readableOnly])

  return (
    <div className="screen">
      <TopBar title={data.status === 'ok' ? data.data.mag?.name : ''}>
        <button className="icon-btn" onClick={() => nav.push({ name: 'search' })} aria-label="Search">⌕</button>
      </TopBar>
      {data.status === 'loading' && <Loading />}
      {data.status === 'error' && <ErrorBox error={data.error} />}
      {data.status === 'ok' && (
        <>
          <div className="filters">
            <div className="chips">
              <button className={`chip ${decade === 'all' ? 'on' : ''}`} onClick={() => { setDecade('all'); setYear(null) }}>All</button>
              {decades.map((d) => (
                <button key={d} className={`chip ${decade === d ? 'on' : ''}`} onClick={() => { setDecade(d); setYear(null) }}>
                  {d}s
                </button>
              ))}
              <label className="toggle">
                <input type="checkbox" checked={readableOnly} onChange={(e) => setReadableOnly(e.target.checked)} />
                Readable only
              </label>
            </div>
            {years.length > 1 && (
              <div className="chips chips-small">
                <button className={`chip ${year === null ? 'on' : ''}`} onClick={() => setYear(null)}>All {decade}s</button>
                {years.map((y) => (
                  <button key={y} className={`chip ${year === y ? 'on' : ''}`} onClick={() => setYear(y)}>{y}</button>
                ))}
              </div>
            )}
            <p className="muted small">{shown.length} issues</p>
          </div>
          <div className="issue-grid">
            {shown.map((i) => <IssueCard key={i.id} issue={i} onOpen={() => nav.push({ name: 'issue', id: i.id })} />)}
          </div>
        </>
      )}
    </div>
  )
}
