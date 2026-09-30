import { useEffect, useState, type ReactNode } from 'react'
import { openDatabases } from './index'
import type { Databases } from './types'
import { DbContext } from './useDb'

/** Opens both databases before rendering the app (native open is ~100 ms, so a plain splash is enough). */
export function DbProvider({ children }: { children: ReactNode }) {
  const [dbs, setDbs] = useState<Databases | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    openDatabases().then((d) => {
      console.info(`[db] ${d.info}`)
      setDbs(d)
    }, (e) => setError(String(e)))
  }, [])
  if (error) return <div className="splash error-text">Could not open the catalog: {error}</div>
  if (!dbs) return <div className="splash">Pulp Reader</div>
  return <DbContext.Provider value={dbs}>{children}</DbContext.Provider>
}
