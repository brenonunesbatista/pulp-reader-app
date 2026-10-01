import { Fragment, useMemo, useState } from 'react'
import { getMagazine, listIssues, magazineEditors } from '../data/catalogRepo'
import type { IssueSummary } from '../data/models'
import { useDb } from '../db/useDb'
import { useNav } from '../nav/context'
import { Cover, ErrorBox, Loading, Screen, SubMasthead } from '../ui/components'
import { Icon } from '../ui/icons'
import { useAsync } from '../ui/useAsync'

const NO_ISSUES: IssueSummary[] = []
const decadeOf = (y: number) => Math.floor(y / 10) * 10
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December']

export function MagazineScreen({ id }: { id: number }) {
  const { catalog } = useDb()
  const nav = useNav()
  const data = useAsync(async () => ({
    mag: await getMagazine(catalog, id), issues: await listIssues(catalog, id), editors: await magazineEditors(catalog, id),
  }), [catalog, id])
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
  const byYear = useMemo(() => {
    const m = new Map<number, IssueSummary[]>()
    for (const i of shown) m.set(i.year, [...(m.get(i.year) ?? []), i])
    return [...m]
  }, [shown])

  const mag = data.status === 'ok' ? data.data.mag : null
  return (
    <Screen section="pulp" masthead={
      <SubMasthead title={mag?.name ?? ''}>
        <button className="sq-btn" aria-label="Search" onClick={() => nav.push({ name: 'search' })}><Icon name="search" size={22} /></button>
      </SubMasthead>
    }>
      {data.status === 'loading' && <Loading />}
      {data.status === 'error' && <ErrorBox error={data.error} />}
      {data.status === 'ok' && mag && (
        <>
          <div className="filter-band">
            <div className="muted small num">
              {mag.firstYear}–{mag.lastYear} · {mag.issueCount} issues · {mag.readable} readable
              {data.data.editors.length > 0 && <> · Editors {data.data.editors.map((e, i) => (
                <Fragment key={e.id}>{i > 0 && ', '}
                  <button className="person-link" onClick={() => nav.push({ name: 'person', id: e.id })}>{e.name}</button>
                </Fragment>))}</>}
            </div>
            <div className="chips">
              <button className={`chip ${decade === 'all' ? 'on' : ''}`} onClick={() => { setDecade('all'); setYear(null) }}>All</button>
              {decades.map((d) => (
                <button key={d} className={`chip num ${decade === d ? 'on' : ''}`} onClick={() => { setDecade(d); setYear(null) }}>{d}s</button>
              ))}
              {years.length > 1 && <span className="chip-sep" />}
              {years.length > 1 && years.map((y) => (
                <button key={y} className={`chip pill ${year === y ? 'on' : ''}`} onClick={() => setYear(year === y ? null : y)}>{y}</button>
              ))}
              <span className="mast-spacer" />
              <label className="switch">
                <input type="checkbox" checked={readableOnly} onChange={(e) => setReadableOnly(e.target.checked)} />
                <span className="track" />Readable only
              </label>
            </div>
          </div>
          {byYear.map(([y, list]) => (
            <section key={y} className="year-group">
              <div className="year-head">
                <h2 className="num">{y}</h2>
                <span className="muted small num">{list.length} issues · {list.filter((i) => i.availability === 'ia').length} readable</span>
              </div>
              <div className="issue-grid">
                {list.map((i) => (
                  <button key={i.id} className="issue-card" onClick={() => nav.push({ name: 'issue', id: i.id })}>
                    <Cover path={i.coverPath} alt={i.title} noScan={i.availability !== 'ia'} />
                    <span className="month">{MONTHS[i.month - 1]}</span>
                    <span className="meta num">{i.coverArtist ?? '—'}{i.storyCount ? ` · ${i.storyCount}` : ''}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {byYear.length === 0 && <p className="muted">No issues match these filters.</p>}
        </>
      )}
    </Screen>
  )
}
