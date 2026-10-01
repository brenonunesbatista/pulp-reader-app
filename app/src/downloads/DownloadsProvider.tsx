import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'
import { useEffect, useState, type ReactNode } from 'react'
import { deleteAllDownloads, deleteDownload, listDownloads, saveDownload } from '../data/downloadRepo'
import { useDb } from '../db/useDb'
import { INDEX_THUMB_WIDTH, SHARP_WIDTH } from '../reader/engine/config'
import { fetchManifest, fetchOcr, iiifUrl } from '../reader/engine/ia'
import { useSettings } from '../ui/settingsContext'
import { DownloadsContext } from './context'
import { DownloadManager } from './manager'
import { getStore } from './store'

/** One manager for the app's lifetime; follows the network status and the Wi-Fi only setting. */
export function DownloadsProvider({ children }: { children: ReactNode }) {
  const { user } = useDb()
  const { settings } = useSettings()
  const [manager] = useState(() => new DownloadManager({
    store: getStore(),
    repo: {
      list: () => listDownloads(user), save: (d) => saveDownload(user, d),
      remove: (id) => deleteDownload(user, id), removeAll: () => deleteAllDownloads(user),
    },
    fetchManifest,
    // scans without OCR (404) still download; the reader just has no text layer
    fetchOcr: (ident) => fetchOcr(ident).catch((e: unknown) => {
      if (/HTTP 404/.test(String(e))) return null
      throw e
    }),
    pageUrl: (p) => iiifUrl(p, SHARP_WIDTH),
    thumbUrl: (p) => iiifUrl(p, INDEX_THUMB_WIDTH),
  }))

  useEffect(() => { manager.setWifiOnly(settings.wifiOnly) }, [manager, settings.wifiOnly])

  useEffect(() => {
    let off = () => {}
    // the browser only guesses the type from speed estimates ('3g' → cellular): Wi-Fi only applies on the device
    const apply = (s: { connected: boolean; connectionType: string }) =>
      manager.setNetwork(s.connected, Capacitor.isNativePlatform() && s.connectionType === 'cellular')
    void (async () => {
      apply(await Network.getStatus())
      const h = await Network.addListener('networkStatusChange', apply)
      off = () => void h.remove()
      await manager.init()
    })()
    return () => off()
  }, [manager])

  return <DownloadsContext.Provider value={manager}>{children}</DownloadsContext.Provider>
}
