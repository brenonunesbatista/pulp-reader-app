// Fetch helpers for IA resources that do NOT send CORS headers (`/download/...`: djvu.xml).
// Native (Android): CapacitorHttp bypasses CORS. Web dev: Vite proxy `/ia-download` → archive.org/download.
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { USER_AGENT } from './config'
import { metrics } from './metrics'

const isNative = Capacitor.isNativePlatform()

function downloadUrl(ident: string, file: string): string {
  // file names of pack issues have spaces, '#' and brackets ("Dungeon Magazine # 1 - …_djvu.xml")
  const path = `${encodeURIComponent(ident)}/${encodeURIComponent(file)}`
  return isNative ? `https://archive.org/download/${path}` : `/ia-download/${path}`
}

export async function getDownloadText(ident: string, file: string): Promise<string> {
  const url = downloadUrl(ident, file)
  if (isNative) {
    const r = await CapacitorHttp.get({ url, headers: { 'User-Agent': USER_AGENT }, responseType: 'text' })
    if (r.status !== 200) throw new Error(`HTTP ${r.status} for ${file}`)
    const text = r.data as string
    metrics.addBytes(text.length)
    return text
  }
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${file}`)
  const text = await r.text()
  metrics.addBytes(text.length)
  return text
}
