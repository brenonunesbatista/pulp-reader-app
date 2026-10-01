import { createContext, useContext } from 'react'
import type { Settings } from '../data/settingsRepo'

export interface SettingsApi {
  settings: Settings
  update: <K extends keyof Settings>(key: K, value: Settings[K]) => void
}

export const SettingsContext = createContext<SettingsApi | null>(null)

export function useSettings(): SettingsApi {
  const v = useContext(SettingsContext)
  if (!v) throw new Error('useSettings outside SettingsProvider')
  return v
}
