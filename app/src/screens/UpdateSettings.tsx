import { useEffect, useState } from 'react'
import { useSettings } from '../ui/settingsContext'
import { useAsync } from '../ui/useAsync'
import { apkUpdates, currentBuild } from '../updates/apk'
import { useUpdates } from '../updates/context'

const when = (s: number) => new Date(s * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

/** Settings → Updates: Atlas content over the air (GitHub) and new APKs from the PC on the LAN (src/updates). */
export function UpdateSettings() {
  const { state, check, installApk } = useUpdates()
  const { settings, update } = useSettings()
  const [server, setServer] = useState(settings.updateServer)
  useEffect(() => setServer(settings.updateServer), [settings.updateServer])
  const app = useAsync(() => (apkUpdates ? currentBuild() : Promise.resolve(null)), [])
  const busy = state.phase === 'checking' || state.phase === 'installing'
  const status = {
    idle: null, checking: 'Checking…', installing: 'Downloading the new Atlas…', current: 'Atlas is up to date.',
    installed: 'Atlas updated.', error: `Could not check: ${state.message ?? 'unknown error'}`,
  }[state.phase]
  return (
    <section className="settings-group">
      <h3>Updates</h3>
      <dl className="kv num">
        <dt>Atlas content</dt><dd>{state.version ? when(state.version) : 'unknown'}</dd>
        {state.checkedAt && <><dt>Last check</dt><dd>{new Date(state.checkedAt).toLocaleString()}</dd></>}
        {app.status === 'ok' && app.data && <><dt>App</dt><dd>{app.data.version} · build {app.data.build}</dd></>}
      </dl>
      <p className="muted small">
        New Atlas entries and magazine descriptions arrive without reinstalling the app. Banca checks by itself every few
        hours (on Wi-Fi when downloads are Wi-Fi only).
      </p>
      {status && <p className="small" role="status">{status}</p>}
      <button className="btn" disabled={busy} onClick={check}>{busy ? 'Checking…' : 'Check for updates'}</button>

      {apkUpdates && (
        <>
          <label className="field">
            <span className="small">PC address for new app versions (tools/serve_updates.py)</span>
            <input type="text" inputMode="url" placeholder="192.168.0.10:8765" value={server}
              onChange={(e) => setServer(e.target.value)} onBlur={() => update('updateServer', server.trim())} />
          </label>
          {state.apk && (
            <p className="small"><strong>New version on the PC:</strong> {state.apk.versionName} · {(state.apk.size / 1e6).toFixed(1)} MB</p>
          )}
          {state.apkMessage && <p className="muted small" role="status">{state.apkMessage}</p>}
          {state.apk && <button className="btn primary" onClick={installApk}>Install new version</button>}
        </>
      )}
    </section>
  )
}
