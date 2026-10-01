import { useState } from 'react'
import { getIssuesByIds } from '../data/catalogRepo'
import { useDb } from '../db/useDb'
import { useDownloadList, useDownloads } from '../downloads/context'
import { useNav } from '../nav/context'
import { cacheSize, clearCache } from '../reader/engine/diskCache'
import { Cover } from '../ui/components'
import { downloadPct, formatBytes, monthYear } from '../ui/format'
import { Icon } from '../ui/icons'
import { useSettings } from '../ui/settingsContext'
import { useAsync } from '../ui/useAsync'

/** Settings → Storage: Wi-Fi only, space used, downloaded issues (remove one / all), clear cache. */
export function StorageSettings() {
  const { settings, update } = useSettings()
  const { catalog } = useDb()
  const nav = useNav()
  const m = useDownloads()
  const downloads = useDownloadList()
  const dlKey = downloads.map((d) => d.issueId).join(',')
  const issues = useAsync(() => getIssuesByIds(catalog, dlKey ? dlKey.split(',').map(Number) : []), [catalog, dlKey])
  const [cacheTick, setCacheTick] = useState(0)
  const cache = useAsync(() => cacheSize(), [cacheTick])
  const [confirmAll, setConfirmAll] = useState(false)
  const [busy, setBusy] = useState(false)
  const total = downloads.reduce((n, d) => n + d.bytes, 0)

  const removeAll = async () => {
    if (!confirmAll) return setConfirmAll(true)
    setConfirmAll(false)
    setBusy(true)
    try { await m.removeAll() } finally { setBusy(false) }
  }

  return (
    <section className="settings-group">
      <h3>Storage</h3>
      <label className="switch">
        <input type="checkbox" checked={settings.wifiOnly} onChange={(e) => update('wifiOnly', e.target.checked)} />
        <span className="track" />Download only on Wi-Fi
      </label>
      <dl className="kv num">
        <dt>Downloads</dt><dd>{downloads.length} {downloads.length === 1 ? 'issue' : 'issues'} · {formatBytes(total)}</dd>
        <dt>Cache</dt><dd>{cache.status === 'ok' ? formatBytes(cache.data) : '…'} (OCR and page lists of issues read online)</dd>
      </dl>

      {issues.status === 'ok' && issues.data.length > 0 && (
        <div>
          {issues.data.map((issue) => {
            const d = downloads.find((x) => x.issueId === issue.id)
            if (!d) return null
            return (
              <div key={issue.id} className="dl-row">
                <button style={{ all: 'unset', cursor: 'pointer' }} onClick={() => nav.push({ name: 'issue', id: issue.id })}>
                  <Cover path={issue.coverPath} alt={issue.title} small />
                </button>
                <div>
                  <div className="t num">{issue.title.replace(/,\s*\w+ \d{4}$/, '')} · {monthYear(issue.year, issue.month)}</div>
                  <div className="muted small num">
                    {d.state === 'done' ? formatBytes(d.bytes)
                      : d.state === 'error' ? `Failed: ${d.error}`
                      : `${d.state === 'paused' ? 'Paused' : 'Downloading'} · ${downloadPct(d)}% · ${formatBytes(d.bytes)}`}
                  </div>
                  {d.state !== 'done' && <div className="dl-progress"><i style={{ width: `${downloadPct(d)}%` }} /></div>}
                </div>
                <button className="icon-btn" aria-label={`Remove ${issue.title}`} onClick={() => void m.remove(issue.id)}>
                  <Icon name="trash" size={20} />
                </button>
              </div>
            )
          })}
        </div>
      )}

      <div className="btn-row">
        <button className={`btn danger ${confirmAll ? 'confirm' : ''}`} disabled={!downloads.length || busy}
                onClick={() => void removeAll()} onBlur={() => setConfirmAll(false)}>
          <Icon name="trash" size={20} />{busy ? 'Deleting…' : confirmAll ? `Delete ${downloads.length === 1 ? '1 issue' : `${downloads.length} issues`}?` : 'Delete all downloads'}
        </button>
        <button className="btn" onClick={() => void clearCache().then(() => setCacheTick((t) => t + 1))}>Clear cache</button>
      </div>
      <p className="muted small">Removing downloads keeps your reading progress, highlights and bookmarks.</p>
    </section>
  )
}
