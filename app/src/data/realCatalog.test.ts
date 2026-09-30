// Smoke test on the real generated catalog (skipped when public/catalog/catalog.db has not been built).
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { dbFromBytes } from '../db/wasmDb'
import { getContents, listIssues, listMagazines, search } from './catalogRepo'

const path = fileURLToPath(new URL('../../public/catalog/catalog.db', import.meta.url))

describe.skipIf(!existsSync(path))('real catalog.db', () => {
  it('has the expected shape and answers searches', async () => {
    const db = await dbFromBytes(new Uint8Array(readFileSync(path)))
    const [m] = await listMagazines(db)
    expect(m.issueCount).toBe(309)
    const issues = await listIssues(db, m.id)
    expect(issues[0]).toMatchObject({ year: 1926, month: 4, iaIdentifier: 'AmazingStoriesVolume01Number01' })
    const toc = await getContents(db, issues[0].id)
    expect(toc.find((s) => s.title === 'The Man from the Atom')).toMatchObject({ iaLeaf: 63, pagePrinted: 62 })
    const r = await search(db, 'asimov')
    expect(r.people.map((p) => p.name)).toContain('Isaac Asimov')
    expect(r.stories.length).toBeGreaterThan(3)
    expect((await search(db, 'otto')).stories.map((s) => s.title)).toContain('The First Martian')
  })
})
