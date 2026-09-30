// Throwaway Part B check on the tablet: browse covers, open an issue's contents, FTS search with timings.
// Not the Phase 2 UI — just enough to validate catalog.db content and on-device search speed.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ftsQuery, openCatalog, openInfo, Q, timed, type IssueRow, type PersonRow, type StoryRow } from './catalogDb'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DECADES = ['1920s', '1930s', '1940s', '1950s'] as const

export interface OpenReader { id: string; label: string; leaf: number }

type View =
  | { kind: 'grid' }
  | { kind: 'issue'; issue: IssueRow }
  | { kind: 'person'; person: PersonRow }

export function CatalogSpike({ onBack, onRead }: { onBack: () => void; onRead: (r: OpenReader) => void }) {
  const [issues, setIssues] = useState<IssueRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [decade, setDecade] = useState<(typeof DECADES)[number]>('1920s')
  const [view, setView] = useState<View>({ kind: 'grid' })
  const [stories, setStories] = useState<StoryRow[]>([])
  const [q, setQ] = useState('')
  const [results, setResults] = useState<{ issues: IssueRow[]; stories: StoryRow[]; people: PersonRow[] } | null>(null)
  const [timing, setTiming] = useState('')
  const seq = useRef(0)

  useEffect(() => {
    const t = performance.now()
    openCatalog()
      .then(() => timed<IssueRow>(Q.issues))
      .then(({ rows, ms }) => {
        setIssues(rows)
        setTiming(`db ${openInfo}; ${rows.length} issues in ${ms.toFixed(0)} ms; ready after ${Math.round(performance.now() - t)} ms`)
      })
      .catch((e) => setError(String(e)))
  }, [])

  // debounced search; three FTS queries, timings shown
  useEffect(() => {
    const fq = ftsQuery(q)
    if (!fq) return
    const my = ++seq.current
    const id = window.setTimeout(async () => {
      try {
        const t = performance.now()
        const [i, s, p] = await Promise.all([
          timed<IssueRow>(Q.searchIssues, [fq]), timed<StoryRow>(Q.searchStories, [fq]), timed<PersonRow>(Q.searchPeople, [fq])])
        if (my !== seq.current) return
        setResults({ issues: i.rows, stories: s.rows, people: p.rows })
        setTiming(`search "${fq}": issues ${i.ms.toFixed(0)} ms, stories ${s.ms.toFixed(0)} ms, people ${p.ms.toFixed(0)} ms` +
          ` · total ${Math.round(performance.now() - t)} ms`)
      } catch (e) { setError(String(e)) }
    }, 120)
    return () => window.clearTimeout(id)
  }, [q])

  const openIssue = async (issue: IssueRow) => {
    const full = issues.find((x) => x.id === issue.id) ?? issue
    setView({ kind: 'issue', issue: full })
    const { rows, ms } = await timed<StoryRow>(Q.issueStories, [issue.id])
    setStories(rows)
    setTiming(`contents: ${rows.length} items in ${ms.toFixed(0)} ms`)
  }
  const openPerson = async (person: PersonRow) => {
    setView({ kind: 'person', person })
    const { rows, ms } = await timed<StoryRow>(Q.personStories, [person.id])
    setStories(rows)
    setTiming(`${person.name}: ${rows.length} items in ${ms.toFixed(0)} ms`)
  }
  const read = (ident: string | null, label: string, leaf: number | null) => {
    if (ident) onRead({ id: ident, label, leaf: leaf ?? 0 })
  }

  const shown = useMemo(() => issues.filter((i) => `${Math.floor(i.year / 10) * 10}s` === decade), [issues, decade])

  return (
    <div className="cat">
      <div className="cat-top">
        <button onClick={view.kind === 'grid' ? onBack : () => setView({ kind: 'grid' })}>‹ Back</button>
        <input className="cat-search" placeholder="Search issues, stories, people…" value={q}
               onChange={(e) => setQ(e.target.value)} />
        {q && <button onClick={() => setQ('')}>✕</button>}
      </div>
      <div className="cat-timing">{timing}</div>
      {error && <div className="error" style={{ position: 'static' }}>{error}</div>}

      {results && ftsQuery(q) ? (
        <div className="cat-body">
          <h3>Issues ({results.issues.length})</h3>
          <div className="cat-grid">{results.issues.map((i) => <Card key={i.id} i={i} onClick={() => { setQ(''); openIssue(i) }} />)}</div>
          <h3>People ({results.people.length})</h3>
          {results.people.map((p) => (
            <div key={p.id} className="cat-row" onClick={() => { setQ(''); openPerson(p) }}>
              <b>{p.name}</b> <span className="dim">{p.roles}</span>
            </div>
          ))}
          <h3>Stories ({results.stories.length})</h3>
          <StoryList rows={results.stories} showIssue onRead={read} />
        </div>
      ) : view.kind === 'grid' ? (
        <div className="cat-body">
          <div className="cat-chips">
            {DECADES.map((d) => <button key={d} className={d === decade ? 'on' : ''} onClick={() => setDecade(d)}>{d}</button>)}
            <span className="dim">{shown.length} issues</span>
          </div>
          <div className="cat-grid">{shown.map((i) => <Card key={i.id} i={i} onClick={() => openIssue(i)} />)}</div>
        </div>
      ) : view.kind === 'issue' ? (
        <div className="cat-body cat-issue">
          <img className="cat-bigcover" src={`/catalog/${view.issue.cover_path}`} alt="" />
          <div>
            <h2>{view.issue.title}</h2>
            <p>Cover: {view.issue.cover_artist ?? '—'} · Editor: {view.issue.editor ?? '—'}</p>
            <p className="dim">{view.issue.ia_identifier ?? 'No Internet Archive scan'} · {view.issue.slug}</p>
            {view.issue.ia_identifier && (
              <button onClick={() => read(view.issue.ia_identifier, MON[view.issue.month - 1] + ' ' + view.issue.year, 0)}>
                Read now (reader B)
              </button>
            )}
            <StoryList rows={stories} onRead={read} />
          </div>
        </div>
      ) : (
        <div className="cat-body">
          <h2>{view.person.name}</h2>
          <p className="dim">{view.person.roles}</p>
          <StoryList rows={stories} showIssue onRead={read} />
        </div>
      )}
    </div>
  )
}

function Card({ i, onClick }: { i: IssueRow; onClick: () => void }) {
  return (
    <div className="cat-card" onClick={onClick}>
      {i.cover_path ? <img src={`/catalog/${i.cover_path}`} loading="lazy" decoding="async" alt="" /> : <div className="nocover" />}
      <b>{MON[i.month - 1]} {i.year}</b>
      <span className="dim">{i.cover_artist ?? '—'}</span>
      <span className={`badge ${i.availability}`}>{i.availability === 'ia' ? 'IA' : 'no scan'}{i.n ? ` · ${i.n}` : ''}</span>
    </div>
  )
}

function StoryList({ rows, showIssue, onRead }: {
  rows: StoryRow[]; showIssue?: boolean; onRead: (id: string | null, label: string, leaf: number | null) => void
}) {
  return (
    <table className="cat-toc">
      <tbody>
        {rows.map((s) => (
          <tr key={s.id} className={s.ia_identifier ? 'link' : ''}
              onClick={() => onRead(s.ia_identifier, s.issue_title, s.ia_leaf)}>
            <td className="dim">{s.page_printed ?? ''}</td>
            <td>
              <b>{s.title}</b>{s.part_info ? ` (${s.part_info})` : ''}
              <div className="dim">{s.authors ?? ''}{s.note ? ` · ${s.note}` : ''}{showIssue ? ` · ${s.issue_title}` : ''}</div>
            </td>
            <td className="dim" title={s.type_label ?? ''}>{s.type_code}</td>
            <td className="dim">{s.ia_leaf != null ? `n${s.ia_leaf}` : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
