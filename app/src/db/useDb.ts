import { createContext, useContext } from 'react'
import type { Databases, Db } from './types'

export const DbContext = createContext<Databases | null>(null)
export const DbControlContext = createContext<{ replaceAtlas: (atlas: Db) => void } | null>(null)

export function useDb(): Databases {
  const v = useContext(DbContext)
  if (!v) throw new Error('useDb outside DbProvider')
  return v
}

export function useDbControl() {
  const v = useContext(DbControlContext)
  if (!v) throw new Error('useDbControl outside DbProvider')
  return v
}
