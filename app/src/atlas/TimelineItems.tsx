// 7e: adding to saved timelines — the user's own items (form) and Atlas entries (picker on entity pages).
import { useState } from 'react'
import {
  addEntityToTimeline, listSavedTimelines, removeEntityFromTimeline, saveTimeline, timelinesWithEntity,
  type EntitySummary, type Lane, type PersonalItem,
} from '../data/atlasRepo'
import { useDb } from '../db/useDb'
import { useNav } from '../nav/context'
import { useAsync } from '../ui/useAsync'
import { LANES } from './forms'

export const TL_FROM = 1890
export const TL_TO = 2029

/** title, year, lane, note and an optional link; the year must fall on the timeline */
export function PersonalItemForm({ initial, defaultYear, onSave, onCancel, onDelete }: {
  initial?: PersonalItem; defaultYear?: number; onSave: (p: PersonalItem) => Promise<void> | void; onCancel: () => void
  onDelete?: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [year, setYear] = useState(String(initial?.year ?? defaultYear ?? ''))
  const [lane, setLane] = useState<Lane>(initial?.lane ?? 'events')
  const [note, setNote] = useState(initial?.note ?? '')
  const [url, setUrl] = useState(initial?.url ?? '')
  const y = Number(year)
  const yearOk = Number.isInteger(y) && y >= TL_FROM && y <= TL_TO
  const urlOk = !url.trim() || /^https?:\/\/\S+$/i.test(url.trim())
  const ok = !!title.trim() && yearOk && urlOk
  return (
    <form className="a-suggest tl-own" onSubmit={(e) => {
      e.preventDefault()
      if (ok) void onSave({ title, year: y, lane, note: note || null, url: url || null })
    }}>
      <label htmlFor="tl-own-title">{initial ? 'Edit your item' : 'Add your own item'}</label>
      <input id="tl-own-title" value={title} autoFocus placeholder="What happened, or what is it?" onChange={(e) => setTitle(e.target.value)} />
      <div className="row">
        <input id="tl-own-year" aria-label="Year" className="yr" type="number" inputMode="numeric" min={TL_FROM} max={TL_TO}
               placeholder="Year" value={year} onChange={(e) => setYear(e.target.value)} />
        <select id="tl-own-lane" aria-label="Lane" value={lane} onChange={(e) => setLane(e.target.value as Lane)}>
          {LANES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </div>
      {year && !yearOk && <p className="muted small">The timeline runs from {TL_FROM} to {TL_TO}.</p>}
      <textarea id="tl-own-note" aria-label="Note" rows={2} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <input id="tl-own-url" aria-label="Link" type="url" inputMode="url" placeholder="Link (optional), https://…" value={url}
             onChange={(e) => setUrl(e.target.value)} />
      {!urlOk && <p className="muted small">Links start with http:// or https://</p>}
      <div className="row">
        <button className="btn small primary" type="submit" disabled={!ok}>{initial ? 'Save' : 'Add'}</button>
        <button className="btn small" type="button" onClick={onCancel}>Cancel</button>
        {onDelete && <button className="btn small danger" type="button" onClick={onDelete}>Delete</button>}
      </div>
    </form>
  )
}

/** Entity page: add this entry to any saved timeline (toggle), or start a new timeline with it. */
export function AddToTimeline({ e }: { e: EntitySummary }) {
  const { user } = useDb()
  const nav = useNav()
  const [open, setOpen] = useState(false)
  const [tick, setTick] = useState(0)
  const data = useAsync(async () => (open ? { list: await listSavedTimelines(user), with: await timelinesWithEntity(user, e.id) } : null),
    [user, e.id, open, tick])
  if (!e.lane || !e.year) return null
  if (!open) return <button className="btn" onClick={() => setOpen(true)}>+ Add to a timeline</button>
  const toggle = async (id: number, on: boolean) => {
    if (on) await removeEntityFromTimeline(user, id, e.id)
    else await addEntityToTimeline(user, id, e.id)
    setTick((t) => t + 1)
  }
  const create = async () => {
    const id = await saveTimeline(user, `My timeline: ${e.title}`,
      { zoom: 'decades', hidden: [], fromYear: Math.max(TL_FROM, Math.floor(e.year! / 10) * 10 - 20), selected: e.id, subject: null, mine: true })
    await addEntityToTimeline(user, id, e.id)
    nav.push({ name: 'timeline', saved: id })
  }
  return (
    <div className="a-addtl" role="group" aria-label="Add to a timeline">
      <span className="a-rel">Add to a timeline</span>
      {data.status === 'ok' && data.data && data.data.list.map((t) => {
        const on = data.data!.with.includes(t.id)
        return (
          <button key={t.id} className={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => void toggle(t.id, on)}>
            {on ? '✓ ' : '+ '}{t.name}
          </button>
        )
      })}
      <button className="chip" onClick={() => void create()}>New timeline with this</button>
      <button className="linklike" onClick={() => setOpen(false)}>Done</button>
    </div>
  )
}
