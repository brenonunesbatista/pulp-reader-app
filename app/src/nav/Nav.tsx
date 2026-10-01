// Navigation: stack of screens + browser history + Android hardware Back.
// Every push adds a history entry; Back (browser, Android button, or UI) goes through history.back() → popstate → pop,
// so all three paths stay in sync.
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { ActiveContext, NavContext } from './context'
import { hashToRoute, initialStack, routeToHash, stackReducer, type Entry, type Route } from './stack'

export function NavProvider({ render }: { render: (route: Route) => ReactNode }) {
  const [state, dispatch] = useReducer(stackReducer, undefined, () => {
    // dev reload on a deep link: start with Library underneath so Back works
    const r = hashToRoute(window.location.hash)
    const s = initialStack()
    return r.name === 'library' ? s : stackReducer(s, { type: 'push', route: r })
  })
  const depth = state.entries.length
  const depthRef = useRef(depth)
  useLayoutEffect(() => { depthRef.current = depth }, [depth])

  useEffect(() => {
    history.replaceState({ depth: 1 }, '', routeToHash({ name: 'library' }))
    if (depth > 1) history.pushState({ depth }, '', routeToHash(state.entries[depth - 1].route))
    const onPop = () => {
      if (depthRef.current > 1) dispatch({ type: 'pop' })
    }
    window.addEventListener('popstate', onPop)
    let remove: (() => void) | undefined
    if (Capacitor.isNativePlatform()) {
      const h = CapApp.addListener('backButton', () => {
        if (depthRef.current > 1) history.back()
        else void CapApp.exitApp()
      })
      remove = () => void h.then((x) => x.remove())
    }
    return () => {
      window.removeEventListener('popstate', onPop)
      remove?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- install once
  }, [])

  const push = useCallback((route: Route) => {
    dispatch({ type: 'push', route })
    history.pushState({}, '', routeToHash(route))
  }, [])
  const replace = useCallback((route: Route) => {
    dispatch({ type: 'replace', route })
    history.replaceState({}, '', routeToHash(route))
  }, [])
  const back = useCallback(() => {
    if (depthRef.current > 1) history.back()
  }, [])
  const reset = useCallback(() => {
    // drop the stack first; the single popstate fired by history.go(-n) then sees depth 1 and is ignored
    const n = depthRef.current - 1
    if (n <= 0) return
    depthRef.current = 1
    dispatch({ type: 'reset', route: { name: 'library' } })
    history.go(-n)
  }, [])
  const top = state.entries[depth - 1].route
  const api = useMemo(() => ({ push, back, replace, reset, depth, top }), [push, back, replace, reset, depth, top])

  return (
    <NavContext.Provider value={api}>
      {state.entries.map((e: Entry, i) => {
        const active = i === state.entries.length - 1
        return (
          <ActiveContext.Provider key={e.key} value={active}>
            <div className={`screen-slot ${active ? 'active' : 'covered'}`} aria-hidden={!active}>
              {render(e.route)}
            </div>
          </ActiveContext.Provider>
        )
      })}
    </NavContext.Provider>
  )
}
