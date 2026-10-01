import { useState } from 'react'
import { useDownload, useDownloads, useNetworkState } from '../downloads/context'
import { downloadPct, formatBytes } from './format'
import { Icon } from './icons'

/** Issue screen: Download / Pause / Resume / Remove, with progress and size. */
export function DownloadButtons({ issueId, ident }: { issueId: number; ident: string }) {
  const m = useDownloads()
  const d = useDownload(issueId)
  const { blocked } = useNetworkState()
  const [confirm, setConfirm] = useState(false)
  const remove = () => {
    if (!confirm) return setConfirm(true)
    setConfirm(false)
    void m.remove(issueId)
  }
  const removeBtn = (
    <button className={`btn danger ${confirm ? 'confirm' : ''}`} onClick={remove} onBlur={() => setConfirm(false)}>
      <Icon name="trash" size={20} />{confirm ? 'Tap to confirm' : 'Remove'}
    </button>
  )

  if (!d) {
    return <button className="btn" onClick={() => m.start(issueId, ident)}><Icon name="download" size={20} />Download</button>
  }
  switch (d.state) {
    case 'done':
      return <>{removeBtn}<span className="dl-status num"><Icon name="check" size={16} stroke={3} /> On this device · {formatBytes(d.bytes)}</span></>
    case 'downloading': {
      const status = blocked === 'wifi' ? 'Waiting for Wi-Fi' : blocked === 'offline' ? 'Waiting for a connection'
        : !m.isActive(issueId) ? 'Queued'
        : d.pagesTotal && d.pagesDone >= d.pagesTotal ? `Fetching the text layer (OCR) · ${formatBytes(d.bytes)}`
        : `${d.pagesDone} / ${d.pagesTotal || '…'} pages · ${formatBytes(d.bytes)}`
      return (
        <>
          <button className="btn num" onClick={() => m.pause(issueId)}><Icon name="pause" size={20} />Pause · {downloadPct(d)}%</button>
          <span className="dl-status num">{status}</span>
        </>
      )
    }
    case 'paused':
      return (
        <>
          <button className="btn num" onClick={() => m.start(issueId, ident)}><Icon name="download" size={20} />Resume · {downloadPct(d)}%</button>
          {removeBtn}
        </>
      )
    case 'error':
      return (
        <>
          <button className="btn" onClick={() => m.start(issueId, ident)}><Icon name="download" size={20} />Retry download</button>
          {removeBtn}
          <span className="dl-status" style={{ color: 'var(--pulp-red)' }}>Download failed: {d.error}</span>
        </>
      )
  }
}
