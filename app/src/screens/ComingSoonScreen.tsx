import { listCategories, listMagazines } from '../data/catalogRepo'
import { useDb } from '../db/useDb'
import { Masthead, Screen } from '../ui/components'
import { useAsync } from '../ui/useAsync'
import { MagazineShelf } from './MagazineGrid'

const TEXT = {
  rpg: {
    title: 'RPG magazines',
    body: 'Tabletop RPG magazines for campaign inspiration — Dragon, Dungeon, The Space Gamer — are being indexed.',
  },
  comics: {
    title: 'Comics',
    body: 'Comics and collected editions.',
  },
  atlas: {
    title: 'Atlas',
    body: 'An interactive timeline of stories, authors, magazines, films, music and art — and how they shaped each other.',
  },
}

/** A tab whose category may still be empty: its magazines once indexed, a "coming soon" panel until then. */
export function ComingSoonScreen({ what }: { what: 'rpg' | 'comics' | 'atlas' }) {
  const { catalog } = useDb()
  const t = TEXT[what]
  const data = useAsync(async () => ({ categories: await listCategories(catalog), magazines: await listMagazines(catalog) }), [catalog])
  const category = data.status === 'ok' ? data.data.categories.find((c) => c.slug === what) : undefined
  const indexed = data.status === 'ok' && data.data.magazines.some((m) => m.category === what)
  return (
    <Screen section={what} masthead={<Masthead section={what} />}>
      {!indexed && (
        <div className="soon-panel">
          <h2>{t.title}</h2>
          <p>{t.body}</p>
          <span className="label muted">Coming soon</span>
        </div>
      )}
      {category && data.status === 'ok' && <MagazineShelf category={category} magazines={data.data.magazines} />}
    </Screen>
  )
}
