// Magazine screen filters (pure, tested).
import type { IssueSummary } from '../data/models'

export const decadeOf = (y: number) => Math.floor(y / 10) * 10

export interface IssueFilter {
  decade: number | 'all'
  year: number | null
  readableOnly: boolean
  /** issue ids on the device (downloaded or downloading); null = no download filter */
  downloaded: Set<number> | null
}

export function filterIssues(issues: IssueSummary[], f: IssueFilter): IssueSummary[] {
  return issues.filter((i) =>
    (f.decade === 'all' || decadeOf(i.year) === f.decade) && (f.year === null || i.year === f.year) &&
    (!f.readableOnly || i.availability === 'ia') && (!f.downloaded || f.downloaded.has(i.id)))
}
