import { describe, expect, it } from 'vitest'
import { addHighlight, listAllBookmarks, listAllHighlights, savePageMap, setBookmark, updateHighlight } from '../data/annotationRepo'
import { migrateUserDb } from '../db/userSchema'
import { memoryDb } from '../db/wasmDb'
import { computeStarts } from '../reader/layout'
import { gatherNotes } from './gather'
import { cleanText, exportFileName, issueMarkdown, notesMarkdown, type NoteIssue } from './markdown'
import { testCatalog } from '../data/testCatalog'

const issue: NoteIssue = {
  issueId: 1, heading: 'Amazing Stories — Apr 1926',
  entries: [
    { kind: 'bookmark', leaf: 61, page: '62', story: 'The Man from the Atom' },
    { kind: 'highlight', leaf: 61, page: '62', story: 'The Man from the Atom', text: 'The universe\nis vast', note: null, color: 'yellow' },
    { kind: 'highlight', leaf: 61, page: '62', story: 'The Man from the Atom', text: 'Second', note: ' Check this ', color: 'red' },
    { kind: 'highlight', leaf: 0, page: '1', story: null, text: 'Cover line', color: 'yellow' },
  ],
}

describe('markdown export', () => {
  it('turns OCR lines into one paragraph, joining hyphenated words', () => {
    expect(cleanText('I have decided to re-\nlate the truly remarkable story\nof the astonishing dis-\n coveries')).toBe(
      'I have decided to relate the truly remarkable story of the astonishing discoveries')
    expect(cleanText('Mr. A. Hyatt Verrill. Our well-known\nexplorer')).toBe('Mr. A. Hyatt Verrill. Our well-known explorer')
    expect(cleanText('page 62-\n63')).toBe('page 62- 63') // only letters are joined
  })

  it('follows the SPEC format: issue heading, page — story sections, quotes, notes', () => {
    expect(issueMarkdown(issue)).toBe([
      '# Amazing Stories — Apr 1926',
      '',
      '## p. 62 — The Man from the Atom',
      '',
      '*Bookmark*',
      '',
      '> The universe is vast',
      '',
      '> Second',
      '*(red)*',
      '',
      'Note: Check this',
      '',
      '## p. 1',
      '',
      '> Cover line',
      '',
    ].join('\n'))
  })

  it('exports several issues and names the file', () => {
    const other = { ...issue, issueId: 2, heading: 'Amazing Stories — Mar 1940', entries: issue.entries.slice(3) }
    const md = notesMarkdown([issue, other, { ...other, issueId: 3, entries: [] }])
    expect(md.match(/^# /gm)).toHaveLength(2)
    expect(exportFileName([issue])).toBe('banca-notes-amazing-stories-apr-1926.md')
    expect(exportFileName([issue, other], new Date('2026-10-01T12:00:00Z'))).toBe('banca-notes-2026-10-01.md')
  })
})

describe('notes data', () => {
  it('updates colors and notes, lists everything, gathers per issue in reading order with printed pages', async () => {
    const user = await memoryDb()
    await migrateUserDb(user)
    const catalog = await testCatalog()
    const a = await addHighlight(user, { issueId: 1, page: 3, rects: [[0.1, 0.5, 0.4, 0.55]], text: 'lower' }, 10)
    await addHighlight(user, { issueId: 1, page: 3, rects: [[0.1, 0.2, 0.4, 0.25]], text: 'upper' }, 20)
    await setBookmark(user, 1, 3, true, 30)
    await updateHighlight(user, a, { color: 'blue', note: '  remember  ' })
    await updateHighlight(user, a, { note: '' }) // empty note → null
    await updateHighlight(user, a, { note: 'kept' })
    expect((await listAllHighlights(user)).map((h) => [h.text, h.color, h.note])).toEqual([['lower', 'blue', 'kept'], ['upper', 'yellow', null]])
    expect(await listAllBookmarks(user)).toHaveLength(1)

    const [notes] = await gatherNotes(catalog, user)
    expect(notes.issueId).toBe(1)
    expect(notes.entries.map((e) => e.kind === 'bookmark' ? 'bm' : e.text)).toEqual(['bm', 'upper', 'lower'])
    expect(notes.entries[0].page).toBe('4') // no page map yet: leaf + 1
    const ident = notes.issue.iaIdentifier
    if (ident) {
      await savePageMap(user, ident, [null, null, 1, 2, 3], -2)
      const [mapped] = await gatherNotes(catalog, user, 1)
      expect(mapped.entries[0].page).toBe('2')
    }
  })

  it('computes story starts from the page map, falling back to guide leaves', () => {
    const contents = [
      { id: 1, title: 'A', partInfo: null, pagePrinted: 2, iaLeaf: 9, credits: [{ role: 'author', name: 'X' }] },
      { id: 2, title: 'B', partInfo: null, pagePrinted: null, iaLeaf: 1, credits: [] },
      { id: 3, title: 'C', partInfo: null, pagePrinted: 50, iaLeaf: 99, credits: [] },
    ]
    expect(computeStarts(contents, [null, 1, 2, 3], 10).map((s) => [s.title, s.leaf])).toEqual([['B', 1], ['A', 2]])
    expect(computeStarts(contents, null, 0).map((s) => [s.title, s.leaf, s.credit])).toEqual([['B', 1, ''], ['A', 9, 'X'], ['C', 99, '']])
  })
})
