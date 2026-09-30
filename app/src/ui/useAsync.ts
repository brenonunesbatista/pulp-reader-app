import { useEffect, useState, type DependencyList } from 'react'

export type Async<T> = { status: 'loading' } | { status: 'ok'; data: T } | { status: 'error'; error: string }

/** Run an async loader when deps change; ignores results of stale runs. */
export function useAsync<T>(load: () => Promise<T>, deps: DependencyList): Async<T> {
  const [state, setState] = useState<Async<T>>({ status: 'loading' })
  useEffect(() => {
    let live = true
    load().then(
      (data) => { if (live) setState({ status: 'ok', data }) },
      (e) => { if (live) setState({ status: 'error', error: String(e) }) },
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller controls deps
  }, deps)
  return state
}
