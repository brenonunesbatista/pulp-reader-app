import { useEffect, useRef, useState } from 'react'
import { search, yearRange } from '../data/catalogRepo'
import type { Role, SearchResults } from '../data/models'
import { useDb } from '../db/useDb'
import { useNav } from '../nav/context'
import { ErrorBox, IssueCard, StoryLine, TopBar } from '../ui/components'
import { roleLabel } from '../ui/format'
import { useAsync } from '../ui/useAsync'

const ROLES: (Role | '')[] = ['', 'author', 'editor', 'cover_artist', 'translator']

export function SearchScreen({ initial = '' }: { initial?: string }) {
  const { catalog } = useDb()
  const nav = useNav()
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
    <div className="screen">
      <TopBar>
        <input ref={input} className="search-input" type="search" value={q} placeholder="Search issues, stories, people…"
               onChange={(e) => setQ(e.target.value)} enterKeyHint="search" />
      </TopBar>
      <div className="filters page-pad">
        <div className="chips">
          {ROLES.map((r) => (
            <button key={r || 'any'} className={`chip ${role === r ? 'on' : ''}`} onClick={() => setRole(r)}>
              {r ? roleLabel(r) : 'Anything'}
            </button>
          ))}
          <select value={from} onChange={(e) => setFrom(e.target.value ? Number(e.target.value) : '')} aria-label="From year">
            <option value="">From</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select value={to} onChange={(e) => setTo(e.target.value ? Number(e.target.value) : '')} aria-label="To year">
            <option value="">To</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          {hasQuery && res && <span className="muted small">{res.ms.toFixed(0)} ms</span>}
        </div>
      </div>

      <div className="page-pad">
        {error && <ErrorBox error={error} />}
        {hasQuery && empty && <p className="muted">Nothing found.</p>}
        {hasQuery && res && (
          <>
            {res.people.length > 0 && (
              <section>
                <h3 className="section-title">People</h3>
                <div className="people-list">
                  {res.people.map((p) => (
                    <button key={p.id} className="person-row" onClick={() => nav.push({ name: 'person', id: p.id })}>
                      <span>{p.name}</span>
                      <span className="muted small">{p.roles.map(roleLabel).join(' · ')}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            {res.issues.length > 0 && (
              <section>
                <h3 className="section-title">Issues</h3>
                <div className="issue-grid">
                  {res.issues.map((i) => <IssueCard key={i.id} issue={i} onOpen={() => nav.push({ name: 'issue', id: i.id })} />)}
                </div>
              </section>
            )}
            {res.stories.length > 0 && (
              <section>
                <h3 className="section-title">Stories</h3>
                <div className="toc">
                  {res.stories.map((s) => (
                    <StoryLine key={s.id} story={s} showIssue
                               onOpen={(x) => nav.push({ name: 'reader', issueId: x.issue.id, leaf: x.iaLeaf ?? 0 })} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
