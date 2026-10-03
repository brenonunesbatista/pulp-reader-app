import type { DownloadInfo, IssueSummary, Story } from '../data/models'

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ROLE_LABEL = { author: 'Author', editor: 'Editor', cover_artist: 'Cover artist', translator: 'Translator' } as const

export const monthYear = (year: number, month: number) => `${MON[month - 1]} ${year}`
export const roleLabel = (r: keyof typeof ROLE_LABEL) => ROLE_LABEL[r]
/** catalog cover paths are relative to the catalog dir (public/catalog); "ia:<identifier>" = the scan's cover on the
 *  Internet Archive (small: ~180 px thumbnail for grids, large: ~100 KB for the issue page) */
export function coverUrl(path: string | null, size: 'small' | 'large' = 'small'): string | null {
  if (!path) return null
  if (path.startsWith('ia:')) {
    const id = encodeURIComponent(path.slice(3))
    return size === 'large' ? `https://archive.org/download/${id}/page/cover_medium.jpg` : `https://archive.org/services/img/${id}`
  }
  return `/catalog/${path}`
}

/** "Galaxy, October 1950" → "Galaxy" (issue titles are "<magazine>, <date>") */
export const magazineOf = (title: string) => title.replace(/,\s*[^,]*\d{4}(\s*\(.*\))?$/, '')

export const coverTag = (i: Pick<IssueSummary, 'year' | 'month'>) => monthYear(i.year, i.month).toUpperCase()

/** Design tag for a story type: serial / novelette / novel / short story / editorial / other. */
export function typeTagClass(s: Pick<Story, 'typeCode' | 'partInfo'>): string {
  switch (s.typeCode) {
    case 'n.': return s.partInfo ? 'serial' : 'novel'
    case 'na': return 'novel'
    case 'nv': return 'novelette'
    case 'ss': case 'vi': return 'short'
    case 'ed': return 'editorial'
    default: return 'other'
  }
}

export function initials(name: string): string {
  const parts = name.replace(/\(.*?\)|,.*$/g, '').trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function formatBytes(n: number): string {
  if (n < 1e6) return `${Math.max(0, Math.round(n / 1e3))} KB`
  if (n < 1e9) return `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`
  return `${(n / 1e9).toFixed(2)} GB`
}

export const downloadPct = (d: Pick<DownloadInfo, 'pagesDone' | 'pagesTotal'>) =>
  d.pagesTotal ? Math.floor((d.pagesDone / d.pagesTotal) * 100) : 0

/** swatch colors for highlight color names (annotationRepo.HIGHLIGHT_COLORS) */
export const HIGHLIGHT_HEX: Record<string, string> = { yellow: '#F2B705', red: '#E4572E', blue: '#4A7BD0', green: '#4FA35A' }
