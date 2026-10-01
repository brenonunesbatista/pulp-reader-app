import { createContext, useContext, useSyncExternalStore } from 'react'
import type { DownloadInfo } from '../data/models'
import type { Blocked, DownloadManager } from './manager'

export const DownloadsContext = createContext<DownloadManager | null>(null)

export function useDownloads(): DownloadManager {
  const m = useContext(DownloadsContext)
  if (!m) throw new Error('useDownloads outside DownloadsProvider')
  return m
}

/** all downloads (any state), most recently changed first */
export function useDownloadList(): DownloadInfo[] {
  const m = useDownloads()
  return useSyncExternalStore(m.subscribe, m.list)
}

/** one issue; re-renders only when that issue changes */
export function useDownload(issueId: number): DownloadInfo | undefined {
  const m = useDownloads()
  return useSyncExternalStore(m.subscribe, () => m.get(issueId))
}

export function useNetworkState(): { online: boolean; blocked: Blocked } {
  const m = useDownloads()
  const online = useSyncExternalStore(m.subscribe, () => m.online)
  const blocked = useSyncExternalStore(m.subscribe, () => m.blocked)
  return { online, blocked }
}
