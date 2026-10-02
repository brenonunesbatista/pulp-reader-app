import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  addWant, getEntity, getPath, listWants, loadGraph, recentVisits, recordVisit, removeWant, searchAtlas, setWantDone,
  type AtlasGraph, type EntitySummary,
} from '../data/atlasRepo'
import { migrateUserDb } from '../db/userSchema'
import { dbFromBytes, memoryDb } from '../db/wasmDb'
import { NO_SIGNALS, recommendFrom, recommendHome } from './recommend'

const e = (id: string, year: number | null, lane: EntitySummary['lane'], type: EntitySummary['type'] = 'work'): EntitySummary => ({
  id, type, title: id.toUpperCase(), subtitle: '', lane, date: year ? String(year) : null, year, endYear: null,
  image: { url: null, credit: null, license: null, source: null, catalogCover: null },
})

function graph(): AtlasGraph {
  const ents = [e('wells', null, null, 'person'), e('tm', 1895, 'books'), e('tm-film', 1960, 'film-tv', 'film'),
    e('wotw', 1898, 'books'), e('radio', 1938, 'film-tv', 'radio'), e('nightfall', 1941, 'magazines'),
    e('tt', null, null, 'theme'), e('same-year', 1898, 'events', 'event')]
  const L = (src: string, rel: AtlasGraph['links'][number]['rel'], dst: string, note: string | null = null) => [
    { src, rel, dst, inverse: false, note }, { src: dst, rel, dst: src, inverse: true, note: null }]
  return {
    entities: new Map(ents.map((x) => [x.id, x])),
    links: [...L('tm', 'created_by', 'wells'), ...L('wotw', 'created_by', 'wells'), ...L('tm', 'adapted_as', 'tm-film'),
      ...L('wotw', 'adapted_as', 'radio'), ...L('wells', 'read_next', 'tm', 'Start with the time machine')],
    themes: new Map([['tm', ['tt']], ['tm-film', ['tt']]]),
  }
}

describe('recommendations', () => {
  it('ranks curated links first and explains each pick', () => {
    const r = recommendFrom(graph(), 'wells')
    expect(r[0]).toMatchObject({ id: 'tm', reason: 'START WITH THE TIME MACHINE' })
    expect(r.map((x) => x.id)).toContain('wotw')
    const tm = recommendFrom(graph(), 'tm')
    expect(tm[0]).toMatchObject({ id: 'tm-film', reason: 'ADAPTED AS' }) // adaptation + same theme
    expect(tm.find((x) => x.id === 'wells')?.reason).toBe('CREATED BY')
    expect(tm.map((x) => x.id)).not.toContain('tt') // themes are browsed, not recommended
    expect(recommendFrom(graph(), 'wotw').find((x) => x.id === 'same-year')?.reason).toBe('HAPPENED THE SAME YEAR')
  })

  it('uses the path and the user history', () => {
    const path = ['wells', 'tm', 'wotw']
    expect(recommendFrom(graph(), 'tm', NO_SIGNALS, path).find((x) => x.id === 'wotw')?.reason).toBe('NEXT ON YOUR PATH')
    // nothing known about the user: start of the path
    expect(recommendHome(graph(), NO_SIGNALS, path)[0]).toMatchObject({ id: 'wells', reason: 'START HERE' })
    // read The Time Machine in Banca → its film is suggested, the book itself is not
    const home = recommendHome(graph(), { ...NO_SIGNALS, read: new Set(['tm']) }, path)
    expect(home[0]).toMatchObject({ id: 'tm-film', reason: 'BECAUSE YOU READ TM' })
    expect(home.map((x) => x.id)).not.toContain('tm')
    // already done items sink
    const done = recommendFrom(graph(), 'wells', { ...NO_SIGNALS, done: new Set(['tm']) })
    expect(done[0].id).toBe('wotw')
  })
})

const ATLAS = fileURLToPath(new URL('../../public/atlas/atlas.db', import.meta.url))

describe.skipIf(!existsSync(ATLAS))('atlas.db (built content)', () => {
  it('reads entities with links, sources, catalog refs, paths and search', async () => {
    const atlas = await dbFromBytes(new Uint8Array(readFileSync(ATLAS)))
    const tm = await getEntity(atlas, 'the-time-machine')
    expect(tm?.catalog).toEqual([{ magazine: 'amazing-stories', year: 1927, month: 5, story: 'The Time Machine' }])
    expect(tm?.links.find((l) => l.rel === 'adapted_as')?.other.id).toBe('the-time-machine-1960-film')
    expect(tm?.sources.length).toBeGreaterThan(0)
    expect(tm?.themes.map((t) => t.id)).toEqual(['time-travel'])
    const path = await getPath(atlas, 'from-wells-to-foundation')
    expect(path?.stops[0].entity.id).toBe('h-g-wells')
    expect((await searchAtlas(atlas, 'morlock')).map((x) => x.id)).toContain('the-time-machine')
    const g = await loadGraph(atlas)
    expect(recommendFrom(g, 'the-war-of-the-worlds').length).toBeGreaterThan(3)
  })
})

describe('want-to lists and visits (user.db v4)', () => {
  it('adds, completes, removes and records visits', async () => {
    const u = await memoryDb()
    await migrateUserDb(u)
    await addWant(u, 'tm-film', 'watch', 'from Timeline', 1)
    await addWant(u, 'nightfall', 'read', null, 2)
    await setWantDone(u, 'tm-film', true, 3)
    expect((await listWants(u)).map((w) => [w.entityId, w.doneAt])).toEqual([['nightfall', null], ['tm-film', 3]])
    await removeWant(u, 'nightfall')
    expect(await listWants(u)).toHaveLength(1)
    await recordVisit(u, 'wells', 10)
    await recordVisit(u, 'tm', 20)
    await recordVisit(u, 'wells', 30)
    expect(await recentVisits(u)).toEqual([{ entityId: 'wells', lastAt: 30, count: 2 }, { entityId: 'tm', lastAt: 20, count: 1 }])
  })
})
