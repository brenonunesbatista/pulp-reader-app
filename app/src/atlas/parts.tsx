// Atlas building blocks (docs/design/banca-atlas.md, AtlasDS): type badge, pictures with credits, body with citations,
// recommendation cards, Want-to button, Read in Banca, external links.
import { useState, type ReactNode } from 'react'
import {
  addWant, listFor, removeWant, setWantDone, type AtlasImage, type CatalogRef, type EntitySummary, type EntityType,
  type Lane, type WantItem,
} from '../data/atlasRepo'
import { findIssueByMonth, findStory } from '../data/catalogRepo'
import { useDb } from '../db/useDb'
import { useNav } from '../nav/context'
import { openExternal } from '../notes/share'
import { coverUrl, monthYear } from '../ui/format'
import { Icon } from '../ui/icons'
import { useAsync } from '../ui/useAsync'
import { badgeLane, dates, laneVars, TYPE_ICON, typeLabel, wantVerb } from './forms'
import type { Rec } from './recommend'

export function TypeIcon({ type, size = 14 }: { type: EntityType; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={TYPE_ICON[type]} /></svg>
  )
}

export function TypeBadge({ type, lane }: { type: EntityType; lane: Lane | null }) {
  const l = badgeLane(type, lane)
  return (
    <span className={`a-badge ${l ? '' : 'outline'}`} style={laneVars(l)}>
      <TypeIcon type={type} />{typeLabel(type, lane)}
    </span>
  )
}

function imageSrc(img: AtlasImage): string | null {
  if (img.catalogCover) {
    const [mag, ym] = img.catalogCover.split('/')
    return coverUrl(`covers/${mag}-${ym}.webp`)
  }
  return img.url
}

/** Entity image: catalog cover (bundled) or a Wikimedia image loaded online; halftone "NO IMAGE" otherwise. */
export function Picture({ e, className = '', credit = false }: { e: EntitySummary; className?: string; credit?: boolean }) {
  const src = imageSrc(e.image)
  const [failed, setFailed] = useState(false)
  const online = typeof navigator === 'undefined' || navigator.onLine
  const show = src && !failed && (e.image.catalogCover || online)
  return (
    <figure className={`a-pic ${className}`} style={laneVars(badgeLane(e.type, e.lane))}>
      <div className="frame">
        {show
          ? <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(true)} />
          : <span className="noimg">{src && !online ? 'OFFLINE' : 'NO IMAGE'}</span>}
      </div>
      {credit && show && <Credit img={e.image} />}
    </figure>
  )
}

export function Credit({ img }: { img: AtlasImage }) {
  if (img.catalogCover) {
    const [, ym] = img.catalogCover.split('/')
    const [y, m] = ym.split('-').map(Number)
    return <figcaption className="a-credit">Cover, Amazing Stories, {monthYear(y, m)} · from the Banca catalog</figcaption>
  }
  return (
    <figcaption className="a-credit">
      {img.credit} · {img.license} ·{' '}
      {img.source && <button className="linklike" onClick={() => void openExternal(img.source!)}>Wikimedia Commons ↗</button>}
    </figcaption>
  )
}

/** Markdown body: paragraphs, *italic*, [n] citation markers that jump to the source and flash it. */
export function Body({ body, idPrefix }: { body: string; idPrefix: string }) {
  const blocks = body.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
  const jump = (n: string) => {
    const el = document.getElementById(`${idPrefix}-src-${n}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('flash')
    void el.offsetWidth
    el.classList.add('flash')
  }
  const inline = (t: string): ReactNode[] =>
    t.split(/(\*[^*]+\*|\[\d+\])/g).filter(Boolean).map((part, i) => {
      if (part.startsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>
      const m = /^\[(\d+)\]$/.exec(part)
      if (m) return <sup key={i}><button className="cite" onClick={() => jump(m[1])}>[{m[1]}]</button></sup>
      return part
    })
  return (
    <div className="a-body">
      {blocks.map((b, i) => {
        if (b.startsWith('## ')) {
          const [head, ...rest] = b.split('\n')
          return (
            <div key={i} className="why">
              <h4>{head.slice(3)}</h4>
              {rest.length > 0 && <p>{inline(rest.join(' '))}</p>}
            </div>
          )
        }
        return <p key={i}>{inline(b.split('\n').join(' '))}</p>
      })}
    </div>
  )
}

/** Recommendation card: the reason strip on top, the whole card opens the entity. */
export function RecCard({ rec, e, onOpen }: { rec: Rec; e: EntitySummary; onOpen: () => void }) {
  return (
    <button className="a-rec" onClick={onOpen}>
      <span className="reason">{rec.reason}</span>
      <span className="row">
        <Picture e={e} className="thumb" />
        <span className="txt">
          <TypeBadge type={e.type} lane={e.lane} />
          <span className="t">{e.title}</span>
          <span className="m num">{dates(e)}</span>
        </span>
      </span>
    </button>
  )
}

/** Small entity row/card used in connections and lists. */
export function EntityChip({ e, tag, onOpen, active = false }: { e: EntitySummary; tag?: string; onOpen: () => void; active?: boolean }) {
  return (
    <button className={`a-chip ${active ? 'on' : ''}`} onClick={onOpen} style={laneVars(badgeLane(e.type, e.lane))}>
      <span className="dot" />
      <span className="t">{e.title}</span>
      <span className="m num">{tag ?? dates(e)}</span>
    </button>
  )
}

/** "+ WANT TO READ" → "ON YOUR LIST" (tap = remove) → "READ ✓" when done. Nothing for people, themes, events. */
export function WantButton({ e, item, from, onChange, square = false }: {
  e: EntitySummary; item: WantItem | undefined; from: string; onChange: () => void; square?: boolean
}) {
  const { user } = useDb()
  const list = listFor(e.type)
  if (!list) return null
  const verb = wantVerb(list)
  const act = async () => {
    if (!item) await addWant(user, e.id, list, from)
    else if (item.doneAt) await setWantDone(user, e.id, false)
    else await removeWant(user, e.id)
    onChange()
  }
  const label = !item ? `+ Want to ${verb.toLowerCase()}` : item.doneAt ? `${verb} ✓` : 'On your list'
  return (
    <button className={`btn a-want ${item ? (item.doneAt ? 'done' : 'on') : ''} ${square ? 'square' : ''}`} onClick={() => void act()}
            aria-label={label}>
      {square ? (item ? '✓' : '+') : label}
    </button>
  )
}

/** READ IN BANCA (readable issue) or "IN AMAZING STORIES · NO SCAN YET" (opens the issue page). */
export function ReadInBanca({ refs }: { refs: CatalogRef[] }) {
  const { catalog } = useDb()
  const nav = useNav()
  const target = useAsync(async () => {
    for (const r of refs) {
      const issue = await findIssueByMonth(catalog, r.magazine, r.year, r.month)
      if (!issue) continue
      const story = r.story ? await findStory(catalog, issue.id, r.story) : null
      return { issue, story, readable: issue.availability === 'ia' && !!issue.iaIdentifier }
    }
    return null
  }, [catalog, refs])
  if (target.status !== 'ok' || !target.data) return null
  const { issue, story, readable } = target.data
  const mag = issue.title.replace(/,\s*\w+ \d{4}$/, '')
  if (!readable) {
    return (
      <button className="btn a-noscan" onClick={() => nav.push({ name: 'issue', id: issue.id })}>
        In {mag} · no scan yet
      </button>
    )
  }
  return (
    <button className="btn primary a-read" onClick={() => nav.push({ name: 'reader', issueId: issue.id, leaf: story?.iaLeaf ?? 0, storyId: story?.id })}>
      <span className="r-stamp">R</span>Read in Banca
    </button>
  )
}

export function ExternalLinks({ imdb, spotifyAlbum }: { imdb: string | null; spotifyAlbum: string | null }) {
  return (
    <>
      {imdb && <button className="btn a-ext" onClick={() => void openExternal(`https://www.imdb.com/title/${imdb}/`)}>IMDb <Icon name="forward" size={18} /></button>}
      {spotifyAlbum && <button className="btn a-ext" onClick={() => void openExternal(`https://open.spotify.com/album/${spotifyAlbum}`)}>Spotify <Icon name="forward" size={18} /></button>}
    </>
  )
}
