// Screen stack (pure logic). Screens below the top stay mounted (hidden) so Back is instant and keeps scroll state.
export type Route =
  | { name: 'library' }
  | { name: 'magazine'; id: number }
  | { name: 'issue'; id: number }
  | { name: 'person'; id: number }
  | { name: 'search'; q?: string }
  | { name: 'reader'; issueId: number; leaf?: number; storyId?: number }
  | { name: 'settings' }
  | { name: 'notes' }
  | { name: 'soon'; what: 'rpg' | 'atlas' }

export interface Entry {
  key: number
  route: Route
}

export interface StackState {
  entries: Entry[]
  nextKey: number
}

export type StackAction =
  | { type: 'push'; route: Route }
  | { type: 'pop' }
  | { type: 'replace'; route: Route }
  | { type: 'reset'; route: Route }

export const initialStack = (route: Route = { name: 'library' }): StackState => ({ entries: [{ key: 0, route }], nextKey: 1 })

export function stackReducer(s: StackState, a: StackAction): StackState {
  switch (a.type) {
    case 'push':
      return { entries: [...s.entries, { key: s.nextKey, route: a.route }], nextKey: s.nextKey + 1 }
    case 'pop':
      return s.entries.length > 1 ? { ...s, entries: s.entries.slice(0, -1) } : s
    case 'replace':
      return { entries: [...s.entries.slice(0, -1), { key: s.nextKey, route: a.route }], nextKey: s.nextKey + 1 }
    case 'reset':
      return { entries: [{ key: s.nextKey, route: a.route }], nextKey: s.nextKey + 1 }
  }
}

/** hash shown in the browser address bar during dev (and restorable on reload) */
export function routeToHash(r: Route): string {
  switch (r.name) {
    case 'library': return '#/'
    case 'magazine': return `#/magazine/${r.id}`
    case 'issue': return `#/issue/${r.id}`
    case 'person': return `#/person/${r.id}`
    case 'search': return `#/search/${encodeURIComponent(r.q ?? '')}`
    case 'reader': return `#/reader/${r.issueId}/${r.leaf ?? ''}${r.storyId ? `/${r.storyId}` : ''}`
    case 'settings': return '#/settings'
    case 'notes': return '#/notes'
    case 'soon': return `#/soon/${r.what}`
  }
}

export function hashToRoute(hash: string): Route {
  const [, name, a, b, c] = hash.replace(/^#/, '').split('/')
  const n = Number(a)
  switch (name) {
    case 'magazine': return Number.isFinite(n) ? { name, id: n } : { name: 'library' }
    case 'issue': return Number.isFinite(n) ? { name, id: n } : { name: 'library' }
    case 'person': return Number.isFinite(n) ? { name, id: n } : { name: 'library' }
    case 'search': return { name, q: decodeURIComponent(a ?? '') }
    case 'reader': return Number.isFinite(n)
      ? { name, issueId: n, leaf: b ? Number(b) : undefined, ...(c ? { storyId: Number(c) } : {}) } : { name: 'library' }
    case 'settings': return { name }
    case 'notes': return { name }
    case 'soon': return a === 'rpg' || a === 'atlas' ? { name, what: a } : { name: 'library' }
    default: return { name: 'library' }
  }
}
