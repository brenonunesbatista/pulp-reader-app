import { describe, expect, it } from 'vitest'
import type { IssueSummary } from '../data/models'
import { filterIssues } from './issueFilter'

const issue = (id: number, year: number, availability: IssueSummary['availability'] = 'ia'): IssueSummary => ({
  id, magazineId: 1, slug: `i${id}`, year, month: 1, title: `I ${id}`, volume: null, number: null, coverArtist: null,
  editor: null, iaIdentifier: availability === 'ia' ? `ia${id}` : null, availability, coverPath: null, storyCount: 0,
})
const all = [issue(1, 1926), issue(2, 1929, 'none'), issue(3, 1934), issue(4, 1939)]
const ids = (l: IssueSummary[]) => l.map((i) => i.id)
const base = { decade: 'all' as const, year: null, readableOnly: false, downloaded: null }

describe('magazine filters', () => {
  it('filters by decade, year, readability and downloads together', () => {
    expect(ids(filterIssues(all, base))).toEqual([1, 2, 3, 4])
    expect(ids(filterIssues(all, { ...base, decade: 1920 }))).toEqual([1, 2])
    expect(ids(filterIssues(all, { ...base, decade: 1930, year: 1939 }))).toEqual([4])
    expect(ids(filterIssues(all, { ...base, readableOnly: true }))).toEqual([1, 3, 4])
    expect(ids(filterIssues(all, { ...base, downloaded: new Set([3, 4]) }))).toEqual([3, 4])
    expect(ids(filterIssues(all, { ...base, decade: 1930, downloaded: new Set([1, 3]) }))).toEqual([3])
    expect(ids(filterIssues(all, { ...base, downloaded: new Set() }))).toEqual([])
  })
})
