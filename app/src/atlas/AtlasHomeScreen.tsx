import { useEffect, useMemo, useState } from 'react'
import { deleteTimeline, listSavedTimelines, recordMissedSearch, renameTimeline, searchAtlas, type WantList } from '../data/atlasRepo'
import { useDb } from '../db/useDb'
import { useIsActive, useNav } from '../nav/context'
import { ErrorBox, Loading, Masthead, Screen, SectionHeader } from '../ui/components'
import { Icon } from '../ui/icons'
import { useAsync } from '../ui/useAsync'
import './atlas.css'
import { LANES, LANE_TOKEN, wantVerb } from './forms'
import { EntityChip, Picture, RecCard } from './parts'
import { recommendHome } from './recommend'
import { SuggestForm } from './SuggestForm'
import { useAtlas } from './useAtlas'

const FROM = 1890
const TO = 2030

export function AtlasHomeScreen() {
  const { atlas, user } = useDb()
  const nav = useNav()
  const ctx = useAtlas()
  const [q, setQ] = useState('')
  const results = useAsync(() => (q.trim() ? searchAtlas(atlas, q) : Promise.resolve([])), [atlas, q])
  const [suggest, setSuggest] = useState<string | null>(null) // open form with this initial text
  const [tick, setTick] = useState(0)
  const active = useIsActive()
  const timelines = useAsync(() => listSavedTimelines(user), [user, tick, active])
  const [renaming, setRenaming] = useState<{ id: number; name: string } | null>(null)
  // a search that finds nothing goes to the curator inbox (once the text has been stable for a moment)
  useEffect(() => {
    if (results.status !== 'ok' || results.data.length || q.trim().length < 3) return
    const t = window.setTimeout(() => void recordMissedSearch(user, q), 1500)
    return () => window.clearTimeout(t)
  }, [results, q, user])

  const home = useMemo(() => {
    if (ctx.status !== 'ok') return null
    const { graph, paths, signals, wants } = ctx.data
    const progress = paths.map((p) => {
      const ids = p.stops.map((x) => x.entity.id)
      const seen = ids.filter((x) => signals.visited.has(x))
      return { path: p, ids, explored: seen.length, last: Math.max(0, ...seen.map((x) => signals.visited.get(x)!)) }
    })
    const inProgress = progress.filter((x) => x.explored > 0 && x.explored < x.ids.length).sort((a, b) => b.last - a.last)
    const featured = inProgress[0] ?? progress.find((x) => x.explored === 0) ?? progress[0]
    const others = progress.filter((x) => x !== featured)
    const path = featured?.path
    const recs = recommendHome(graph, signals, [featured?.ids ?? [], ...others.map((x) => x.ids)], 8)
    const recent = [...signals.visited].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([id]) => graph.entities.get(id)).filter((e) => !!e)
    const counts = Object.fromEntries((['read', 'watch', 'listen', 'see'] as WantList[])
      .map((l) => [l, wants.filter((w) => w.list === l && !w.doneAt).length])) as Record<WantList, number>
    const ticks = [...graph.entities.values()].filter((e) => e.lane && e.year)
    return { graph, path, recs, recent, counts, ticks, explored: featured?.explored ?? 0, others }
  }, [ctx])

  return (
    <Screen section="atlas" masthead={<Masthead section="atlas" />}>
      {ctx.status === 'loading' && <Loading />}
      {ctx.status === 'error' && <ErrorBox error={ctx.error} />}
      {home && (
        <div className="a-home">
          <div className="a-search">
            <Icon name="search" size={20} />
            <input id="atlas-search" type="search" placeholder="Search the Atlas — people, stories, films, themes…" value={q}
                   onChange={(e) => setQ(e.target.value)} aria-label="Search the Atlas" />
          </div>
          {q.trim() && results.status === 'ok' && (
            <section className="a-sec">
              <div className="a-chips">
                {results.data.map((e) => <EntityChip key={e.id} e={e} onOpen={() => nav.push({ name: 'entity', id: e.id })} />)}
                {results.data.length === 0 && <p className="muted">Nothing in the Atlas matches “{q}” yet.</p>}
              </div>
              <div className="a-actions row" style={{ marginTop: 12 }}>
                {results.data.length > 0 && (
                  <button className="btn" onClick={() => nav.push({ name: 'timeline', subject: q.trim() })}>
                    <Icon name="atlas" size={20} />Timeline of “{q.trim()}”
                  </button>
                )}
                <button className="btn" onClick={() => setSuggest(q.trim())}>Suggest “{q.trim()}”</button>
              </div>
            </section>
          )}
          {suggest !== null && <SuggestForm context={q.trim() ? 'Atlas search' : 'Atlas home'} initial={suggest} onDone={() => setSuggest(null)} />}

          {home.path && (
            <button className="a-pathcard" onClick={() => nav.push({ name: 'path', id: home.path!.id })}>
              <span className="kick">{home.explored ? 'Your path' : 'Featured path'} · {home.path.stops.length} stops</span>
              <span className="ttl">{home.path.title}</span>
              <span className="sub">{home.path.subtitle}</span>
              <span className="pics">
                {home.path.stops.slice(0, 6).map((s) => <Picture key={s.entity.id} e={s.entity} className="mini" />)}
              </span>
              <span className="a-progress num"><span className="bar"><i style={{ width: `${(home.explored / home.path.stops.length) * 100}%` }} /></span>
                {home.explored ? `${home.explored} of ${home.path.stops.length} explored · Continue` : 'Start the path'}</span>
            </button>
          )}

          {home.others.length > 0 && (
            <section className="a-sec">
              <SectionHeader title="More paths" />
              <div className="a-paths">
                {home.others.map((o) => (
                  <button key={o.path.id} className="a-pathmini" onClick={() => nav.push({ name: 'path', id: o.path.id })}>
                    <span className="pics">{o.path.stops.slice(0, 4).map((x) => <Picture key={x.entity.id} e={x.entity} className="mini" />)}</span>
                    <span className="txt">
                      <span className="t">{o.path.title}</span>
                      <span className="m num">{o.path.stops.length} stops · {o.explored ? `${o.explored} explored` : 'not started'}</span>
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="a-sec">
            <SectionHeader title="Explore next" />
            <div className="a-recs">
              {home.recs.map((r) => {
                const e = home.graph.entities.get(r.id)
                return e ? <RecCard key={r.id} rec={r} e={e} onOpen={() => nav.push({ name: 'entity', id: e.id })} /> : null
              })}
            </div>
          </section>

          {home.recent.length > 0 && (
            <section className="a-sec">
              <SectionHeader title="Continue exploring" />
              <div className="a-chips">
                {home.recent.map((e) => <EntityChip key={e!.id} e={e!} onOpen={() => nav.push({ name: 'entity', id: e!.id })} />)}
              </div>
            </section>
          )}

          {timelines.status === 'ok' && timelines.data.length > 0 && (
            <section className="a-sec">
              <SectionHeader title="Your timelines" />
              <ul className="a-saved">
                {timelines.data.map((t) => (
                  <li key={t.id}>
                    {renaming?.id === t.id ? (
                      <form className="row" onSubmit={(e) => {
                        e.preventDefault()
                        void renameTimeline(user, t.id, renaming.name).then(() => { setRenaming(null); setTick((n) => n + 1) })
                      }}>
                        <input id={`tl-rename-${t.id}`} aria-label="Timeline name" value={renaming.name} autoFocus
                               onChange={(e) => setRenaming({ id: t.id, name: e.target.value })} />
                        <button className="btn small primary" type="submit">Save</button>
                        <button className="btn small" type="button" onClick={() => setRenaming(null)}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <button className="open" onClick={() => nav.push({ name: 'timeline', saved: t.id })}>
                          <span className="t">{t.name}</span>
                          <span className="m num">{t.spec.subject ? `“${t.spec.subject}” · ` : ''}{t.spec.zoom === 'years' ? 'by year' : 'by decade'}{t.spec.fromYear > 1890 ? ` · from ${t.spec.fromYear}` : ''}{t.itemCount ? ` · ${t.itemCount} added` : ''}</span>
                        </button>
                        <button className="icon-btn" aria-label={`Rename ${t.name}`} onClick={() => setRenaming({ id: t.id, name: t.name })}><Icon name="edit" size={20} /></button>
                        <button className="icon-btn" aria-label={`Delete ${t.name}`} onClick={() => void deleteTimeline(user, t.id).then(() => setTick((n) => n + 1))}><Icon name="trash" size={20} /></button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="a-two">
            <section className="a-sec">
              <SectionHeader title="Timeline" />
              <button className="a-teaser" onClick={() => nav.push({ name: 'timeline' })} aria-label="Open the timeline">
                {LANES.map((l, row) => (
                  <span key={l.id} className="lane-row" style={{ top: `${8 + row * 10}px` }}>
                    {home.ticks.filter((e) => e.lane === l.id).map((e) => (
                      <i key={e.id} style={{ left: `${((e.year! - FROM) / (TO - FROM)) * 100}%`, background: `var(--lane-${LANE_TOKEN[l.id]})` }} />
                    ))}
                  </span>
                ))}
                <span className="axis num"><span>{FROM}</span><span>1950</span><span>today</span></span>
                <span className="go">Open the timeline <Icon name="forward" size={18} /></span>
              </button>
            </section>
            <section className="a-sec">
              <SectionHeader title="Your lists" />
              <div className="a-lists">
                {(['read', 'watch', 'listen', 'see'] as WantList[]).map((l) => (
                  <button key={l} className="a-listtile" onClick={() => nav.push({ name: 'wantTo', list: l })}>
                    <span className="n num">{home.counts[l]}</span><span>Want to {wantVerb(l).toLowerCase()}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>

          <section className="a-sec">
            <SectionHeader title="Missing something?" />
            {suggest === null
              ? <button className="btn" onClick={() => setSuggest('')}>Suggest a subject for the Atlas</button>
              : <p className="muted">The form is open at the top of the page.</p>}
          </section>
        </div>
      )}
    </Screen>
  )
}
