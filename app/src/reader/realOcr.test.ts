// Page map on the real OCR of the three Phase 1 test issues (tools/spike/out, git-ignored; skipped when absent).
// Expected values are the ones measured in docs/archive-findings.md §5 and checked visually.
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseDjvuXml } from './engine/djvuXml'
import { computePageMap, leafForPrinted } from './pageMap'

const dir = fileURLToPath(new URL('../../../tools/spike/out/', import.meta.url))
const cases = [
  // [identifier, offset leaf − printed, printed page of a story start, expected leaf]
  ['AmazingStoriesVolume01Number01', 1, 62, 63], // "The Man from the Atom" (guide link n63 is right)
  ['Amazing_Stories_v14n03_1940-03_cape1736', -1, 8, 7], // "Black World" (guide says n9)
  ['Amazing_Stories_v30n03_1956-03', -1, 114, 113], // "Green Warning" (guide says n115)
] as const

describe.each(cases)('real OCR %s', (ident, offset, page, leaf) => {
  const file = `${dir}${ident}_djvu.xml`
  it.skipIf(!existsSync(file))(`offset ${offset}, p. ${page} → leaf ${leaf}`, () => {
    const map = computePageMap(parseDjvuXml(readFileSync(file, 'utf8')))
    expect(map.offset).toBe(offset)
    expect(leafForPrinted(map, page)).toBe(leaf)
  })
})
