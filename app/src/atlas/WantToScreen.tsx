import { useState } from 'react'
import { removeWant, setWantDone, type WantList } from '../data/atlasRepo'
import { useDb } from '../db/useDb'
import { useNav } from '../nav/context'
import { ErrorBox, Loading, Screen, SubMasthead } from '../ui/components'
import { Icon } from '../ui/icons'
import './atlas.css'
import { typeLabel, wantVerb } from './forms'
import { Picture } from './parts'
import { useAtlas } from './useAtlas'

const LISTS: WantList[] = ['read', 'watch', 'listen', 'see']

export function WantToScreen({ list: initial }: { list?: WantList }) {
  const { user } = useDb()
  const nav = useNav()
  const [tick, setTick] = useState(0)
  const ctx = useAtlas(tick)
  const [list, setList] = useState<WantList>(initial ?? 'read')
  const refresh = () => setTick((t) => t + 1)

  if (ctx.status !== 'ok') {
    return <Screen section="atlas" masthead={<SubMasthead title="Want to…" />}>{ctx.status === 'loading' ? <Loading /> : <ErrorBox error={ctx.error} />}</Screen>
  }
  const { wants, graph } = ctx.data
  const items = wants.filter((w) => w.list === list && graph.entities.has(w.entityId))
  const open = items.filter((w) => !w.doneAt)
  const done = items.filter((w) => w.doneAt)
  const row = (w: (typeof items)[number]) => {
    const e = graph.entities.get(w.entityId)!
    return (
      <li key={w.entityId} className={`a-want-row ${w.doneAt ? 'done' : ''}`}>
        <button className="main" onClick={() => nav.push({ name: 'entity', id: e.id })}>
          <Picture e={e} className="thumb" />
          <span className="txt">
            <span className="t">{e.title}</span>
            <span className="m num">{typeLabel(e.type, e.lane)}{e.year ? ` · ${e.year}` : ''}{w.fromLabel ? ` · ${w.fromLabel}` : ''}</span>
          </span>
        </button>
        <button className={`btn small ${w.doneAt ? '' : 'primary'}`} onClick={() => void setWantDone(user, w.entityId, !w.doneAt).then(refresh)}>
          {w.doneAt ? 'Undo' : `${wantVerb(list)} ✓`}
        </button>
        <button className="icon-btn" aria-label={`Remove ${e.title}`} onClick={() => void removeWant(user, w.entityId).then(refresh)}>
          <Icon name="trash" size={20} />
        </button>
      </li>
    )
  }
  return (
    <Screen section="atlas" masthead={<SubMasthead title="Want to…" />}>
      <div className="a-tabs" role="tablist">
        {LISTS.map((l) => {
          const n = wants.filter((w) => w.list === l && !w.doneAt).length
          return (
            <button key={l} role="tab" aria-selected={l === list} className={l === list ? 'on' : ''} onClick={() => setList(l)}>
              {wantVerb(l)} <span className="num">{n}</span>
            </button>
          )
        })}
      </div>
      {open.length === 0 && done.length === 0 && (
        <p className="muted">Nothing here yet. On any book, film, album or artwork in the Atlas, tap “+ Want to {list}”.</p>
      )}
      <ul className="a-want-list">{open.map(row)}</ul>
      {done.length > 0 && (
        <>
          <h3 className="a-done-head">Done</h3>
          <ul className="a-want-list">{done.map(row)}</ul>
        </>
      )}
    </Screen>
  )
}
