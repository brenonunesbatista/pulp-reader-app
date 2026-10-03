import { describe, expect, it } from 'vitest'
import { hashToRoute, initialStack, routeToHash, stackReducer, type Route } from './stack'

describe('stack', () => {
  it('pushes, pops (never below the root), replaces and resets with unique keys', () => {
    let s = initialStack()
    s = stackReducer(s, { type: 'push', route: { name: 'magazine', id: 1 } })
    s = stackReducer(s, { type: 'push', route: { name: 'issue', id: 7 } })
    expect(s.entries.map((e) => e.route.name)).toEqual(['library', 'magazine', 'issue'])
    s = stackReducer(s, { type: 'replace', route: { name: 'person', id: 3 } })
    expect(s.entries.map((e) => e.route.name)).toEqual(['library', 'magazine', 'person'])
    s = stackReducer(stackReducer(stackReducer(s, { type: 'pop' }), { type: 'pop' }), { type: 'pop' })
    expect(s.entries.map((e) => e.route.name)).toEqual(['library'])
    s = stackReducer(s, { type: 'push', route: { name: 'search', q: 'x' } })
    expect(new Set(s.entries.map((e) => e.key)).size).toBe(s.entries.length)
    s = stackReducer(s, { type: 'reset', route: { name: 'library' } })
    expect(s.entries).toHaveLength(1)
  })

  it('round-trips routes through the URL hash', () => {
    const routes: Route[] = [{ name: 'library' }, { name: 'magazine', id: 1 }, { name: 'issue', id: 42 },
      { name: 'person', id: 9 }, { name: 'search', q: 'h. g. wells' }, { name: 'reader', issueId: 3, leaf: 63 },
      { name: 'reader', issueId: 3, leaf: 7, storyId: 99 }, { name: 'settings' }, { name: 'notes' }, { name: 'soon', what: 'atlas' },
      { name: 'atlas' }, { name: 'timeline' }, { name: 'timeline', focus: 'h-g-wells' },
      { name: 'timeline', subject: 'war of the worlds' }, { name: 'timeline', saved: 4 }, { name: 'entity', id: 'nightfall' },
      { name: 'path', id: 'from-wells-to-foundation' }, { name: 'wantTo' }, { name: 'wantTo', list: 'watch' }]
    for (const r of routes) expect(hashToRoute(routeToHash(r))).toEqual(r)
    expect(hashToRoute('#/nonsense')).toEqual({ name: 'library' })
  })
})
