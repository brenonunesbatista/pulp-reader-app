import { useEffect, useMemo, useState } from 'react'
import { entitiesWithTheme, getEntity, recordVisit, type AtlasLink } from '../data/atlasRepo'
import { useDb } from '../db/useDb'
import { useNav } from '../nav/context'
import { openExternal } from '../notes/share'
import { ErrorBox, Loading, Screen, SectionHeader, SubMasthead } from '../ui/components'
import { Icon } from '../ui/icons'
import { useAsync } from '../ui/useAsync'
import './atlas.css'
import { dates, LANES, linkLabel, linkTone, typeLabel } from './forms'
import { Body, EntityChip, ExternalLinks, Picture, ReadInBanca, RecCard, TypeBadge, WantButton } from './parts'
import { recommendFrom } from './recommend'
import { useAtlas } from './useAtlas'

export function EntityScreen({ id }: { id: string }) {
  const { atlas, user } = useDb()
  const nav = useNav()
  const [tick, setTick] = useState(0)
  const data = useAsync(async () => {
    const e = await getEntity(atlas, id)
    if (!e) throw new Error(`Nothing in the Atlas called "${id}"`)
    const members = e.type === 'theme' ? await entitiesWithTheme(atlas, id) : []
    return { e, members }
  }, [atlas, id])
  const ctx = useAtlas(tick)

  useEffect(() => { void recordVisit(user, id) }, [user, id])

  const groups = useMemo(() => {
    if (data.status !== 'ok') return []
    const m = new Map<string, AtlasLink[]>()
    for (const l of data.data.e.links) {
      const k = linkLabel(l.rel, l.inverse)
      m.set(k, [...(m.get(k) ?? []), l])
    }
    return [...m]
  }, [data])

  const recs = useMemo(() => {
    if (ctx.status !== 'ok') return []
    const stops = ctx.data.paths[0]?.stops.map((s) => s.entity.id) ?? []
    return recommendFrom(ctx.data.graph, id, ctx.data.signals, stops, 6)
  }, [ctx, id])

  if (data.status !== 'ok') {
    return <Screen section="atlas" masthead={<SubMasthead title="Atlas" />}>{data.status === 'loading' ? <Loading /> : <ErrorBox error={data.error} />}</Screen>
  }
  const { e, members } = data.data
  const open = (other: string) => nav.push({ name: 'entity', id: other })
  const want = ctx.status === 'ok' ? ctx.data.wants.find((w) => w.entityId === e.id) : undefined
  const lane = LANES.find((l) => l.id === e.lane)
  const onTimeline = ['person', 'theme', 'event', 'movement'].includes(e.type) || !!e.lane

  return (
    <Screen section="atlas" masthead={
      <SubMasthead title="Atlas" sub={e.title}>
        <button className="sq-btn" aria-label="Timeline" onClick={() => nav.push({ name: 'timeline', focus: e.id })}><Icon name="atlas" size={22} /></button>
      </SubMasthead>
    }>
      <div className="a-entity">
        <aside className="a-side">
          <Picture e={e} className={`hero ${e.type === 'person' ? 'portrait' : ''}`} credit />
          <div className="a-actions">
            {e.catalog.length > 0 && <ReadInBanca refs={e.catalog} />}
            <WantButton e={e} item={want} from={`from ${e.title}`} onChange={() => setTick((t) => t + 1)} />
            <ExternalLinks imdb={e.imdb} spotifyAlbum={e.spotifyAlbum} />
            {onTimeline && (
              <button className="btn" onClick={() => nav.push({ name: 'timeline', focus: e.id })}>Show on timeline</button>
            )}
          </div>
          <dl className="a-facts">
            <dt>Type</dt><dd>{typeLabel(e.type, e.lane)}</dd>
            {e.date && <><dt>{e.type === 'person' ? 'Life' : 'Date'}</dt><dd className="num">{dates(e, e.end)}</dd></>}
            {lane && <><dt>Timeline</dt><dd>{lane.label}</dd></>}
            {e.themes.length > 0 && <><dt>Themes</dt><dd className="a-themes">
              {e.themes.map((t) => <button key={t.id} className="chip" onClick={() => open(t.id)}>{t.title}</button>)}
            </dd></>}
          </dl>
        </aside>

        <article className="a-main">
          <div className="a-kicker"><TypeBadge type={e.type} lane={e.lane} /><span className="num">{dates(e, e.end)}</span></div>
          <h1 className="a-title">{e.title}</h1>
          <p className="a-sub">{e.subtitle}</p>
          <Body body={e.body} idPrefix={e.id} />

          {members.length > 0 && (
            <section className="a-sec">
              <SectionHeader title="In this theme" />
              <div className="a-chips">{members.map((m) => <EntityChip key={m.id} e={m} onOpen={() => open(m.id)} />)}</div>
            </section>
          )}

          {groups.length > 0 && (
            <section className="a-sec">
              <SectionHeader title="Connections" />
              {groups.map(([label, links]) => (
                <div key={label} className="a-group">
                  <span className={`a-rel ${linkTone(links[0].rel)}`}>{label}</span>
                  <div className="a-chips">
                    {links.map((l) => <EntityChip key={l.other.id + label} e={l.other} tag={l.note ?? undefined} onOpen={() => open(l.other.id)} />)}
                  </div>
                </div>
              ))}
            </section>
          )}

          {recs.length > 0 && ctx.status === 'ok' && (
            <section className="a-sec">
              <SectionHeader title="Explore next" />
              <div className="a-recs">
                {recs.map((r) => {
                  const other = ctx.data.graph.entities.get(r.id)
                  return other ? <RecCard key={r.id} rec={r} e={other} onOpen={() => open(r.id)} /> : null
                })}
              </div>
            </section>
          )}

          {e.sources.length > 0 && (
            <section className="a-sec">
              <SectionHeader title="Sources" />
              <ol className="a-sources">
                {e.sources.map((s) => (
                  <li key={s.n} id={`${e.id}-src-${s.n}`}>
                    <span className="n num">[{s.n}]</span>
                    {s.url.startsWith('http')
                      ? <button className="linklike" onClick={() => void openExternal(s.url)}>{s.title}</button>
                      : <span>{s.title}</span>}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </article>
      </div>
    </Screen>
  )
}
