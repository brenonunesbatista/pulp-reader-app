import { useEffect, useRef, useState } from 'react'
import { search, yearRange } from '../data/catalogRepo'
import type { Role, SearchResults } from '../data/models'
import { useDb } from '../db/useDb'
import { useNav } from '../nav/context'
import { ErrorBox, IssueCard, Screen, SectionHeader, StoryRow } from '../ui/components'
import { roleLabel, initials } from '../ui/format'
import { Icon } from '../ui/icons'
import { useSizeClass } from '../ui/sizeClass'
import { useAsync } from '../ui/useAsync'

const ROLES: (Role | '')[] = ['', 'author', 'editor', 'cover_artist', 'translator']

export function SearchScreen({ initial = '' }: { initial?: string }) {
  const { catalog } = useDb()
  const nav = useNav()
  const compact = useSizeClass() === 'compact'
  const range = useAsync(() => yearRange(catalog), [catalog])
  const [q, setQ] = useState(initial)
  const [role, setRole] = useState<Role | ''>('')
  const [from, setFrom] = useState<number | ''>('')
  const [to, setTo] = useState<number | ''>('')
  const [res, setRes] = useState<SearchResults | null>(null)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const seq = useRef(0)

  useEffect(() => { input.current?.focus() }, [])

  useEffect(() => {
    const my = ++seq.current
    const t = window.setTimeout(() => {
      search(catalog, q, { role: role || undefined, yearFrom: from || undefined, yearTo: to || undefined })
        .then((r) => { if (my === seq.current) { setRes(r); setError(null) } }, (e) => setError(String(e)))
    }, 120)
    return () => window.clearTimeout(t)
  }, [catalog, q, role, from, to])

  const years = range.status === 'ok' ? Array.from({ length: range.data.max - range.data.min + 1 }, (_, i) => range.data.min + i) : []
  const hasQuery = q.trim().length > 0
  const empty = res && !res.issues.length && !res.stories.length && !res.people.length

  return (
    <Screen section="search" masthead={
      <header className="masthead slim">
        {nav.depth > 1 && <button className="sq-btn" aria-label="Back" onClick={nav.back}><Icon name="back" stroke={2.2} /></button>}
        {!compact && <div className="masthead-title">Search</div>}
        <label className="mast-search">
          <Icon name="search" size={20} />
          <input ref={input} type="search" value={q} enterKeyHint="search" aria-label="Search the newsstand"
                 placeholder="Titles, authors, editors, cover artists, translators…" onChange={(e) => setQ(e.target.value)} />
          {q && <button className="person-link" aria-label="Clear" onClick={() => setQ('')}><Icon name="close" size={20} /></button>}
        </label>
      </header>
    }>
      <div className="search-filters">
        <div className="chips">
          {ROLES.map((r) => (
            <button key={r || 'any'} className={`chip ${role === r ? 'on' : ''}`} onClick={() => setRole(r)}>
              {r ? roleLabel(r) : 'Anything'}
            </button>
          ))}
        </div>
        <div className="chips">
          <select className="chip num" value={from} onChange={(e) => setFrom(e.target.value ? Number(e.target.value) : '')} aria-label="From year">
            <option value="">From year</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="chip num" value={to} onChange={(e) => setTo(e.target.value ? Number(e.target.value) : '')} aria-label="To year">
            <option value="">To year</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {hasQuery && res && <span className="timing">{res.ms.toFixed(0)} ms</span>}
        </div>
      </div>

      {error && <ErrorBox error={error} />}
      {!hasQuery && <p className="muted">Search 309 issues and 4,000+ stories by title, author, editor, cover artist or translator. Prefixes work: <i>asim</i>, <i>wertenb</i>.</p>}
      {hasQuery && empty && <p className="muted">Nothing found.</p>}
      {hasQuery && res && (
        <div className="results">
          {res.people.length > 0 && (
            <section>
              <SectionHeader title="People" aside={<span className="aside num">{res.people.length}</span>} />
              <div className="people-list">
                {res.people.map((p) => (
                  <button key={p.id} className="person-row" onClick={() => nav.push({ name: 'person', id: p.id })}>
                    <span className="avatar">{initials(p.name)}</span>
                    <span className="name">{p.name}</span>
                    <span className="muted small">{p.roles.map(roleLabel).join(' · ')}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {res.issues.length > 0 && (
            <section>
              <SectionHeader title="Issues" aside={<span className="aside num">{res.issues.length}</span>} />
              <div className="issue-grid">
                {res.issues.map((i) => <IssueCard key={i.id} issue={i} onOpen={() => nav.push({ name: 'issue', id: i.id })} />)}
              </div>
            </section>
          )}
          {res.stories.length > 0 && (
            <section>
              <SectionHeader title="Stories" aside={<span className="aside num">{res.stories.length}</span>} />
              <div className="toc">
                {res.stories.map((s) => (
                  <StoryRow key={s.id} story={s} showIssue
                            onOpen={(x) => nav.push({ name: 'reader', issueId: x.issue.id, leaf: x.iaLeaf ?? 0, storyId: x.id })} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Screen>
  )
}
