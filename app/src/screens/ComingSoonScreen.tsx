import { UPCOMING } from '../content/upcoming'
import { Cover, Masthead, Screen, SectionHeader } from '../ui/components'

const TEXT = {
  rpg: {
    title: 'RPG magazines',
    body: 'Tabletop RPG magazines for campaign inspiration — Dragon, Dungeon, The Space Gamer — are being indexed.',
  },
  atlas: {
    title: 'Atlas',
    body: 'An interactive timeline of stories, authors, magazines, films, music and art — and how they shaped each other. ' +
      'Coming in a later phase.',
  },
}

export function ComingSoonScreen({ what }: { what: 'rpg' | 'atlas' }) {
  const t = TEXT[what]
  const mags = UPCOMING.filter((u) => u.category === what)
  return (
    <Screen section={what} masthead={<Masthead section={what} />}>
      <div className="soon-panel">
        <h2>{t.title}</h2>
        <p>{t.body}</p>
        <span className="label muted">Coming soon</span>
      </div>
      {mags.length > 0 && (
        <section>
          <SectionHeader title="On the way" />
          <div className="mag-grid">
            {mags.map((u) => (
              <button key={u.title} className="mag-card" disabled>
                <div className="mosaic">{Array.from({ length: 6 }, (_, i) => <Cover key={i} path={null} small />)}</div>
                <div className="info">
                  <div className="title">{u.title}</div>
                  <div className="muted small num">{u.years}</div>
                  <span className="tag soon">COMING SOON</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </Screen>
  )
}
