import { describe, expect, it } from 'vitest'
import { memoryDb } from '../db/wasmDb'
import { downloadRelease, installedVersion, pickUpdate, sha256Hex, type AtlasRelease } from './content'

const release = (over: Partial<AtlasRelease> = {}): AtlasRelease => ({
  version: 200, schema: 2, url: 'atlas.db', size: 3, sha256: '', entities: 1, paths: 0, magazines: 0,
  published: '2026-10-12T00:00:00Z', ...over,
})

describe('content updates', () => {
  it('installs only newer releases of the schema this app reads', () => {
    expect(pickUpdate({ format: 1, atlas: release() }, 100)?.version).toBe(200)
    expect(pickUpdate({ format: 1, atlas: release() }, 200)).toBeNull()
    expect(pickUpdate({ format: 1, atlas: release() }, 300)).toBeNull()
    expect(pickUpdate({ format: 1, atlas: release({ schema: 3 }) }, 100)).toBeNull()
    expect(pickUpdate({ format: 2, atlas: release() }, 100)).toBeNull()
    expect(pickUpdate({ format: 1 }, 100)).toBeNull()
  })

  it('reads the installed version (0 when unknown)', async () => {
    const db = await memoryDb()
    expect(await installedVersion(db)).toBe(0)
    await db.exec(`CREATE TABLE atlas_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO atlas_meta VALUES ('content_version', '1791782812')`)
    expect(await installedVersion(db)).toBe(1791782812)
  })

  it('rejects downloads that do not match the manifest', async () => {
    const bytes = new Uint8Array([1, 2, 3])
    const sha = await sha256Hex(bytes)
    const f = (async () => new Response(bytes)) as typeof fetch
    expect(await downloadRelease(release({ sha256: sha }), 'https://x/updates/', f)).toEqual(bytes)
    await expect(downloadRelease(release({ sha256: 'bad' }), 'https://x/updates/', f)).rejects.toThrow(/checksum/)
    await expect(downloadRelease(release({ sha256: sha, size: 4 }), 'https://x/updates/', f)).rejects.toThrow(/bytes/)
  })
})

describe('APK updates', () => {
  it('normalizes the PC address and offers only newer builds', async () => {
    const { newerApk, serverBase } = await import('./apk')
    expect(serverBase('192.168.0.10:8765')).toBe('http://192.168.0.10:8765/')
    expect(serverBase(' http://pc.local:8765/ ')).toBe('http://pc.local:8765/')
    expect(serverBase('  ')).toBeNull()
    const r = { versionCode: 29400100, versionName: '', size: 1, sha256: '', url: 'banca.apk', built: '' }
    expect(newerApk(r, 29400000)).toBe(r)
    expect(newerApk(r, 29400100)).toBeNull()
  })
})
