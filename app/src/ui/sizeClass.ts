import { useSyncExternalStore } from 'react'

/** Material window size classes, in CSS px (= dp in the WebView). A9+ landscape = expanded, S25 portrait = compact. */
export type SizeClass = 'compact' | 'medium' | 'expanded'

export function sizeClassFor(width: number): SizeClass {
  return width < 600 ? 'compact' : width < 840 ? 'medium' : 'expanded'
}

function subscribe(cb: () => void) {
  window.addEventListener('resize', cb)
  return () => window.removeEventListener('resize', cb)
}

export function useSizeClass(): SizeClass {
  return useSyncExternalStore(subscribe, () => sizeClassFor(window.innerWidth))
}

export function useOrientation(): 'portrait' | 'landscape' {
  return useSyncExternalStore(subscribe, () => (window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait'))
}
