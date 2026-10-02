// Atlas hooks: the link graph (loaded once), the user's signals (visits, lists, what was read in Banca), the main path.
import { entitiesForIssues, listWants, loadGraph, listPaths, recentVisits, type AtlasGraph, type AtlasPath } from '../data/atlasRepo'
import { issueKeys } from '../data/catalogRepo'
import { recentProgress } from '../data/progressRepo'
import type { Db } from '../db/types'
import { useDb } from '../db/useDb'
import { useIsActive } from '../nav/context'
import { useAsync, type Async } from '../ui/useAsync'
import type { Signals } from './recommend'

let graphCache: { db: Db; graph: Promise<AtlasGraph>; paths: Promise<AtlasPath[]> } | null = null

function cached(atlas: Db) {
  if (graphCache?.db !== atlas) graphCache = { db: atlas, graph: loadGraph(atlas), paths: listPaths(atlas) }
  return graphCache
}

export interface AtlasData { graph: AtlasGraph; paths: AtlasPath[]; signals: Signals; wants: Awaited<ReturnType<typeof listWants>> }

/** Graph + paths (static) and user signals (reloaded whenever the screen becomes visible again or `tick` changes). */
export function useAtlas(tick = 0): Async<AtlasData> {
  const { atlas, catalog, user } = useDb()
  const active = useIsActive()
  return useAsync(async () => {
    const c = cached(atlas)
    const [graph, paths, visits, wants, progress] = await Promise.all([
      c.graph, c.paths, recentVisits(user, 200), listWants(user), recentProgress(user, 500)])
    const keys = await issueKeys(catalog, progress.map((p) => p.issueId))
    const read = new Set(await entitiesForIssues(atlas, keys))
    const signals: Signals = {
      visited: new Map(visits.map((v) => [v.entityId, v.lastAt])),
      wanted: new Set(wants.filter((w) => !w.doneAt).map((w) => w.entityId)),
      done: new Set(wants.filter((w) => w.doneAt).map((w) => w.entityId)),
      read,
    }
    return { graph, paths, signals, wants }
  }, [atlas, catalog, user, active, tick])
}
