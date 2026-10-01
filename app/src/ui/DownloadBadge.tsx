import { useDownload } from '../downloads/context'
import { downloadPct } from './format'
import { Icon } from './icons'

/** Corner badge on a cover: downloaded ✓, downloading n %, paused, failed. Nothing for online-only issues. */
export function DownloadBadge({ issueId }: { issueId: number }) {
  const d = useDownload(issueId)
  if (!d) return null
  switch (d.state) {
    case 'done':
      return <span className="dl-badge done" title="Downloaded"><Icon name="check" size={16} stroke={3} /></span>
    case 'downloading':
      return <span className="dl-badge busy num">{downloadPct(d)}%</span>
    case 'paused':
      return <span className="dl-badge paused num"><Icon name="pause" size={12} stroke={3} />{downloadPct(d)}%</span>
    case 'error':
      return <span className="dl-badge error" title={d.error ?? 'Download failed'}><Icon name="alert" size={16} stroke={3} /></span>
  }
}
