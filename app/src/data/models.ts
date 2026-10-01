export type Availability = 'ia' | 'hathitrust' | 'none'
export type Role = 'author' | 'translator' | 'editor' | 'cover_artist'

export interface Magazine {
  id: number
  name: string
  slug: string
  issueCount: number
  readable: number
  firstYear: number
  lastYear: number
  covers: string[] // a few cover paths for the mosaic
}

export interface IssueSummary {
  id: number
  magazineId: number
  slug: string
  year: number
  month: number
  title: string
  volume: number | null
  number: number | null
  coverArtist: string | null
  editor: string | null
  iaIdentifier: string | null
  availability: Availability
  coverPath: string | null
  storyCount: number
}

export interface Credit {
  personId: number
  name: string
  role: Role
}

export interface Story {
  id: number
  issueId: number
  title: string
  partInfo: string | null
  typeCode: string | null
  typeLabel: string | null
  pagePrinted: number | null
  iaLeaf: number | null
  note: string | null
  credits: Credit[]
}

/** story with the issue it appears in (search results, person works) */
export interface StoryInIssue extends Story {
  issue: Pick<IssueSummary, 'id' | 'title' | 'year' | 'month' | 'iaIdentifier' | 'coverPath'>
}

export interface Person {
  id: number
  name: string
  roles: Role[]
}

export interface PersonWorks {
  person: Person
  stories: (StoryInIssue & { role: Role })[]
  issues: (IssueSummary & { role: Role })[] // as cover artist / editor
}

export interface SearchFilters {
  yearFrom?: number
  yearTo?: number
  role?: Role
}

export interface SearchResults {
  issues: IssueSummary[]
  stories: StoryInIssue[]
  people: Person[]
  ms: number
}

export interface Progress {
  issueId: number
  page: number
  offsetX: number
  offsetY: number
  zoom: number
  updatedAt: number
  pageCount?: number | null
}
