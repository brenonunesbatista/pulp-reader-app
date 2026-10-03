import { beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/types'
import { memoryDb } from '../db/wasmDb'
import { migrateUserDb, USER_MIGRATIONS } from '../db/userSchema'
import { coverUrl } from '../ui/format'
import { getContents, getIssue, getPersonWorks, listCategories, listIssues, listMagazines, search } from './catalogRepo'
import { ftsQuery } from './fts'
import { addHighlight, deleteHighlight, getPageMap, listBookmarks, listHighlights, savePageMap, setBookmark } from './annotationRepo'
import { deleteAllProgress, deleteProgress, getProgress, recentProgress, saveProgress } from './progressRepo'
import { testCatalog } from './testCatalog'

let db: Db
beforeAll(async () => {
  db = await testCatalog()
})

describe('ftsQuery', () => {
  it('prefixes every token and strips FTS syntax', () => {
    expect(ftsQuery('Wells  tim')).toBe('"wells"* "tim"*')
    expect(ftsQuery('a"b* (c) {d}: -e')).toBe('"a"* "b"* "c"* "d"* "e"*')
    expect(ftsQuery('   ')).toBeNull()
    expect(ftsQuery('wells', ['authors'])).toBe('{authors} : ("wells"*)')
  })
})

describe('catalog', () => {
  it('lists magazines with counts and a cover mosaic', async () => {
    const [m] = await listMagazines(db)
    expect(m).toMatchObject({ name: 'Amazing Stories', issueCount: 3, readable: 2, firstYear: 1926, lastYear: 1940 })
    expect(m.covers).toHaveLength(3)
  })

  it('groups magazines by category; scans without a catalog cover use the Internet Archive cover', async () => {
    expect(await listCategories(db)).toEqual([{ slug: 'pulp', name: 'Pulp & science fiction' }, { slug: 'rpg', name: 'RPG magazines' }])
    const mags = await listMagazines(db)
    expect(mags.map((m) => [m.slug, m.category])).toEqual([['amazing-stories', 'pulp'], ['galaxy', 'pulp']])
    expect(mags[1].covers).toEqual(['ia:Galaxy_v01n01_1950-10'])
    expect((await getIssue(db, 4))?.coverPath).toBe('ia:Galaxy_v01n01_1950-10')
    expect(coverUrl('ia:Galaxy_v01n01_1950-10')).toBe('https://archive.org/services/img/Galaxy_v01n01_1950-10')
    expect(coverUrl('ia:x', 'large')).toBe('https://archive.org/download/x/page/cover_medium.jpg')
    expect(coverUrl('covers/a.webp')).toBe('/catalog/covers/a.webp')
  })

  it('lists issues chronologically with story counts', async () => {
    const issues = await listIssues(db, 1)
    expect(issues.map((i) => [i.year, i.month, i.storyCount, i.availability])).toEqual([
      [1926, 4, 3, 'ia'], [1932, 11, 1, 'none'], [1940, 3, 2, 'ia']])
  })

  it('returns contents with credits (authors first) and leaves', async () => {
    const toc = await getContents(db, 1)
    expect(toc.map((s) => s.title)).toEqual(['A New Sort of Magazine', 'Off on a Comet', 'The New Accelerator'])
    expect(toc[1].credits.map((c) => [c.name, c.role])).toEqual([['Jules Verne', 'author'], ['Ellen E. Frewer', 'translator']])
    expect(toc[1]).toMatchObject({ partInfo: 'Part 1 of 2', iaLeaf: 5, pagePrinted: 4 })
    expect((await getIssue(db, 2))?.iaIdentifier).toBeNull()
  })

  it('returns a person with roles, stories and issues', async () => {
    const w = (await getPersonWorks(db, 5))!
    expect(w.person.roles).toEqual(['author', 'editor'])
    expect(w.stories.map((s) => s.title)).toEqual(['A New Sort of Magazine'])
    expect(w.issues.map((i) => [i.id, i.role])).toEqual([[1, 'editor']])
  })
})

describe('search', () => {
  it('matches prefixes across issues, stories and people', async () => {
    const r = await search(db, 'well')
    expect(r.stories.map((s) => s.title).sort()).toEqual(['The New Accelerator', 'The Time Machine Returns'])
    expect(r.people.map((p) => p.name)).toEqual(['H. G. Wells'])
  })

  it('is accent-insensitive and finds real names behind pseudonyms', async () => {
    expect((await search(db, 'fezandie')).stories[0].title).toBe("Doctor Hackensaw's Secrets")
    expect((await search(db, 'otto')).stories[0].title).toBe('The First Martian')
  })

  it('filters by year range', async () => {
    const r = await search(db, 'wells', { yearFrom: 1930, yearTo: 1950 })
    expect(r.stories.map((s) => s.title)).toEqual(['The Time Machine Returns'])
    expect((await search(db, 'april', { yearFrom: 1930 })).issues).toEqual([])
  })

  it('filters by role', async () => {
    // "paul" as cover artist → issues with Paul covers, no stories
    const cover = await search(db, 'paul', { role: 'cover_artist' })
    expect(cover.issues.map((i) => i.id)).toEqual(expect.arrayContaining([1, 3]))
    expect(cover.stories).toEqual([])
    expect(cover.people.map((p) => p.name)).toEqual(['Frank R. Paul'])
    // translator column only
    const tr = await search(db, 'frewer', { role: 'translator' })
    expect(tr.stories.map((s) => s.title)).toEqual(['Off on a Comet'])
    expect((await search(db, 'frewer', { role: 'author' })).stories).toEqual([])
    // editor
    expect((await search(db, 'gernsback', { role: 'editor' })).issues.map((i) => i.id)).toEqual([1])
  })
})

describe('user db', () => {
  it('migrates idempotently and keeps progress, most recent first', async () => {
    const u = await memoryDb()
    expect(await migrateUserDb(u)).toBe(USER_MIGRATIONS.length)
    expect(await migrateUserDb(u)).toBe(USER_MIGRATIONS.length)
    await saveProgress(u, { issueId: 1, page: 5, offsetX: 0, offsetY: 0, zoom: 1 }, 1000)
    await saveProgress(u, { issueId: 3, page: 9, offsetX: 0, offsetY: 0, zoom: 2 }, 2000)
    await saveProgress(u, { issueId: 1, page: 42, offsetX: 10, offsetY: 20, zoom: 1.5 }, 3000)
    expect((await getProgress(u, 1))).toMatchObject({ page: 42, offsetX: 10, zoom: 1.5, updatedAt: 3000 })
    expect((await recentProgress(u)).map((p) => p.issueId)).toEqual([1, 3])
    await addHighlight(u, { issueId: 1, page: 2, rects: [[0, 0, 1, 1]], text: 'kept' })
    await deleteProgress(u, 1)
    expect((await recentProgress(u)).map((p) => p.issueId)).toEqual([3])
    expect(await listHighlights(u, 1)).toHaveLength(1) // clearing progress keeps highlights
    await deleteAllProgress(u)
    expect(await recentProgress(u)).toEqual([])
  })

  it('stores highlights, bookmarks and page maps', async () => {
    const u = await memoryDb()
    await migrateUserDb(u)
    const id = await addHighlight(u, { issueId: 7, page: 12, rects: [[0.1, 0.2, 0.5, 0.25]], text: 'Hello' }, 100)
    await addHighlight(u, { issueId: 7, page: 3, rects: [[0, 0, 1, 1]], text: 'Earlier' }, 200)
    expect((await listHighlights(u, 7)).map((h) => [h.page, h.text])).toEqual([[3, 'Earlier'], [12, 'Hello']])
    await deleteHighlight(u, id)
    expect((await listHighlights(u, 7)).map((h) => h.text)).toEqual(['Earlier'])
    await setBookmark(u, 7, 40, true)
    await setBookmark(u, 7, 40, true) // idempotent
    await setBookmark(u, 7, 2, true)
    await setBookmark(u, 7, 2, false)
    expect((await listBookmarks(u, 7)).map((b) => b.page)).toEqual([40])
    await savePageMap(u, 'ident', [null, 2, 3], -1)
    expect(await getPageMap(u, 'ident')).toEqual([null, 2, 3])
    expect(await getPageMap(u, 'other')).toBeNull()
    await saveProgress(u, { issueId: 7, page: 4, offsetX: 0.5, offsetY: 0.5, zoom: 1, pageCount: 100 })
    await saveProgress(u, { issueId: 7, page: 5, offsetX: 0.5, offsetY: 0.5, zoom: 1 })
    expect((await getProgress(u, 7))?.pageCount).toBe(100) // kept when a later save does not know it
  })
})
