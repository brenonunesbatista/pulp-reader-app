// Atlas queries (read-only atlas.db, schema in tools/atlas/schema.sql) and the user's Atlas data in user.db
// (want-to lists, visits). The only module with Atlas SQL.
import type { Db } from '../db/types'
import { ftsQuery } from './fts'

export type EntityType = 'person' | 'work' | 'film' | 'series' | 'radio' | 'music' | 'artwork' | 'magazine' | 'issue'
  | 'event' | 'movement' | 'theme'
export type Lane = 'magazines' | 'books' | 'film-tv' | 'music' | 'visual-art' | 'comics' | 'events'
export type LinkRel = 'influenced' | 'adapted_as' | 'published_in' | 'collected_in' | 'cover_of' | 'created_by'
  | 'read_next' | 'context'
export type WantList = 'read' | 'watch' | 'listen' | 'see'

export interface AtlasImage { url: string | null; credit: string | null; license: string | null; source: string | null
  catalogCover: string | null }

/** what lists, the timeline and cards need */
export interface EntitySummary {
  id: string
  type: EntityType
  title: string
  subtitle: string
  lane: Lane | null
  date: string | null
  year: number | null
  endYear: number | null
  image: AtlasImage
}

export interface AtlasLink { rel: LinkRel; inverse: boolean; note: string | null; other: EntitySummary }
export interface AtlasSource { n: number; title: string; url: string }
export interface CatalogRef { magazine: string; year: number; month: number; story: string | null }

export interface AtlasEntity extends EntitySummary {
  end: string | null
  body: string
  why: string | null
  imdb: string | null
  spotifyAlbum: string | null
  themes: EntitySummary[]
  links: AtlasLink[]
  sources: AtlasSource[]
  catalog: CatalogRef[]
}

export interface PathStop { pos: number; why: string; entity: EntitySummary }
export interface AtlasPath { id: string; title: string; subtitle: string; body: string; stops: PathStop[] }

/** the whole link graph (small: hundreds of rows) for recommendations and the timeline */
export interface AtlasGraph {
  entities: Map<string, EntitySummary>
  links: { src: string; rel: LinkRel; dst: string; inverse: boolean; note: string | null }[]
  themes: Map<string, string[]> // entity → theme ids
}

interface EntityRow {
  id: string; type: EntityType; title: string; subtitle: string; lane: Lane | null; date: string | null
  end_date: string | null; year: number | null; end_year: number | null; body: string; why: string | null
  image_url: string | null; image_credit: string | null; image_license: string | null; image_source: string | null
  catalog_cover: string | null; imdb: string | null; spotify_album: string | null
}

const SUMMARY_COLS = `id, type, title, subtitle, lane, date, year, end_year, image_url, image_credit, image_license,
  image_source, catalog_cover`

const toSummary = (r: Pick<EntityRow, 'id' | 'type' | 'title' | 'subtitle' | 'lane' | 'date' | 'year' | 'end_year'
  | 'image_url' | 'image_credit' | 'image_license' | 'image_source' | 'catalog_cover'>): EntitySummary => ({
  id: r.id, type: r.type, title: r.title, subtitle: r.subtitle, lane: r.lane, date: r.date, year: r.year, endYear: r.end_year,
  image: { url: r.image_url, credit: r.image_credit, license: r.image_license, source: r.image_source, catalogCover: r.catalog_cover },
})

export async function listEntities(atlas: Db): Promise<EntitySummary[]> {
  const rows = await atlas.query<EntityRow>(`SELECT ${SUMMARY_COLS} FROM entity ORDER BY year, title`)
  return rows.map(toSummary)
}

export async function getEntitySummaries(atlas: Db, ids: string[]): Promise<EntitySummary[]> {
  if (!ids.length) return []
  const rows = await atlas.query<EntityRow>(`SELECT ${SUMMARY_COLS} FROM entity WHERE id IN (${ids.map(() => '?').join(',')})`, ids)
  const by = new Map(rows.map((r) => [r.id, toSummary(r)]))
  return ids.map((i) => by.get(i)).filter((x): x is EntitySummary => !!x)
}

export async function getEntity(atlas: Db, id: string): Promise<AtlasEntity | null> {
  const [r] = await atlas.query<EntityRow>(`SELECT * FROM entity WHERE id = ?`, [id])
  if (!r) return null
  const [themes, links, sources, catalog] = await Promise.all([
    atlas.query<EntityRow>(`SELECT ${SUMMARY_COLS} FROM entity WHERE id IN (SELECT theme_id FROM entity_theme WHERE entity_id = ?)
      ORDER BY title`, [id]),
    atlas.query<EntityRow & { rel: LinkRel; inverse: number; note: string | null }>(
      `SELECT l.rel, l.inverse, l.note, ${SUMMARY_COLS.split(',').map((c) => `e.${c.trim()}`).join(', ')}
       FROM link l JOIN entity e ON e.id = l.dst WHERE l.src = ? ORDER BY e.year, e.title`, [id]),
    atlas.query<AtlasSource>(`SELECT n, title, url FROM source WHERE entity_id = ? ORDER BY n`, [id]),
    atlas.query<CatalogRef>(`SELECT magazine, year, month, story FROM catalog_ref WHERE entity_id = ? ORDER BY sort`, [id]),
  ])
  return {
    ...toSummary(r), end: r.end_date, body: r.body, why: r.why, imdb: r.imdb, spotifyAlbum: r.spotify_album,
    themes: themes.map(toSummary),
    links: links.map((l) => ({ rel: l.rel, inverse: !!l.inverse, note: l.note, other: toSummary(l) })),
    sources, catalog,
  }
}

/** entities with a theme (theme pages) */
export async function entitiesWithTheme(atlas: Db, themeId: string): Promise<EntitySummary[]> {
  const rows = await atlas.query<EntityRow>(`SELECT ${SUMMARY_COLS} FROM entity WHERE id IN
    (SELECT entity_id FROM entity_theme WHERE theme_id = ?) ORDER BY year, title`, [themeId])
  return rows.map(toSummary)
}

export async function loadGraph(atlas: Db): Promise<AtlasGraph> {
  const [entities, links, themes] = await Promise.all([
    listEntities(atlas),
    atlas.query<{ src: string; rel: LinkRel; dst: string; inverse: number; note: string | null }>(`SELECT * FROM link`),
    atlas.query<{ entity_id: string; theme_id: string }>(`SELECT * FROM entity_theme`),
  ])
  const t = new Map<string, string[]>()
  for (const r of themes) t.set(r.entity_id, [...(t.get(r.entity_id) ?? []), r.theme_id])
  return {
    entities: new Map(entities.map((e) => [e.id, e])),
    links: links.map((l) => ({ ...l, inverse: !!l.inverse })),
    themes: t,
  }
}

export async function listPaths(atlas: Db): Promise<AtlasPath[]> {
  const paths = await atlas.query<{ id: string; title: string; subtitle: string; body: string }>(`SELECT * FROM path ORDER BY title`)
  return Promise.all(paths.map(async (p) => (await getPath(atlas, p.id))!))
}

export async function getPath(atlas: Db, id: string): Promise<AtlasPath | null> {
  const [p] = await atlas.query<{ id: string; title: string; subtitle: string; body: string }>(`SELECT * FROM path WHERE id = ?`, [id])
  if (!p) return null
  const stops = await atlas.query<EntityRow & { pos: number; why: string }>(
    `SELECT s.pos, s.why, ${SUMMARY_COLS.split(',').map((c) => `e.${c.trim()}`).join(', ')}
     FROM path_stop s JOIN entity e ON e.id = s.entity_id WHERE s.path_id = ? ORDER BY s.pos`, [id])
  return { ...p, stops: stops.map((s) => ({ pos: s.pos, why: s.why, entity: toSummary(s) })) }
}

export async function searchAtlas(atlas: Db, q: string, limit = 30): Promise<EntitySummary[]> {
  const fts = ftsQuery(q)
  if (!fts) return []
  const rows = await atlas.query<EntityRow>(
    `SELECT ${SUMMARY_COLS.split(',').map((c) => `e.${c.trim()}`).join(', ')}
     FROM entity_fts f JOIN entity e ON e.id = f.id WHERE entity_fts MATCH ? ORDER BY bm25(entity_fts, 0, 10, 4, 1) LIMIT ?`,
    [fts, limit])
  return rows.map(toSummary)
}

/** entities whose Banca reference is in one of these issues */
export async function entitiesForIssues(atlas: Db, keys: { magazine: string; year: number; month: number }[]): Promise<string[]> {
  if (!keys.length) return []
  const rows = await atlas.query<{ entity_id: string }>(`SELECT DISTINCT entity_id FROM catalog_ref WHERE ${
    keys.map(() => '(magazine = ? AND year = ? AND month = ?)').join(' OR ')}`, keys.flatMap((k) => [k.magazine, k.year, k.month]))
  return rows.map((r) => r.entity_id)
}

// ---- user data (user.db) ----------------------------------------------------------------------------------------------

/** which list an entity can go on (people, themes, events and movements have none) */
export function listFor(type: EntityType): WantList | null {
  switch (type) {
    case 'work': case 'magazine': case 'issue': return 'read'
    case 'film': case 'series': return 'watch'
    case 'radio': case 'music': return 'listen'
    case 'artwork': return 'see'
    default: return null
  }
}

export interface WantItem { entityId: string; list: WantList; addedAt: number; doneAt: number | null; fromLabel: string | null }

export async function listWants(user: Db): Promise<WantItem[]> {
  const rows = await user.query<{ entity_id: string; list: WantList; added_at: number; done_at: number | null; from_label: string | null }>(
    `SELECT * FROM want_to ORDER BY done_at IS NOT NULL, coalesce(done_at, added_at) DESC`)
  return rows.map((r) => ({ entityId: r.entity_id, list: r.list, addedAt: r.added_at, doneAt: r.done_at, fromLabel: r.from_label }))
}

export async function addWant(user: Db, entityId: string, list: WantList, fromLabel: string | null, now = Date.now()) {
  await user.run(`INSERT INTO want_to (entity_id, list, added_at, done_at, from_label) VALUES (?, ?, ?, NULL, ?)
    ON CONFLICT(entity_id) DO UPDATE SET list = excluded.list`, [entityId, list, now, fromLabel])
}

export async function setWantDone(user: Db, entityId: string, done: boolean, now = Date.now()) {
  await user.run(`UPDATE want_to SET done_at = ? WHERE entity_id = ?`, [done ? now : null, entityId])
}

export async function removeWant(user: Db, entityId: string) {
  await user.run(`DELETE FROM want_to WHERE entity_id = ?`, [entityId])
}

export async function recordVisit(user: Db, entityId: string, now = Date.now()) {
  await user.run(`INSERT INTO atlas_visit (entity_id, first_at, last_at, count) VALUES (?, ?, ?, 1)
    ON CONFLICT(entity_id) DO UPDATE SET last_at = excluded.last_at, count = count + 1`, [entityId, now, now])
}

/** most recent first */
export async function recentVisits(user: Db, limit = 50): Promise<{ entityId: string; lastAt: number; count: number }[]> {
  const rows = await user.query<{ entity_id: string; last_at: number; count: number }>(
    `SELECT entity_id, last_at, count FROM atlas_visit ORDER BY last_at DESC LIMIT ?`, [limit])
  return rows.map((r) => ({ entityId: r.entity_id, lastAt: r.last_at, count: r.count }))
}

// ---- saved timelines -------------------------------------------------------------------------------------------------

/** what a saved timeline restores; `subject` = the Atlas search it was built from (recomputed on open) */
export interface TimelineSpec {
  zoom: 'decades' | 'years'
  hidden: Lane[]
  fromYear: number
  selected: string | null
  subject: string | null
}
export interface SavedTimeline { id: number; name: string; spec: TimelineSpec; updatedAt: number }

export async function listSavedTimelines(user: Db): Promise<SavedTimeline[]> {
  const rows = await user.query<{ id: number; name: string; spec_json: string; updated_at: number }>(
    `SELECT id, name, spec_json, updated_at FROM saved_timeline ORDER BY updated_at DESC`)
  return rows.map((r) => ({ id: r.id, name: r.name, spec: JSON.parse(r.spec_json) as TimelineSpec, updatedAt: r.updated_at }))
}

export async function getSavedTimeline(user: Db, id: number): Promise<SavedTimeline | null> {
  return (await listSavedTimelines(user)).find((t) => t.id === id) ?? null
}

export async function saveTimeline(user: Db, name: string, spec: TimelineSpec, now = Date.now()): Promise<number> {
  await user.run(`INSERT INTO saved_timeline (name, spec_json, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [name.trim() || 'Untitled timeline', JSON.stringify(spec), now, now])
  return (await user.query<{ id: number }>(`SELECT max(id) AS id FROM saved_timeline`))[0].id
}

export async function renameTimeline(user: Db, id: number, name: string, now = Date.now()) {
  if (name.trim()) await user.run(`UPDATE saved_timeline SET name = ?, updated_at = ? WHERE id = ?`, [name.trim(), now, id])
}

export async function deleteTimeline(user: Db, id: number) {
  await user.run(`DELETE FROM saved_timeline WHERE id = ?`, [id])
}

// ---- curator inbox -----------------------------------------------------------------------------------------------------

export interface InboxItem { id: number; kind: 'suggestion' | 'search'; text: string; context: string | null; count: number
  createdAt: number; updatedAt: number }

export async function addSuggestion(user: Db, text: string, context: string | null, now = Date.now()) {
  if (!text.trim()) return
  await user.run(`INSERT INTO atlas_inbox (kind, text, context, count, created_at, updated_at) VALUES ('suggestion', ?, ?, 1, ?, ?)`,
    [text.trim(), context, now, now])
}

/** an Atlas search that found nothing (same text = one row, counted) */
export async function recordMissedSearch(user: Db, text: string, now = Date.now()) {
  const t = text.trim().toLowerCase()
  if (t.length < 3) return
  await user.run(`INSERT INTO atlas_inbox (kind, text, context, count, created_at, updated_at) VALUES ('search', ?, NULL, 1, ?, ?)
    ON CONFLICT(text) WHERE kind = 'search' DO UPDATE SET count = count + 1, updated_at = excluded.updated_at`, [t, now, now])
}

export async function listInbox(user: Db): Promise<InboxItem[]> {
  const rows = await user.query<{ id: number; kind: 'suggestion' | 'search'; text: string; context: string | null; count: number
    created_at: number; updated_at: number }>(`SELECT * FROM atlas_inbox ORDER BY kind DESC, updated_at DESC`)
  return rows.map((r) => ({ id: r.id, kind: r.kind, text: r.text, context: r.context, count: r.count, createdAt: r.created_at,
    updatedAt: r.updated_at }))
}

export async function deleteInboxItem(user: Db, id: number) {
  await user.run(`DELETE FROM atlas_inbox WHERE id = ?`, [id])
}

export async function clearInbox(user: Db) {
  await user.run(`DELETE FROM atlas_inbox`)
}
