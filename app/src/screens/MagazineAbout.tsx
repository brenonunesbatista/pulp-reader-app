import { Fragment, useState, type ReactNode } from 'react'
import type { MagazineAbout as About } from '../data/models'
import { useNav } from '../nav/context'
import { openExternal } from '../notes/share'

/** "*italic*" and "[n]" citations of a description paragraph */
function rich(text: string): ReactNode[] {
  return text.split(/(\*[^*]+\*|\[\d+\])/g).map((part, i) => {
    if (/^\*[^*]+\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>
    if (/^\[\d+\]$/.test(part)) return <sup key={i} className="cite">{part.slice(1, -1)}</sup>
    return <Fragment key={i}>{part}</Fragment>
  })
}

/** "About" band on a magazine page: history, purpose and era, with facts and sources (content/magazines/). */
export function MagazineAbout({ about }: { about: About }) {
  const nav = useNav()
  const [sources, setSources] = useState(false)
  return (
    <section className="mag-about" aria-label="About this magazine">
      <div className="facts muted small">
        <span className="num">{about.years}</span> · {about.country} · {about.language}
        {about.publishers.length > 0 && <> · {about.publishers.join(', ')}</>}
      </div>
      {about.text.split(/\n\s*\n/).map((p, i) => <p key={i}>{rich(p.replace(/\s+/g, ' '))}</p>)}
      <div className="row">
        {about.atlas && (
          <button className="btn small" onClick={() => nav.push({ name: 'entity', id: about.atlas! })}>In the Atlas</button>
        )}
        <button className="linklike small" aria-expanded={sources} onClick={() => setSources((v) => !v)}>
          {sources ? 'Hide sources' : `Sources (${about.sources.length})`}
        </button>
      </div>
      {sources && (
        <ol className="sources small">
          {about.sources.map((s) => (
            <li key={s.n}><span className="num">[{s.n}]</span>{' '}
              <button className="linklike" onClick={() => void openExternal(s.url)}>{s.title}</button></li>
          ))}
        </ol>
      )}
    </section>
  )
}
