import { useNav } from '../nav/context'
import { useDb } from '../db/useDb'
import { Screen, SubMasthead } from '../ui/components'
import { useSettings } from '../ui/settingsContext'
import { useAsync } from '../ui/useAsync'

export function SettingsScreen() {
  const { settings, update } = useSettings()
  const { catalog } = useDb()
  const nav = useNav()
  const meta = useAsync(async () => {
    const rows = await catalog.query<{ key: string; value: string }>(`SELECT key, value FROM catalog_meta`)
    const counts = await catalog.query<{ issues: number; stories: number; people: number }>(
      `SELECT (SELECT count(*) FROM issue) AS issues, (SELECT count(*) FROM story) AS stories, (SELECT count(*) FROM person) AS people`)
    return { meta: Object.fromEntries(rows.map((r) => [r.key, r.value])), counts: counts[0] }
  }, [catalog])

  return (
    <Screen masthead={<SubMasthead title="Settings" />}>
      <div className="settings-list">
        <section className="settings-group">
          <h3>Theme</h3>
          <div className="segmented">
            {(['paper', 'night'] as const).map((t) => (
              <button key={t} className={settings.theme === t ? 'on' : ''} onClick={() => update('theme', t)}>
                <span className="swatch" style={{ background: t === 'paper' ? '#EEE2C6' : '#0E1222' }} />
                {t === 'paper' ? 'Paper' : 'Night'}
              </button>
            ))}
          </div>
          <p className="muted small">The reader has its own Paper / Sepia / Night setting in its Display panel.</p>
        </section>

        <section className="settings-group">
          <h3>Catalog</h3>
          {meta.status === 'ok' && (
            <dl className="kv num">
              <dt>Contents</dt><dd>{meta.data.counts.issues} issues · {meta.data.counts.stories} stories · {meta.data.counts.people} people</dd>
              <dt>Source</dt><dd>{meta.data.meta.source}</dd>
              <dt>Schema</dt><dd>v{meta.data.meta.schema_version}</dd>
            </dl>
          )}
        </section>

        <section className="settings-group">
          <h3>Developer</h3>
          <label className="switch">
            <input type="checkbox" checked={settings.perfOverlay} onChange={(e) => update('perfOverlay', e.target.checked)} />
            <span className="track" />Performance overlay in the reader (fps, timings, memory)
          </label>
        </section>

        <section className="settings-group">
          <h3>About</h3>
          <p className="muted small">
            Banca — a personal newsstand for pulp magazines scanned by the Internet Archive. Page images and OCR are read
            from archive.org on demand.
          </p>
          <button className="btn" onClick={() => nav.back()}>Done</button>
        </section>
      </div>
    </Screen>
  )
}
