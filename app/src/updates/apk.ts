// New APKs from the PC on the home network (Phase 12): tools/serve_updates.py serves /apk.json and /banca.apk; the
// local native plugin (android/.../BancaUpdatePlugin.java) fetches them over plain HTTP and opens Android's installer.
import { App } from '@capacitor/app'
import { Capacitor, registerPlugin } from '@capacitor/core'

export interface ApkRelease {
  versionCode: number
  versionName: string
  size: number
  sha256: string
  url: string // relative to the server
  built: string
}

interface BancaUpdate {
  getText(o: { url: string }): Promise<{ text: string }>
  installApk(o: { url: string; sha256: string }): Promise<void>
}

const plugin = registerPlugin<BancaUpdate>('BancaUpdate')
export const apkUpdates = Capacitor.isNativePlatform()

/** "192.168.0.10:8765", "http://pc.local:8765/" → "http://192.168.0.10:8765/" (null when empty) */
export function serverBase(address: string): string | null {
  const a = address.trim().replace(/\/+$/, '')
  if (!a) return null
  return `${/^https?:\/\//i.test(a) ? a : `http://${a}`}/`
}

/** a release newer than the running build, if any */
export function newerApk(r: ApkRelease, currentBuild: number): ApkRelease | null {
  return Number.isFinite(r.versionCode) && r.versionCode > currentBuild ? r : null
}

export async function currentBuild(): Promise<{ build: number; version: string }> {
  const info = await App.getInfo()
  return { build: Number(info.build) || 0, version: info.version }
}

export async function checkApk(address: string): Promise<ApkRelease | null> {
  const base = serverBase(address)
  if (!apkUpdates || !base) return null
  const { text } = await plugin.getText({ url: `${base}apk.json` })
  return newerApk(JSON.parse(text) as ApkRelease, (await currentBuild()).build)
}

/** download, verify and hand over to Android's installer; 'permission' when Banca must first be allowed to install
 *  apps (Android opens that screen) */
export async function installApk(address: string, r: ApkRelease): Promise<'started' | 'permission'> {
  const base = serverBase(address)
  if (!base) throw new Error('no PC address')
  try {
    await plugin.installApk({ url: new URL(r.url, base).href, sha256: r.sha256 })
    return 'started'
  } catch (e) {
    if ((e as { code?: string }).code === 'NEEDS_PERMISSION') return 'permission'
    throw e
  }
}
