import { describe, expect, it } from 'vitest'
import { deleteAllDownloads, deleteDownload, listDownloads, saveDownload } from '../data/downloadRepo'
import { migrateUserDb } from '../db/userSchema'
import { memoryDb } from '../db/wasmDb'
import { DownloadManager, type ManagerDeps, type ScanPage } from './manager'
import { MemoryStore } from './store'

const PAGES: ScanPage[] = Array.from({ length: 6 }, (_, i) => ({ w: 1600, h: 2400, svc: `svc/${i}` }))
const tick = () => new Promise((r) => setTimeout(r, 0))

async function setup(opts: { fail?: (url: string, n: number) => boolean; gate?: Promise<void>; ocr?: unknown } = {}) {
  const user = await memoryDb()
  await migrateUserDb(user)
  const calls: string[] = []
  const tries = new Map<string, number>()
  let inflight = 0
  let maxInflight = 0
  const store = new MemoryStore(async (url) => {
    calls.push(url)
    const n = (tries.get(url) ?? 0) + 1
    tries.set(url, n)
    inflight++
    maxInflight = Math.max(maxInflight, inflight)
    try {
      await tick()
      if (opts.gate) await opts.gate
      if (opts.fail?.(url, n)) throw new Error(`HTTP 503 ${url}`)
      return new Blob([url.endsWith('/t') ? 'tt' : 'pppp'])
    } finally {
      inflight--
    }
  })
  const sleeps: number[] = []
  let manifestCalls = 0
  const deps: ManagerDeps = {
    store,
    repo: { list: () => listDownloads(user), save: (d) => saveDownload(user, d), remove: (id) => deleteDownload(user, id),
      removeAll: () => deleteAllDownloads(user) },
    fetchManifest: async () => { manifestCalls++; return PAGES },
    fetchOcr: async () => ('ocr' in opts ? opts.ocr : [[1, 1, []]]),
    pageUrl: (p) => `${p.svc}/p`,
    thumbUrl: (p) => `${p.svc}/t`,
    sleep: async (ms) => { sleeps.push(ms) },
    notifyEvery: 0,
  }
  const m = new DownloadManager(deps)
  return { m, user, store, calls, sleeps, deps, stats: { get max() { return maxInflight }, get manifest() { return manifestCalls } } }
}

describe('download manager', () => {
  it('downloads pages, thumbnails, manifest and OCR with at most 3 requests at a time', async () => {
    const { m, user, store, stats } = await setup()
    m.start(1, 'ident')
    await m.idle()
    const d = m.get(1)!
    expect(d).toMatchObject({ state: 'done', pagesDone: 6, pagesTotal: 6 })
    const files = await store.list('ident')
    expect(files.size).toBe(6 * 2 + 2)
    expect(d.bytes).toBe([...files.values()].reduce((a, b) => a + b, 0))
    expect(stats.max).toBeLessThanOrEqual(3)
    expect(stats.max).toBeGreaterThan(1)
    expect((await listDownloads(user))[0]).toMatchObject({ issueId: 1, ident: 'ident', state: 'done' })
    const local = await store.local('ident')
    expect(local?.has('p5.jpg') && local.has('t5.jpg') && local.has('ocr.json')).toBe(true)
  })

  it('retries with backoff, then fails the issue', async () => {
    const flaky = await setup({ fail: (url, n) => url === 'svc/2/p' && n <= 2 })
    flaky.m.start(1, 'ident')
    await flaky.m.idle()
    expect(flaky.m.get(1)?.state).toBe('done')
    expect(flaky.sleeps).toEqual([1000, 2000])

    const broken = await setup({ fail: (url) => url === 'svc/3/t' })
    broken.m.start(1, 'ident')
    await broken.m.idle()
    expect(broken.m.get(1)).toMatchObject({ state: 'error', error: 'HTTP 503 svc/3/t' })
    expect(broken.sleeps).toEqual([1000, 2000, 4000, 8000]) // 5 attempts
  })

  it('resumes: files already on disk are not fetched again', async () => {
    const { m, store, calls, stats } = await setup()
    await store.writeJson('ident', 'manifest.json', PAGES)
    await store.download('svc/0/p', 'ident', 'p0.jpg')
    await store.download('svc/0/t', 'ident', 't0.jpg')
    await store.download('svc/1/p', 'ident', 'p1.jpg') // thumb of page 1 missing
    calls.length = 0
    m.start(1, 'ident')
    await m.idle()
    expect(stats.manifest).toBe(0)
    expect(calls).not.toContain('svc/0/p')
    expect(calls).not.toContain('svc/1/p')
    expect(calls).toContain('svc/1/t')
    expect(m.get(1)).toMatchObject({ state: 'done', pagesDone: 6 })
  })

  it('pauses mid-way and resumes later without refetching', async () => {
    let open!: () => void
    const gate = new Promise<void>((r) => { open = r })
    const { m, calls } = await setup({ gate })
    m.start(1, 'ident')
    await tick(); await tick()
    m.pause(1)
    open()
    await m.idle()
    const paused = m.get(1)!
    expect(paused.state).toBe('paused')
    expect(paused.pagesDone).toBeLessThan(6)
    m.start(1, 'ident')
    await m.idle()
    expect(m.get(1)?.state).toBe('done')
    expect(new Set(calls).size).toBe(calls.length) // nothing downloaded twice
  })

  it('waits for Wi-Fi on mobile data and resumes when allowed', async () => {
    const { m, calls } = await setup()
    m.setNetwork(true, true) // cellular, Wi-Fi only (default)
    m.start(1, 'ident')
    await m.idle()
    expect(m.blocked).toBe('wifi')
    expect(m.get(1)?.state).toBe('downloading')
    expect(calls).toHaveLength(0)
    m.setWifiOnly(false)
    await m.idle()
    expect(m.get(1)?.state).toBe('done')
  })

  it('removes one issue or everything, keeping other user data', async () => {
    const { m, user, store } = await setup()
    m.start(1, 'a')
    m.start(2, 'b')
    await m.idle()
    expect(m.list().map((d) => d.state)).toEqual(['done', 'done'])
    await m.remove(1)
    expect((await store.list('a')).size).toBe(0)
    expect((await listDownloads(user)).map((d) => d.issueId)).toEqual([2])
    await m.removeAll()
    expect(m.list()).toEqual([])
    expect((await store.list('b')).size).toBe(0)
    expect(await listDownloads(user)).toEqual([])
  })

  it('restarts interrupted downloads on init; scans without OCR still complete', async () => {
    const { m, user, deps, store } = await setup({ ocr: null })
    await saveDownload(user, { issueId: 9, ident: 'z', state: 'downloading', bytes: 0, pagesDone: 2, pagesTotal: 6, updatedAt: 1, error: null })
    await saveDownload(user, { issueId: 8, ident: 'y', state: 'paused', bytes: 0, pagesDone: 1, pagesTotal: 6, updatedAt: 2, error: null })
    const fresh = new DownloadManager(deps)
    await fresh.init()
    await fresh.idle()
    expect(fresh.get(9)?.state).toBe('done')
    expect(fresh.get(8)?.state).toBe('paused')
    expect((await store.list('z')).has('ocr.json')).toBe(false)
    expect(m.list()).toEqual([])
  })
})
