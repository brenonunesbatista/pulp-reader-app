import { useRef } from 'react'
import { getIssuesByIds, listMagazines } from '../data/catalogRepo'
import { recentProgress } from '../data/progressRepo'
import { useDb } from '../db/useDb'
import { useIsActive, useNav } from '../nav/context'
import { Cover, ErrorBox, Loading } from '../ui/components'
import { monthYear } from '../ui/format'
import { useAsync } from '../ui/useAsync'

export function LibraryScreen() {
  const { catalog, user } = useDb()
  const nav = useNav()
  const active = useIsActive()
  const mags = useAsync(() => listMagazines(catalog), [catalog])
  // reload the shelf whenever the Library becomes visible again (e.g. back from the reader)
  const shelf = useAsync(async () => {
    const recent = await recentProgress(user)
    const issues = await getIssuesByIds(catalog, recent.map((p) => p.issueId))
    return issues.map((issue) => ({ issue, progress: recent.find((p) => p.issueId === issue.id)! }))
  }, [catalog, user, active])
  const press = useRef(0)

  return (
    <div className="screen">
      <header className="library-head">
        {/* long-press the title for the Phase 1 developer tools */}
        <h1 className="app-title"
            onPointerDown={() => { press.current = window.setTimeout(() => nav.push({ name: 'dev' }), 800) }}
            onPointerUp={() => window.clearTimeout(press.current)}
            onPointerLeave={() => window.clearTimeout(press.current)}>
          Pulp Reader
        </h1>
        <button className="search-field" onClick={() => nav.push({ name: 'search' })}>
          Search issues, stories, authors, artists…
        </button>
      </header>

      {shelf.status === 'ok' && shelf.data.length > 0 && (
        <section>
          <h2 className="section-title">Continue reading</h2>
          <div className="shelf">
            {shelf.data.map(({ issue, progress }) => (
              <button key={issue.id} className="shelf-item"
                      onClick={() => nav.push({ name: 'reader', issueId: issue.id, leaf: progress.page })}>
                <Cover path={issue.coverPath} alt={issue.title} />
                <span className="small">{monthYear(issue.year, issue.month)}</span>
                <span className="muted small">page {progress.page + 1}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="section-title">Magazines</h2>
        {mags.status === 'loading' && <Loading />}
        {mags.status === 'error' && <ErrorBox error={mags.error} />}
        {mags.status === 'ok' && mags.data.map((m) => (
          <button key={m.id} className="magazine-card" onClick={() => nav.push({ name: 'magazine', id: m.id })}>
            <div className="mosaic">{m.covers.map((c) => <Cover key={c} path={c} />)}</div>
            <div className="magazine-info">
              <h3>{m.name}</h3>
              <p className="muted">{m.firstYear}–{m.lastYear} · {m.issueCount} issues · {m.readable} readable online</p>
            </div>
          </button>
        ))}
      </section>
    </div>
  )
}
