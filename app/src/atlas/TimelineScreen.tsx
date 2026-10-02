// Atlas timeline (docs/design/banca-atlas.md, layout B): an overview strip (1890 → today, one row per lane, a bracket
// for the visible period) above a "stage" of decade or year columns. Tap = select: connected items get a relation tag,
// the rest dim, and a sheet lists the connections. Phones get a vertical list grouped by decade/year.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { entitiesWithTheme, type EntitySummary, type Lane } from '../data/atlasRepo'
import { useDb } from '../db/useDb'
import { useNav } from '../nav/context'
import { ErrorBox, Loading, Screen, SubMasthead } from '../ui/components'
import { Icon } from '../ui/icons'
import { useSizeClass } from '../ui/sizeClass'
import { useAsync } from '../ui/useAsync'
import './atlas.css'
import { dates, LANES, LANE_TOKEN, laneVars, linkLabel } from './forms'
import { EntityChip, Picture, TypeBadge, WantButton } from './parts'
import { useAtlas } from './useAtlas'

const FROM = 1890
const TO = 2029
type Zoom = 'decades' | 'years'
const LANE_ORDER = new Map(LANES.map((l, i) => [l.id, i]))

export function TimelineScreen({ focus }: { focus?: string }) {
  const { atlas } = useDb()
  const nav = useNav()
  const compact = useSizeClass() === 'compact'
  const [tick, setTick] = useState(0)
  const ctx = useAtlas(tick)
  const [zoom, setZoom] = useState<Zoom>('decades')
  const [hidden, setHidden] = useState<Set<Lane>>(new Set())
  const [selected, setSelected] = useState<string | null>(focus ?? null)
  const [more, setMore] = useState<{ label: string; items: EntitySummary[] } | null>(null)
  const [lanesOpen, setLanesOpen] = useState(false)
  const themeMembers = useAsync(async () => {
    const e = selected && ctx.status === 'ok' ? ctx.data.graph.entities.get(selected) : null
    return e?.type === 'theme' ? (await entitiesWithTheme(atlas, e.id)).map((x) => x.id) : []
  }, [atlas, selected, ctx.status])

  const g = ctx.status === 'ok' ? ctx.data.graph : null
  const items = useMemo(() => (g ? [...g.entities.values()].filter((e) => e.lane && e.year && !hidden.has(e.lane)) : []), [g, hidden])

  /** connected entity → relation label (as seen from the selection) */
  const connected = useMemo(() => {
    const m = new Map<string, string>()
    if (!g || !selected) return m
    for (const l of g.links) if (l.src === selected) m.set(l.dst, linkLabel(l.rel, l.inverse))
    for (const t of g.themes.get(selected) ?? []) {
      for (const [id, ts] of g.themes) if (id !== selected && ts.includes(t) && !m.has(id)) m.set(id, 'Same theme')
    }
    if (themeMembers.status === 'ok') for (const id of themeMembers.data) if (!m.has(id)) m.set(id, 'In this theme')
    return m
  }, [g, selected, themeMembers])

  const span = zoom === 'decades' ? 10 : 1
  const columns = useMemo(() => {
    const cols: { start: number; label: string }[] = []
    for (let y = zoom === 'decades' ? FROM : FROM; y <= TO; y += span) cols.push({ start: y, label: zoom === 'decades' ? `${y}s` : String(y) })
    return cols
  }, [zoom, span])
  const byCol = useMemo(() => {
    const m = new Map<number, EntitySummary[]>()
    for (const e of items) {
      const c = Math.floor((e.year! - FROM) / span)
      m.set(c, [...(m.get(c) ?? []), e])
    }
    const rank = (e: EntitySummary) => (e.id === selected ? 0 : connected.has(e.id) ? 1 : 2)
    for (const list of m.values()) {
      list.sort((a, b) => rank(a) - rank(b) || a.year! - b.year! || (LANE_ORDER.get(a.lane!)! - LANE_ORDER.get(b.lane!)!))
    }
    return m
  }, [items, span, selected, connected])

  // ---- stage scrolling (tablet) / list (phone) ------------------------------------------------------------------
  const stage = useRef<HTMLDivElement>(null)
  const visibleCols = compact ? 1 : zoom === 'decades' ? 6 : 9
  const [first, setFirst] = useState(0)
  const colWidth = () => (stage.current ? stage.current.clientWidth / visibleCols : 1)
  const onScroll = () => {
    const el = stage.current
    if (el) setFirst(Math.round(el.scrollLeft / colWidth()))
  }
  const scrollToYear = useCallback((year: number, smooth = true) => {
    const c = Math.max(0, Math.floor((year - FROM) / span) - Math.floor(visibleCols / 2))
    if (compact) {
      document.getElementById(`tl-g-${Math.floor((year - FROM) / span)}`)?.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
    } else {
      stage.current?.scrollTo({ left: c * colWidth(), behavior: smooth ? 'smooth' : 'auto' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- colWidth reads the live element
  }, [span, visibleCols, compact])

  // centre on the focus / selection when it changes or when the zoom changes
  const centreYear = useMemo(() => {
    if (!g || !selected) return 1926
    const e = g.entities.get(selected)
    if (e?.year && e.lane) return e.year
    const ys = [...connected.keys()].map((id) => g.entities.get(id)?.year).filter((y): y is number => !!y)
    return ys.length ? Math.min(...ys) : 1926
  }, [g, selected, connected])
  useLayoutEffect(() => { if (g) scrollToYear(centreYear, false) }, [g, zoom, compact]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (g && selected) scrollToYear(centreYear) }, [selected]) // eslint-disable-line react-hooks/exhaustive-deps

  if (ctx.status !== 'ok' || !g) {
    return <Screen section="atlas" masthead={<SubMasthead title="Timeline" />}>{ctx.status === 'error' ? <ErrorBox error={ctx.error} /> : <Loading />}</Screen>
  }
  const sel = selected ? g.entities.get(selected) ?? null : null
  const select = (id: string) => setSelected((cur) => (cur === id ? null : id))
  const max = compact ? 3 : zoom === 'decades' ? 4 : 3
  const visFrom = FROM + first * span
  const visTo = Math.min(TO, visFrom + visibleCols * span - 1)

  const card = (e: EntitySummary) => {
    const rel = connected.get(e.id)
    const state = e.id === selected ? 'sel' : rel ? 'con' : selected ? 'dim' : ''
    return compact ? (
      <button key={e.id} className={`tl-row ${state}`} style={laneVars(e.lane)} onClick={() => select(e.id)}>
        <span className="yr num">{e.year}</span><span className="sq" />
        <span className="t">{e.title}{rel && <span className="tag">{rel}</span>}</span>
      </button>
    ) : (
      <button key={e.id} className={`tl-card ${state}`} style={laneVars(e.lane)} onClick={() => select(e.id)}>
        {rel && <span className="tag">{rel}</span>}
        <Picture e={e} className="tl-thumb" />
        <span className="t">{e.title}</span>
        <span className="m num">{e.year} · {LANES.find((l) => l.id === e.lane)?.short}</span>
      </button>
    )
  }

  const overview = (
    <div className="tl-overview" role="slider" aria-label="Timeline period" aria-valuemin={FROM} aria-valuemax={TO} aria-valuenow={visFrom}
         onClick={(ev) => {
           const r = ev.currentTarget.getBoundingClientRect()
           scrollToYear(Math.round(FROM + ((ev.clientX - r.left) / r.width) * (TO - FROM)))
         }}>
      {LANES.filter((l) => !hidden.has(l.id)).map((l) => (
        <div key={l.id} className="tl-ov-row">
          {items.filter((e) => e.lane === l.id).map((e) => (
            <i key={e.id} className={e.id === selected ? 'pin-sel' : connected.has(e.id) ? 'pin-con' : ''}
               style={{ left: `${((e.year! - FROM) / (TO - FROM)) * 100}%`, background: `var(--lane-${LANE_TOKEN[l.id]})` }} />
          ))}
        </div>
      ))}
      {!compact && <span className="tl-bracket" style={{ left: `${((visFrom - FROM) / (TO - FROM)) * 100}%`, width: `${((visTo - visFrom + 1) / (TO - FROM)) * 100}%` }} />}
      <span className="tl-ov-axis num"><span>{FROM}</span><span>1920</span><span>1950</span><span>1980</span><span>2010</span></span>
    </div>
  )

  const controls = (
    <div className="tl-controls">
      <div className="segmented small">
        {(['decades', 'years'] as Zoom[]).map((z) => (
          <button key={z} className={zoom === z ? 'on' : ''} onClick={() => setZoom(z)}>{z === 'decades' ? 'Decades' : 'Years'}</button>
        ))}
      </div>
      <label className="tl-jump">Year
        <input id="tl-year" type="number" inputMode="numeric" min={FROM} max={TO} placeholder="1938"
               onKeyDown={(e) => { if (e.key === 'Enter') scrollToYear(Number((e.target as HTMLInputElement).value)) }} />
      </label>
      {compact
        ? <button className="chip" onClick={() => setLanesOpen((v) => !v)}><Icon name="filter" size={18} />Lanes</button>
        : <LaneChips hidden={hidden} setHidden={setHidden} />}
    </div>
  )

  const sheet = sel && (
    <aside className={`tl-sheet ${compact ? 'bottom' : 'side'}`}>
      <button className="tl-close" aria-label="Close" onClick={() => setSelected(null)}><Icon name="close" size={20} /></button>
      <div className="a-kicker"><TypeBadge type={sel.type} lane={sel.lane} /><span className="num">{dates(sel)}</span></div>
      <h2 className="tl-title">{sel.title}</h2>
      <p className="a-sub">{sel.subtitle}</p>
      <div className="a-actions row">
        <button className="btn primary" onClick={() => nav.push({ name: 'entity', id: sel.id })}>Open</button>
        <WantButton e={sel} item={ctx.data.wants.find((w) => w.entityId === sel.id)} from="from Timeline" onChange={() => setTick((t) => t + 1)} square={compact} />
      </div>
      {connected.size > 0 && (
        <div className="tl-cons">
          {groupBy([...connected], ([, label]) => label).map(([label, list]) => (
            <div key={label} className="a-group">
              <span className="a-rel">{label}</span>
              <div className="a-chips">
                {list.map(([id]) => {
                  const e = g.entities.get(id)
                  if (!e) return null
                  const outside = !compact && !!e.lane && !!e.year && (e.year < visFrom || e.year > visTo)
                  return <EntityChip key={id} e={e} tag={outside && e.year ? `${e.year} · elsewhere` : undefined} onOpen={() => select(id)} />
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </aside>
  )

  return (
    <Screen section="atlas" masthead={<SubMasthead title="Timeline" sub={sel ? sel.title : '1890 → today'} />}>
      <div className={`tl ${compact ? 'phone' : 'tablet'} ${sel ? 'has-sel' : ''}`}>
        {overview}
        {controls}
        {compact && lanesOpen && <div className="tl-lanes-sheet"><LaneChips hidden={hidden} setHidden={setHidden} /></div>}
        {compact ? (
          <div className="tl-list">
            {columns.map((c, i) => {
              const list = byCol.get(i) ?? []
              if (!list.length) return null
              return (
                <section key={c.start} id={`tl-g-${i}`} className="tl-group">
                  <h3 className="num">{c.label}</h3>
                  {list.slice(0, max).map(card)}
                  {list.length > max && <button className="tl-more" onClick={() => setMore({ label: c.label, items: list })}>+{list.length - max} more in the {c.label}</button>}
                </section>
              )
            })}
          </div>
        ) : (
          <div className="tl-body">
            <div ref={stage} className="tl-stage" onScroll={onScroll} style={{ ['--cols' as string]: visibleCols }}>
              {columns.map((c, i) => {
                const near = i >= first - 1 && i <= first + visibleCols + 1
                const list = near ? byCol.get(i) ?? [] : []
                return (
                  <div key={c.start} className="tl-col">
                    <h3 className="num">{c.label}</h3>
                    {list.slice(0, max).map(card)}
                    {list.length > max && <button className="tl-more" onClick={() => setMore({ label: c.label, items: list })}>+{list.length - max} more</button>}
                  </div>
                )
              })}
            </div>
            {sheet}
          </div>
        )}
        {compact && sheet}
      </div>
      {more && (
        <div className="tl-modal" role="dialog" aria-label={`Everything in the ${more.label}`} onClick={() => setMore(null)}>
          <div className="box" onClick={(e) => e.stopPropagation()}>
            <h3>{more.label}</h3>
            <div className="a-chips">
              {more.items.map((e) => <EntityChip key={e.id} e={e} onOpen={() => { setMore(null); setSelected(e.id) }} />)}
            </div>
            <button className="btn" onClick={() => setMore(null)}>Close</button>
          </div>
        </div>
      )}
    </Screen>
  )
}

function LaneChips({ hidden, setHidden }: { hidden: Set<Lane>; setHidden: (s: Set<Lane>) => void }) {
  return (
    <div className="tl-lanes">
      {LANES.map((l) => (
        <button key={l.id} className={`chip lane-chip ${hidden.has(l.id) ? '' : 'on'}`} style={laneVars(l.id)} aria-pressed={!hidden.has(l.id)}
                onClick={() => { const s = new Set(hidden); if (s.has(l.id)) s.delete(l.id); else s.add(l.id); setHidden(s) }}>
          <span className="sw" />{l.short}
        </button>
      ))}
    </div>
  )
}

function groupBy<T>(xs: T[], key: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>()
  for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x])
  return [...m]
}
