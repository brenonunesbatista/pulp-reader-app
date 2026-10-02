// Opens the two databases once per app run. Android → native plugin; browser dev → sqlite-wasm.
import { Capacitor } from '@capacitor/core'
import type { Databases } from './types'
import { migrateUserDb } from './userSchema'

let opening: Promise<Databases & { info: string }> | null = null

export function openDatabases(): Promise<Databases & { info: string }> {
  opening ??= (async () => {
    if (Capacitor.isNativePlatform()) {
      const { openNative } = await import('./nativeDb')
      return openNative()
    }
    const t0 = performance.now()
    const { dbFromBytes, memoryDb } = await import('./wasmDb')
    const load = async (url: string) => dbFromBytes(new Uint8Array(await (await fetch(url)).arrayBuffer()))
    const [catalog, atlas] = await Promise.all([load('/catalog/catalog.db'), load('/atlas/atlas.db')])
    const user = await memoryDb() // dev only: progress is not persisted in the browser
    await migrateUserDb(user)
    return { catalog, atlas, user, info: `web sqlite-wasm in ${Math.round(performance.now() - t0)} ms` }
  })()
  return opening
}

export type { Databases, Db } from './types'
