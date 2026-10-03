import { Fragment, useMemo, useState } from 'react'
import { getMagazine, listIssues, magazineEditors } from '../data/catalogRepo'
import type { IssueSummary } from '../data/models'
import { useDb } from '../db/useDb'
import { useDownloadList } from '../downloads/context'
import { useNav } from '../nav/context'
import { Cover, ErrorBox, Loading, Screen, SubMasthead } from '../ui/components'
import { issueLabel } from '../ui/format'
import { Icon } from '../ui/icons'
import { useAsync } from '../ui/useAsync'
import { decadeOf, filterIssues } from './issueFilter'

const NO_ISSUES: IssueSummary[] = []
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
  const [downloadedOnly, setDownloadedOnly] = useState(false)
  const downloads = useDownloadList()
  const downloaded = useMemo(() => new Set(downloads.map((d) => d.issueId)), [downloads])

  const issues = data.status === 'ok' ? data.data.issues : NO_ISSUES
  const decades = useMemo(() => [...new Set(issues.map((i) => decadeOf(i.year)))], [issues])
  const years = useMemo(() => (decade === 'all' ? [] : [...new Set(issues.filter((i) => decadeOf(i.year) === decade)
    .map((i) => i.year))]), [issues, decade])
  const shown = useMemo(() => filterIssues(issues, { decade, year, readableOnly, downloaded: downloadedOnly ? downloaded : null }),
    [issues, decade, year, readableOnly, downloadedOnly, downloaded])
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
              <label className="switch">
                <input type="checkbox" checked={downloadedOnly} onChange={(e) => setDownloadedOnly(e.target.checked)} />
                <span className="track" />Downloaded{downloaded.size ? ` (${issues.filter((i) => downloaded.has(i.id)).length})` : ''}
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
                    <Cover path={i.coverPath} alt={i.title} noScan={i.availability !== 'ia'} dl={i.id} />
                    <span className="month">{MONTHS[i.month - 1]}</span>
                    <span className="meta num">{i.coverArtist ?? issueLabel(i)}{i.storyCount ? ` · ${i.storyCount}` : ''}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {byYear.length === 0 && <p className="muted">{downloadedOnly && !downloaded.size ? 'No downloaded issues yet. Open an issue and tap Download.' : 'No issues match these filters.'}</p>}
        </>
      )}
    </Screen>
  )
}
