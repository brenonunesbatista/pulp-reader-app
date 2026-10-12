import { Network } from '@capacitor/network'
import { Capacitor } from '@capacitor/core'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { installAtlas } from '../db'
import { useDb, useDbControl } from '../db/useDb'
import { useSettings } from '../ui/settingsContext'
import { checkApk, installApk } from './apk'
import { downloadRelease, fetchManifest, installedVersion, pickUpdate } from './content'
import { UpdatesContext, type UpdatesState } from './context'

const AUTO_EVERY_MS = 6 * 3600_000
const CHECKED_KEY = 'content_checked_at' // user.db settings, outside the Settings object

/** Content updates: checks a few seconds after start (at most every 6 h, Wi-Fi only unless downloads may use
 *  mobile data) and on demand; installs a newer atlas.db and says so in a toast. */
export function UpdatesProvider({ children }: { children: ReactNode }) {
  const { atlas, user } = useDb()
  const { replaceAtlas } = useDbControl()
  const { settings } = useSettings()
  const [state, setState] = useState<UpdatesState>({
    phase: 'idle', version: 0, message: null, checkedAt: null, apk: null, apkMessage: null })
  const [toast, setToast] = useState<string | null>(null)
  const atlasRef = useRef(atlas)
  atlasRef.current = atlas
  const busy = useRef(false)

  const server = settings.updateServer
  const serverRef = useRef(server)
  serverRef.current = server

  /** ask the PC for a newer APK (cheap, on the LAN: at every start and every manual check) */
  const runApk = useCallback(async (manual: boolean) => {
    if (!serverRef.current.trim()) return
    if (manual) setState((s) => ({ ...s, apk: null, apkMessage: 'Asking the PC for a new app version…' }))
    try {
      const apk = await checkApk(serverRef.current)
      setState((s) => ({ ...s, apk, apkMessage: apk ? null : 'This is the newest version on the PC.' }))
      if (apk && !manual) setToast('New Banca version on your PC · Settings → Updates')
    } catch (e) {
      console.warn('[updates] apk', e)
      setState((s) => ({ ...s, apk: null, apkMessage: `PC not reachable (${e instanceof Error ? e.message : String(e)})` }))
    }
  }, [])

  const run = useCallback(async (manual: boolean) => {
    if (busy.current) return
    busy.current = true
    const now = Date.now()
    try {
      const version = await installedVersion(atlasRef.current)
      setState((s) => ({ ...s, phase: 'checking', version, message: null }))
      const rel = pickUpdate(await fetchManifest(), version)
      await user.run(`INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`, [CHECKED_KEY, String(now)])
      if (!rel) {
        setState((s) => ({ ...s, phase: 'current', version, message: null, checkedAt: now }))
        if (manual) setToast('Atlas is up to date')
        return
      }
      setState((s) => ({ ...s, phase: 'installing' }))
      const db = await installAtlas(await downloadRelease(rel))
      replaceAtlas(db)
      setState((s) => ({ ...s, phase: 'installed', version: rel.version, message: null, checkedAt: now }))
      setToast(`Atlas updated · ${rel.entities} entries, ${rel.magazines} magazine descriptions`)
    } catch (e) {
      console.warn('[updates]', e)
      setState((s) => ({ ...s, phase: 'error', message: String(e instanceof Error ? e.message : e), checkedAt: now }))
      if (manual) setToast('Could not check for updates')
    } finally {
      busy.current = false
    }
  }, [user, replaceAtlas])

  // automatic check, once per app start
  const wifiOnly = settings.wifiOnly
  useEffect(() => {
    const t = setTimeout(async () => {
      const last = Number((await user.query<{ value: string }>(`SELECT value FROM settings WHERE key = ?`, [CHECKED_KEY]))[0]?.value ?? 0)
      setState((s) => ({ ...s, checkedAt: last || null }))
      void runApk(false)
      if (Date.now() - last < AUTO_EVERY_MS) return
      const net = await Network.getStatus()
      if (!net.connected || (Capacitor.isNativePlatform() && wifiOnly && net.connectionType === 'cellular')) return
      void run(false)
    }, 4000)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per start
  }, [])

  useEffect(() => {
    void installedVersion(atlas).then((version) => setState((s) => ({ ...s, version })))
  }, [atlas])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const install = useCallback(async () => {
    const apk = state.apk
    if (!apk) return
    setState((s) => ({ ...s, apkMessage: 'Downloading from the PC…' }))
    try {
      const r = await installApk(serverRef.current, apk)
      setState((s) => ({ ...s, apkMessage: r === 'permission'
        ? 'Allow Banca to install apps on the screen Android opened, come back and tap Install again.'
        : 'Confirm the installation; Banca restarts with the new version.' }))
    } catch (e) {
      setState((s) => ({ ...s, apkMessage: `Could not install: ${e instanceof Error ? e.message : String(e)}` }))
    }
  }, [state.apk])

  const api = useMemo(() => ({
    state, check: (typed?: string) => {
      if (typed !== undefined) serverRef.current = typed.trim()
      void run(true)
      void runApk(true)
    }, installApk: () => void install(),
  }), [state, run, runApk, install])
  return (
    <UpdatesContext.Provider value={api}>
      {children}
      {toast && <div className="toast" role="status">{toast}</div>}
    </UpdatesContext.Provider>
  )
}
