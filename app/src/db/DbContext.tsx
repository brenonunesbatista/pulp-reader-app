import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { openDatabases } from './index'
import type { Databases, Db } from './types'
import { DbContext, DbControlContext } from './useDb'

/** Opens both databases before rendering the app (native open is ~100 ms, so a plain splash is enough).
 *  A content update swaps the atlas connection: every screen that reads it re-renders with the new one. */
export function DbProvider({ children }: { children: ReactNode }) {
  const [dbs, setDbs] = useState<Databases | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    openDatabases().then((d) => {
      console.info(`[db] ${d.info}`)
      setDbs({ catalog: d.catalog, atlas: d.atlas, user: d.user })
    }, (e) => setError(String(e)))
  }, [])
  const replaceAtlas = useCallback((atlas: Db) => setDbs((d) => (d ? { ...d, atlas } : d)), [])
  const control = useMemo(() => ({ replaceAtlas }), [replaceAtlas])
  if (error) return <div className="splash error-text">Could not open the databases: {error}</div>
  if (!dbs) return <div className="splash">BANCA</div>
  return (
    <DbControlContext.Provider value={control}>
      <DbContext.Provider value={dbs}>{children}</DbContext.Provider>
    </DbControlContext.Provider>
  )
}
