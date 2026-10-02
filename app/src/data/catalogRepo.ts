// Catalog queries (read-only DB, schema in tools/catalog/schema.sql). The only module with catalog SQL.
import type { Db } from '../db/types'
import { ftsQuery } from './fts'
import type {
  Availability, Credit, IssueSummary, Magazine, PersonWorks, Role, SearchFilters, SearchResults, Story,
  StoryInIssue,
} from './models'

// ---- row mapping ---------------------------------------------------------------------------------------------------

interface IssueRow {
  id: number; magazine_id: number; slug: string; year: number; month: number; title: string
  volume: number | null; number: number | null
  cover_artist: string | null; editor: string | null; ia_identifier: string | null; availability: Availability
  cover_path: string | null; n: number
}

const ISSUE_COLS = `i.id, i.magazine_id, i.slug, i.year, i.month, i.title, i.volume, i.number, i.cover_artist, i.editor, i.ia_identifier,
  i.availability, i.cover_path, (SELECT count(*) FROM story s WHERE s.issue_id = i.id) AS n`

function toIssue(r: IssueRow): IssueSummary {
  return {
    id: r.id, magazineId: r.magazine_id, slug: r.slug, year: r.year, month: r.month, title: r.title,
    volume: r.volume, number: r.number,
    coverArtist: r.cover_artist, editor: r.editor, iaIdentifier: r.ia_identifier, availability: r.availability,
    coverPath: r.cover_path, storyCount: r.n,
  }
}

interface StoryRow {
  id: number; issue_id: number; title: string; part_info: string | null; type_code: string | null
  type_label: string | null; page_printed: number | null; ia_leaf: number | null; note: string | null
  credits: string | null
  i_title: string; i_year: number; i_month: number; i_ia: string | null; i_cover: string | null
}

// credits packed as "id␟name␟role␞id␟name␟role" (unit/record separators never occur in names)
const STORY_COLS = `s.id, s.issue_id, s.title, s.part_info, s.type_code, s.type_label, s.page_printed, s.ia_leaf, s.note,
  (SELECT group_concat(p.id || char(31) || p.name || char(31) || sp.role, char(30))
     FROM story_person sp JOIN person p ON p.id = sp.person_id WHERE sp.story_id = s.id) AS credits,
  i.title AS i_title, i.year AS i_year, i.month AS i_month, i.ia_identifier AS i_ia, i.cover_path AS i_cover`

function parseCredits(packed: string | null): Credit[] {
  if (!packed) return []
  return packed.split('\x1e').map((c) => {
    const [id, name, role] = c.split('\x1f')
    return { personId: Number(id), name, role: role as Role }
  }).sort((a, b) => (a.role === b.role ? 0 : a.role === 'author' ? -1 : 1))
}

function toStory(r: StoryRow): StoryInIssue {
  const story: Story = {
    id: r.id, issueId: r.issue_id, title: r.title, partInfo: r.part_info, typeCode: r.type_code,
    typeLabel: r.type_label, pagePrinted: r.page_printed, iaLeaf: r.ia_leaf, note: r.note,
    credits: parseCredits(r.credits),
  }
  return {
    ...story,
    issue: { id: r.issue_id, title: r.i_title, year: r.i_year, month: r.i_month, iaIdentifier: r.i_ia, coverPath: r.i_cover },
  }
}

// ---- queries ---------------------------------------------------------------------------------------------------------

export async function listMagazines(db: Db): Promise<Magazine[]> {
  const rows = await db.query<{
    id: number; name: string; slug: string; n: number; readable: number; first: number; last: number
  }>(`SELECT m.id, m.name, m.slug, count(i.id) AS n, sum(i.availability = 'ia') AS readable,
        min(i.year) AS first, max(i.year) AS last
      FROM magazine m LEFT JOIN issue i ON i.magazine_id = m.id GROUP BY m.id ORDER BY m.name`)
  const out: Magazine[] = []
  for (const r of rows) {
    const covers = await db.query<{ cover_path: string }>(
      `SELECT cover_path FROM issue WHERE magazine_id = ? AND cover_path IS NOT NULL ORDER BY year, month, id`, [r.id])
    // evenly spaced across the run, so the mosaic shows the magazine's whole history
    const k = 6
    const pick = covers.length <= k ? covers : Array.from({ length: k }, (_, j) => covers[Math.floor((j * covers.length) / k)])
    out.push({ id: r.id, name: r.name, slug: r.slug, issueCount: r.n, readable: r.readable ?? 0, firstYear: r.first,
      lastYear: r.last, covers: pick.map((c) => c.cover_path) })
  }
  return out
}

export async function getMagazine(db: Db, id: number): Promise<Magazine | null> {
  return (await listMagazines(db)).find((m) => m.id === id) ?? null
}

/** issue-level credits (cover artist, editors) with person ids */
export async function issuePeople(db: Db, issueId: number): Promise<{ id: number; name: string; role: 'editor' | 'cover_artist' }[]> {
  return db.query(`SELECT p.id, p.name, ip.role FROM issue_person ip JOIN person p ON p.id = ip.person_id
                   WHERE ip.issue_id = ? ORDER BY ip.role, p.name`, [issueId])
}

/** editors of a magazine, in order of their first issue */
export async function magazineEditors(db: Db, magazineId: number): Promise<{ id: number; name: string }[]> {
  return db.query<{ id: number; name: string }>(
    `SELECT p.id, p.name FROM issue_person ip JOIN issue i ON i.id = ip.issue_id JOIN person p ON p.id = ip.person_id
     WHERE i.magazine_id = ? AND ip.role = 'editor' GROUP BY p.id ORDER BY min(i.year * 100 + i.month)`, [magazineId])
}

export async function listIssues(db: Db, magazineId: number): Promise<IssueSummary[]> {
  const rows = await db.query<IssueRow>(
    `SELECT ${ISSUE_COLS} FROM issue i WHERE i.magazine_id = ? ORDER BY i.year, i.month, i.id`, [magazineId])
  return rows.map(toIssue)
}

export async function getIssue(db: Db, id: number): Promise<IssueSummary | null> {
  const rows = await db.query<IssueRow>(`SELECT ${ISSUE_COLS} FROM issue i WHERE i.id = ?`, [id])
  return rows.length ? toIssue(rows[0]) : null
}

export async function getIssuesByIds(db: Db, ids: number[]): Promise<IssueSummary[]> {
  if (!ids.length) return []
  const rows = await db.query<IssueRow>(
    `SELECT ${ISSUE_COLS} FROM issue i WHERE i.id IN (${ids.map(() => '?').join(',')})`, ids)
  const byId = new Map(rows.map((r) => [r.id, toIssue(r)]))
  return ids.map((id) => byId.get(id)).filter((x): x is IssueSummary => !!x)
}

export async function getContents(db: Db, issueId: number): Promise<StoryInIssue[]> {
  const rows = await db.query<StoryRow>(
    `SELECT ${STORY_COLS} FROM story s JOIN issue i ON i.id = s.issue_id WHERE s.issue_id = ? ORDER BY s.sort_order`,
    [issueId])
  return rows.map(toStory)
}

async function personRoles(db: Db, id: number): Promise<Role[]> {
  const rows = await db.query<{ role: Role }>(
    `SELECT role FROM story_person WHERE person_id = ? UNION SELECT role FROM issue_person WHERE person_id = ?`, [id, id])
  const order: Role[] = ['author', 'editor', 'cover_artist', 'translator']
  return order.filter((r) => rows.some((x) => x.role === r))
}

export async function getPersonWorks(db: Db, id: number): Promise<PersonWorks | null> {
  const p = await db.query<{ id: number; name: string }>(`SELECT id, name FROM person WHERE id = ?`, [id])
  if (!p.length) return null
  const stories = await db.query<StoryRow & { role: Role }>(
    `SELECT ${STORY_COLS}, sp.role FROM story_person sp JOIN story s ON s.id = sp.story_id JOIN issue i ON i.id = s.issue_id
     WHERE sp.person_id = ? ORDER BY i.year, i.month, s.sort_order`, [id])
  const issues = await db.query<IssueRow & { role: Role }>(
    `SELECT ${ISSUE_COLS}, ip.role FROM issue_person ip JOIN issue i ON i.id = ip.issue_id
     WHERE ip.person_id = ? ORDER BY i.year, i.month`, [id])
  return {
    person: { id: p[0].id, name: p[0].name, roles: await personRoles(db, id) },
    stories: stories.map((r) => ({ ...toStory(r), role: r.role })),
    issues: issues.map((r) => ({ ...toIssue(r), role: r.role })),
  }
}

// ---- search (SPEC §2.1) ------------------------------------------------------------------------------------------

const STORY_COLUMNS_FOR_ROLE: Partial<Record<Role, string[]>> = { author: ['authors'], translator: ['translators'] }
const ISSUE_COLUMNS_FOR_ROLE: Partial<Record<Role, string[]>> = { editor: ['editor'], cover_artist: ['cover_artist'] }

export async function search(db: Db, text: string, f: SearchFilters = {}, limits = { issues: 24, stories: 80, people: 24 }):
Promise<SearchResults> {
  const t0 = performance.now()
  const empty: SearchResults = { issues: [], stories: [], people: [], ms: 0 }
  if (!ftsQuery(text)) return empty
  const from = f.yearFrom ?? 0
  const to = f.yearTo ?? 9999
  const role = f.role

  // with a role filter, stories match only in that role's column; issue-level roles (editor, cover artist) have no
  // story column, so stories are skipped; issues match only in the editor / cover artist columns
  const storyCols = role ? STORY_COLUMNS_FOR_ROLE[role] : undefined
  const issueCols = role ? ISSUE_COLUMNS_FOR_ROLE[role] : undefined
  const wantStories = !role || !!storyCols
  const wantIssues = !role || !!issueCols

  const [issues, stories, people] = await Promise.all([
    wantIssues
      ? db.query<IssueRow>(
        `SELECT ${ISSUE_COLS} FROM issue_fts f JOIN issue i ON i.id = f.rowid
         WHERE issue_fts MATCH ? AND i.year BETWEEN ? AND ? ORDER BY rank LIMIT ?`,
        [ftsQuery(text, issueCols)!, from, to, limits.issues])
      : Promise.resolve([]),
    wantStories
      ? db.query<StoryRow>(
        `SELECT ${STORY_COLS} FROM story_fts f JOIN story s ON s.id = f.rowid JOIN issue i ON i.id = s.issue_id
         WHERE story_fts MATCH ? AND i.year BETWEEN ? AND ? ORDER BY rank LIMIT ?`,
        [ftsQuery(text, storyCols)!, from, to, limits.stories])
      : Promise.resolve([]),
    db.query<{ id: number; name: string; roles: string }>(
      `SELECT p.id, p.name, f.roles FROM person_fts f JOIN person p ON p.id = f.rowid
       WHERE person_fts MATCH ?
         AND (? = '' OR (' ' || f.roles || ' ') LIKE '% ' || ? || ' %')
         AND EXISTS (SELECT 1 FROM story_person sp JOIN story s ON s.id = sp.story_id JOIN issue i ON i.id = s.issue_id
                       WHERE sp.person_id = p.id AND i.year BETWEEN ? AND ?
                     UNION ALL
                     SELECT 1 FROM issue_person ip JOIN issue i ON i.id = ip.issue_id
                       WHERE ip.person_id = p.id AND i.year BETWEEN ? AND ?)
       ORDER BY rank LIMIT ?`,
      [ftsQuery(text, ['name'])!, role ? roleLabel(role) : '', role ? roleLabel(role) : '', from, to, from, to, limits.people]),
  ])
  return {
    issues: issues.map(toIssue),
    stories: stories.map(toStory),
    people: people.map((p) => ({ id: p.id, name: p.name, roles: parseRoles(p.roles) })),
    ms: performance.now() - t0,
  }
}

/** person_fts.roles holds words written by the catalog builder: author, translator, editor, "cover artist" */
function roleLabel(r: Role): string {
  return r === 'cover_artist' ? 'cover artist' : r
}

function parseRoles(s: string): Role[] {
  const out: Role[] = []
  if (/\bauthor\b/.test(s)) out.push('author')
  if (/\beditor\b/.test(s)) out.push('editor')
  if (/cover artist/.test(s)) out.push('cover_artist')
  if (/\btranslator\b/.test(s)) out.push('translator')
  return out
}

export async function yearRange(db: Db): Promise<{ min: number; max: number }> {
  const r = await db.query<{ min: number; max: number }>(`SELECT min(year) AS min, max(year) AS max FROM issue`)
  return r[0]
}

/** Atlas → catalog: the issue of a magazine in a given month, and a story in it by exact title */
export async function findIssueByMonth(db: Db, magazineSlug: string, year: number, month: number): Promise<IssueSummary | null> {
  const rows = await db.query<IssueRow>(`SELECT ${ISSUE_COLS} FROM issue i JOIN magazine m ON m.id = i.magazine_id
    WHERE m.slug = ? AND i.year = ? AND i.month = ? LIMIT 1`, [magazineSlug, year, month])
  return rows.length ? toIssue(rows[0]) : null
}

export async function findStory(db: Db, issueId: number, title: string): Promise<{ id: number; iaLeaf: number | null } | null> {
  const rows = await db.query<{ id: number; ia_leaf: number | null }>(
    `SELECT id, ia_leaf FROM story WHERE issue_id = ? AND title = ? ORDER BY sort_order LIMIT 1`, [issueId, title])
  return rows.length ? { id: rows[0].id, iaLeaf: rows[0].ia_leaf } : null
}

/** magazine slug + month of issues (Atlas: which entities were read in Banca) */
export async function issueKeys(db: Db, ids: number[]): Promise<{ id: number; magazine: string; year: number; month: number }[]> {
  if (!ids.length) return []
  return db.query(`SELECT i.id, m.slug AS magazine, i.year, i.month FROM issue i JOIN magazine m ON m.id = i.magazine_id
    WHERE i.id IN (${ids.map(() => '?').join(',')})`, ids)
}
