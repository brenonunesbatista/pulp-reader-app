import { createContext, useContext } from 'react'
import type { Route } from './stack'

export interface NavApi {
  push: (r: Route) => void
  back: () => void
  replace: (r: Route) => void
  /** back to the root screen (Library), dropping the whole stack */
  reset: (r?: Route) => void
  depth: number
  top: Route
}

export const NavContext = createContext<NavApi | null>(null)
export const ActiveContext = createContext(true)

export function useNav(): NavApi {
  const v = useContext(NavContext)
  if (!v) throw new Error('useNav outside NavProvider')
  return v
}

/** false while the screen is covered by another one (pause timers, avoid work) */
export function useIsActive(): boolean {
  return useContext(ActiveContext)
}
