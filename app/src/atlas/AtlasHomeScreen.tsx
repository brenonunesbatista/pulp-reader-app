import { useMemo, useState } from 'react'
import { searchAtlas, type WantList } from '../data/atlasRepo'
import { useDb } from '../db/useDb'
import { useNav } from '../nav/context'
import { ErrorBox, Loading, Masthead, Screen, SectionHeader } from '../ui/components'
import { Icon } from '../ui/icons'
import { useAsync } from '../ui/useAsync'
import './atlas.css'
import { LANES, LANE_TOKEN, wantVerb } from './forms'
import { EntityChip, Picture, RecCard } from './parts'
import { recommendHome } from './recommend'
import { useAtlas } from './useAtlas'

const FROM = 1890
const TO = 2030

export function AtlasHomeScreen() {
  const { atlas } = useDb()
  const nav = useNav()
  const ctx = useAtlas()
  const [q, setQ] = useState('')
  const results = useAsync(() => (q.trim() ? searchAtlas(atlas, q) : Promise.resolve([])), [atlas, q])

  const home = useMemo(() => {
    if (ctx.status !== 'ok') return null
    const { graph, paths, signals, wants } = ctx.data
    const path = paths[0]
    const stops = path?.stops.map((s) => s.entity.id) ?? []
    const recs = recommendHome(graph, signals, stops, 8)
    const recent = [...signals.visited].sort((a, b) => b[1] - a[1]).slice(0, 8)
      .map(([id]) => graph.entities.get(id)).filter((e) => !!e)
    const counts = Object.fromEntries((['read', 'watch', 'listen', 'see'] as WantList[])
      .map((l) => [l, wants.filter((w) => w.list === l && !w.doneAt).length])) as Record<WantList, number>
    const ticks = [...graph.entities.values()].filter((e) => e.lane && e.year)
    return { graph, path, recs, recent, counts, ticks, explored: stops.filter((s) => signals.visited.has(s)).length }
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
            </section>
          )}

          {home.path && (
            <button className="a-pathcard" onClick={() => nav.push({ name: 'path', id: home.path!.id })}>
              <span className="kick">Featured path · {home.path.stops.length} stops</span>
              <span className="ttl">{home.path.title}</span>
              <span className="sub">{home.path.subtitle}</span>
              <span className="pics">
                {home.path.stops.slice(0, 6).map((s) => <Picture key={s.entity.id} e={s.entity} className="mini" />)}
              </span>
              <span className="a-progress num"><span className="bar"><i style={{ width: `${(home.explored / home.path.stops.length) * 100}%` }} /></span>
                {home.explored ? `${home.explored} of ${home.path.stops.length} explored · Continue` : 'Start the path'}</span>
            </button>
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
        </div>
      )}
    </Screen>
  )
}
