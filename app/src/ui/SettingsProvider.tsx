import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS, loadSettings, saveSetting, type Settings } from '../data/settingsRepo'
import { useDb } from '../db/useDb'
import { SettingsContext } from './settingsContext'

/** Loads settings once (before the app renders, so the theme never flashes) and applies the app theme. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const { user } = useDb()
  const [settings, setSettings] = useState<Settings | null>(null)

  useEffect(() => {
    loadSettings(user).then(setSettings, () => setSettings(DEFAULT_SETTINGS))
  }, [user])

  useEffect(() => {
    if (settings) document.documentElement.dataset.theme = settings.theme
  }, [settings])

  const update = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => (s ? { ...s, [key]: value } : s))
    void saveSetting(user, key, value)
  }, [user])

  const api = useMemo(() => (settings ? { settings, update } : null), [settings, update])
  if (!api) return null
  return <SettingsContext.Provider value={api}>{children}</SettingsContext.Provider>
}
