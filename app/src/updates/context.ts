import { createContext, useContext } from 'react'
import type { ApkRelease } from './apk'

export interface UpdatesState {
  phase: 'idle' | 'checking' | 'installing' | 'current' | 'installed' | 'error'
  /** installed content version (commit time, Unix seconds; 0 = unknown) */
  version: number
  message: string | null
  checkedAt: number | null
  /** a newer APK on the PC (Settings → Updates → PC address), null when none or not checked */
  apk: ApkRelease | null
  apkMessage: string | null
}

export interface UpdatesApi {
  state: UpdatesState
  /** check now (Settings button); the app also checks by itself at most every few hours */
  /** `server`: the PC address as typed (it may not be saved yet when the button is tapped) */
  check: (server?: string) => void
  /** download the APK from the PC and open Android's installer */
  installApk: () => void
}

export const UpdatesContext = createContext<UpdatesApi | null>(null)

export function useUpdates(): UpdatesApi {
  const v = useContext(UpdatesContext)
  if (!v) throw new Error('useUpdates outside UpdatesProvider')
  return v
}
