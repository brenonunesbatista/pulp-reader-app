import { createContext, useContext } from 'react'
import type { Databases } from './types'

export const DbContext = createContext<Databases | null>(null)

export function useDb(): Databases {
  const v = useContext(DbContext)
  if (!v) throw new Error('useDb outside DbProvider')
  return v
}
