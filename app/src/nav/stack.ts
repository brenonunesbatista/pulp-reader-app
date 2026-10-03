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
  | { name: 'atlas' }
  | { name: 'timeline'; focus?: string; subject?: string; saved?: number }
  | { name: 'entity'; id: string }
  | { name: 'path'; id: string }
  | { name: 'wantTo'; list?: 'read' | 'watch' | 'listen' | 'see' }

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
    case 'atlas': return '#/atlas'
    case 'timeline':
      if (r.saved) return `#/timeline-saved/${r.saved}`
      if (r.subject) return `#/timeline-of/${encodeURIComponent(r.subject)}`
      return `#/timeline${r.focus ? `/${r.focus}` : ''}`
    case 'entity': return `#/entity/${r.id}`
    case 'path': return `#/path/${r.id}`
    case 'wantTo': return `#/want-to${r.list ? `/${r.list}` : ''}`
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
    case 'atlas': return { name }
    case 'timeline': return a ? { name, focus: a } : { name }
    case 'timeline-of': return a ? { name: 'timeline', subject: decodeURIComponent(a) } : { name: 'timeline' }
    case 'timeline-saved': return Number.isFinite(n) && n > 0 ? { name: 'timeline', saved: n } : { name: 'timeline' }
    case 'entity': return a ? { name, id: a } : { name: 'atlas' }
    case 'path': return a ? { name, id: a } : { name: 'atlas' }
    case 'want-to': return a === 'read' || a === 'watch' || a === 'listen' || a === 'see' ? { name: 'wantTo', list: a } : { name: 'wantTo' }
    default: return { name: 'library' }
  }
}
