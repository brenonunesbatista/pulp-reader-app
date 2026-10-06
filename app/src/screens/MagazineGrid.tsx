import { UPCOMING } from '../content/upcoming'
import type { Category, Magazine } from '../data/models'
import { useNav } from '../nav/context'
import { Cover, SectionHeader } from '../ui/components'

/** One category shelf: its magazines (from the catalog) and the ones still on the way. */
export function MagazineShelf({ category, magazines }: { category: Category; magazines: Magazine[] }) {
  const nav = useNav()
  const mags = magazines.filter((m) => m.category === category.slug)
  const known = new Set(mags.map((m) => m.name.toLowerCase()))
  const upcoming = UPCOMING.filter((u) => u.category === category.slug && !known.has(u.title.toLowerCase()))
  if (!mags.length && !upcoming.length) return null
  return (
    <section className="mag-shelf">
      <SectionHeader title={category.name} aside={mags.length ? <span className="aside num">{mags.length}</span> : undefined} />
      <div className="mag-grid">
        {mags.map((m) => (
          <button key={m.id} className="mag-card" onClick={() => nav.push({ name: 'magazine', id: m.id })}>
            <div className="mosaic">{m.covers.map((c) => <Cover key={c} path={c} small />)}</div>
            <div className="info">
              <div className="title">{m.name}</div>
              <div className="muted small num">{m.firstYear === m.lastYear ? m.firstYear : `${m.firstYear}–${m.lastYear}`}</div>
              <div className="muted small num">{m.issueCount} {m.issueCount === 1 ? 'issue' : 'issues'} · {m.readable} readable</div>
              <span className="tag">OPEN</span>
            </div>
          </button>
        ))}
        {upcoming.map((u) => (
          <button key={u.title} className="mag-card" disabled>
            <div className="mosaic">{Array.from({ length: 6 }, (_, i) => <Cover key={i} path={null} small />)}</div>
            <div className="info">
              <div className="title">{u.title}</div>
              <div className="muted small num">{u.years}</div>
              <div className="muted small">Not yet indexed</div>
              <span className="tag soon">COMING SOON</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
