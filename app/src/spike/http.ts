// Fetch helpers for IA resources that do NOT send CORS headers (`/download/...`: djvu.xml, PDF).
// Native (Android): CapacitorHttp bypasses CORS. Web dev: Vite proxy `/ia-download` → archive.org/download.
import { Capacitor, CapacitorHttp } from '@capacitor/core'
import { USER_AGENT } from './config'
import { metrics } from './metrics'

const isNative = Capacitor.isNativePlatform()

function downloadUrl(ident: string, file: string): string {
  return isNative
    ? `https://archive.org/download/${ident}/${file}`
    : `/ia-download/${ident}/${file}`
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

export async function getDownloadBytes(ident: string, file: string): Promise<Uint8Array> {
  const url = downloadUrl(ident, file)
  if (isNative) {
    // arraybuffer responses come back base64-encoded over the bridge
    const r = await CapacitorHttp.get({ url, headers: { 'User-Agent': USER_AGENT }, responseType: 'arraybuffer' })
    if (r.status !== 200) throw new Error(`HTTP ${r.status} for ${file}`)
    const bin = atob(r.data as string)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    metrics.addBytes(out.byteLength)
    return out
  }
  const r = await fetch(url)
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${file}`)
  const out = new Uint8Array(await r.arrayBuffer())
  metrics.addBytes(out.byteLength)
  return out
}
