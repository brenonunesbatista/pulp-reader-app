import { useEffect, useRef, useState } from 'react'
import { getPath } from '../data/atlasRepo'
import { useDb } from '../db/useDb'
import { useNav } from '../nav/context'
import { ErrorBox, Loading, Screen, SubMasthead } from '../ui/components'
import { useAsync } from '../ui/useAsync'
import './atlas.css'
import { dates } from './forms'
import { Picture, TypeBadge } from './parts'
import { useAtlas } from './useAtlas'

/** A guided path, like a museum route: numbered stops on a line; the current stop opens inline. */
export function PathScreen({ id }: { id: string }) {
  const { atlas } = useDb()
  const nav = useNav()
  const path = useAsync(() => getPath(atlas, id), [atlas, id])
  const ctx = useAtlas()
  const visited = ctx.status === 'ok' ? ctx.data.signals.visited : new Map<string, number>()
  const [sel, setSel] = useState<number | null>(null)
  const refs = useRef<(HTMLLIElement | null)[]>([])

  const stops = path.status === 'ok' && path.data ? path.data.stops : []
  const firstNew = stops.findIndex((s) => !visited.has(s.entity.id))
  const current = sel ?? (firstNew >= 0 ? firstNew : 0)
  const done = stops.filter((s) => visited.has(s.entity.id)).length

  useEffect(() => { refs.current[current]?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [current])

  if (path.status !== 'ok' || !path.data) {
    return <Screen section="atlas" masthead={<SubMasthead title="Path" />}>
      {path.status === 'error' ? <ErrorBox error={path.error} /> : path.status === 'ok' ? <ErrorBox error="Path not found" /> : <Loading />}
    </Screen>
  }
  const p = path.data
  return (
    <Screen section="atlas" masthead={<SubMasthead title="Path" sub={p.title} />}>
      <header className="a-path-head">
        <h1 className="a-title">{p.title}</h1>
        <p className="a-sub">{p.subtitle}</p>
        <div className="a-progress num"><div className="bar"><i style={{ width: `${(done / stops.length) * 100}%` }} /></div>
          {done} of {stops.length} stops explored</div>
      </header>
      <ol className="a-stops">
        {stops.map((s, i) => {
          const open = i === current
          const seen = visited.has(s.entity.id)
          return (
            <li key={s.entity.id} ref={(el) => { refs.current[i] = el }} className={`${open ? 'open' : ''} ${seen ? 'seen' : ''}`}>
              <button className="a-stop" onClick={() => setSel(i)} aria-expanded={open}>
                <span className="n num">{i + 1}</span>
                <span className="yr num">{s.entity.year ?? ''}</span>
                <span className="t">{s.entity.title}</span>
                {seen && <span className="seen-tag">✓</span>}
              </button>
              {open && (
                <div className="a-stop-body">
                  <Picture e={s.entity} className="stop-pic" />
                  <div className="txt">
                    <div className="a-kicker"><TypeBadge type={s.entity.type} lane={s.entity.lane} /><span className="num">{dates(s.entity)}</span></div>
                    <p className="a-sub">{s.entity.subtitle}</p>
                    <p className="why-it"><b>Why it matters · </b>{s.why}</p>
                    <div className="a-actions row">
                      <button className="btn primary" onClick={() => nav.push({ name: 'entity', id: s.entity.id })}>Open</button>
                      {i + 1 < stops.length && <button className="btn" onClick={() => setSel(i + 1)}>Next stop</button>}
                    </div>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ol>
      {current + 1 < stops.length && (
        <button className="a-nextbar" onClick={() => setSel(current + 1)}>
          Next stop · {stops[current + 1].entity.title}
        </button>
      )}
    </Screen>
  )
}
