// Download manager (SPEC §5): one issue at a time, up to 3 concurrent page requests, retry with backoff, resumable
// (files already on disk are skipped), survives restarts (state in user.db), waits while the network policy blocks
// it (offline, or Wi-Fi only on mobile data). The UI subscribes to snapshots (useSyncExternalStore).
import type { DownloadInfo } from '../data/models'
import type { DownloadStore } from './store'

export interface ScanPage { w: number; h: number; svc: string }

export interface ManagerDeps {
  store: DownloadStore
  repo: {
    list(): Promise<DownloadInfo[]>
    save(d: DownloadInfo): Promise<void>
    remove(issueId: number): Promise<void>
    removeAll(): Promise<void>
  }
  fetchManifest(ident: string): Promise<ScanPage[]>
  /** compact OCR, or null when the scan has none */
  fetchOcr(ident: string): Promise<unknown>
  pageUrl(p: ScanPage): string
  thumbUrl(p: ScanPage): string
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  concurrency?: number
  /** attempts per file before the issue is marked as failed */
  attempts?: number
  /** ms between UI notifications while pages arrive */
  notifyEvery?: number
}

export type Blocked = 'offline' | 'wifi' | null

/** thrown inside a run when it must stop (pause, removal, network policy) */
class Stop extends Error {}

const files = (leaf: number) => [`p${leaf}.jpg`, `t${leaf}.jpg`] as const

export class DownloadManager {
  private items = new Map<number, DownloadInfo>()
  private queue: number[] = []
  private active: { issueId: number; stop: boolean } | null = null
  private running: Promise<void> = Promise.resolve()
  private listeners = new Set<() => void>()
  private snap: DownloadInfo[] = []
  private notifyTimer: ReturnType<typeof setTimeout> | null = null
  private network = { connected: true, cellular: false }
  private wifiOnly = true
  private d: ManagerDeps & Required<Pick<ManagerDeps, 'sleep' | 'now' | 'concurrency' | 'attempts' | 'notifyEvery'>>

  constructor(deps: ManagerDeps) {
    this.d = {
      sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: Date.now, concurrency: 3, attempts: 5, notifyEvery: 300,
      ...deps,
    }
  }

  /** load saved state; issues that were downloading when the app closed resume */
  async init() {
    for (const it of await this.d.repo.list()) {
      this.items.set(it.issueId, it)
      if (it.state === 'downloading') this.queue.push(it.issueId)
    }
    this.emit(true)
    this.pump()
  }

  // ---- queries (snapshot items are immutable: an item object changes identity when it changes) -----------------
  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }
  list = () => this.snap
  get(issueId: number): DownloadInfo | undefined { return this.items.get(issueId) }
  get blocked(): Blocked {
    if (!this.network.connected) return 'offline'
    return this.wifiOnly && this.network.cellular ? 'wifi' : null
  }
  get online() { return this.network.connected }
  isActive(issueId: number) { return this.active?.issueId === issueId }

  // ---- policy ---------------------------------------------------------------------------------------------------
  setNetwork(connected: boolean, cellular: boolean) {
    this.network = { connected, cellular }
    this.policyChanged()
  }
  setWifiOnly(v: boolean) {
    this.wifiOnly = v
    this.policyChanged()
  }
  private policyChanged() {
    this.emit(true) // blocked runs stop on their own and requeue
    this.pump()
  }

  // ---- commands -------------------------------------------------------------------------------------------------
  start(issueId: number, ident: string) {
    const cur = this.items.get(issueId)
    if (cur?.state === 'done' || this.queue.includes(issueId) || this.isActive(issueId)) return
    const base = cur ?? { issueId, ident, bytes: 0, pagesDone: 0, pagesTotal: 0, updatedAt: 0, error: null }
    this.set({ ...base, ident, state: 'downloading', error: null }, true)
    this.queue.push(issueId)
    this.pump()
  }

  pause(issueId: number) {
    this.queue = this.queue.filter((x) => x !== issueId)
    if (this.active?.issueId === issueId) this.active.stop = true
    const cur = this.items.get(issueId)
    if (cur?.state === 'downloading') this.set({ ...cur, state: 'paused' }, true)
  }

  async remove(issueId: number) {
    const cur = this.items.get(issueId)
    if (!cur) return
    this.pause(issueId)
    await this.running // an in-flight file must not recreate the folder after it is deleted
    this.items.delete(issueId)
    this.emit(true)
    await this.d.store.remove(cur.ident)
    await this.d.repo.remove(issueId)
  }

  async removeAll() {
    this.queue = []
    if (this.active) this.active.stop = true
    await this.running
    this.items.clear()
    this.emit(true)
    await this.d.store.removeAll()
    await this.d.repo.removeAll()
  }

  /** resolves when nothing is running and nothing runnable is queued (tests) */
  async idle() {
    while (this.active) await this.running
  }

  // ---- worker ---------------------------------------------------------------------------------------------------
  private pump() {
    if (this.active || this.blocked || !this.queue.length) return
    const job = { issueId: this.queue.shift()!, stop: false }
    this.active = job
    this.running = this.run(job).finally(() => {
      this.active = null
      this.pump()
    })
  }

  private async run(job: { issueId: number; stop: boolean }) {
    const { store } = this.d
    const ident = this.items.get(job.issueId)!.ident
    const halted = () => job.stop || !!this.blocked || !this.items.has(job.issueId)
    const retry = async <T,>(fn: () => Promise<T>): Promise<T> => {
      for (let i = 0; ; i++) {
        if (halted()) throw new Stop()
        try {
          return await fn()
        } catch (e) {
          if (halted()) throw new Stop()
          if (i + 1 >= this.d.attempts) throw e
          await this.d.sleep(1000 * 2 ** i)
        }
      }
    }
    /** merge into the current item (it may have been paused meanwhile; the state is only changed explicitly) */
    const patch = (p: Partial<DownloadInfo>, persist: boolean) => {
      const cur = this.items.get(job.issueId)
      if (cur) this.set({ ...cur, ...p }, persist)
    }

    try {
      const have = await store.list(ident)
      const local = have.has('manifest.json') ? await store.local(ident) : null
      let bytes = [...have.values()].reduce((a, b) => a + b, 0)
      let pages = (await local?.readJson<ScanPage[]>('manifest.json')) ?? null
      if (!pages?.length) {
        pages = await retry(() => this.d.fetchManifest(ident))
        bytes += await store.writeJson(ident, 'manifest.json', pages)
      }
      const todo = pages.map((_, l) => l).filter((l) => files(l).some((f) => !have.has(f)))
      let done = pages.length - todo.length
      let saved = done
      patch({ pagesTotal: pages.length, pagesDone: done, bytes }, true)

      let next = 0
      const scan = pages
      const worker = async () => {
        while (next < todo.length && !halted()) {
          const leaf = todo[next++]
          const [pf, tf] = files(leaf)
          // (`bytes += await …` would read `bytes` before the await and lose the other workers' additions)
          const pb = have.has(pf) ? 0 : await retry(() => store.download(this.d.pageUrl(scan[leaf]), ident, pf))
          const tb = have.has(tf) ? 0 : await retry(() => store.download(this.d.thumbUrl(scan[leaf]), ident, tf))
          bytes += pb + tb
          done++
          const persist = done - saved >= 10
          if (persist) saved = done
          patch({ pagesDone: done, bytes }, persist)
        }
      }
      await Promise.all(Array.from({ length: this.d.concurrency }, worker))
      if (halted()) throw new Stop()

      if (!have.has('ocr.json')) {
        const ocr = await retry(() => this.d.fetchOcr(ident))
        if (ocr) {
          const n = await store.writeJson(ident, 'ocr.json', ocr)
          bytes += n
        }
      }
      patch({ bytes, state: 'done', error: null }, true)
    } catch (e) {
      const cur = this.items.get(job.issueId)
      if (!cur) return // removed
      if (e instanceof Stop) {
        // network policy: wait at the front of the queue; a user pause already set the state to 'paused'
        if (cur.state === 'downloading') this.queue.unshift(job.issueId)
        this.set(cur, true)
      } else {
        this.set({ ...cur, state: 'error', error: e instanceof Error ? e.message : String(e) }, true)
      }
    }
  }

  // ---- state ----------------------------------------------------------------------------------------------------
  private set(next: DownloadInfo, persist: boolean) {
    const v = { ...next, updatedAt: this.d.now() }
    this.items.set(v.issueId, v)
    if (persist) void this.d.repo.save(v)
    this.emit(persist)
  }

  private emit(now: boolean) {
    if (!now) {
      this.notifyTimer ??= setTimeout(() => this.emit(true), this.d.notifyEvery)
      return
    }
    if (this.notifyTimer) clearTimeout(this.notifyTimer)
    this.notifyTimer = null
    this.snap = [...this.items.values()].sort((a, b) => b.updatedAt - a.updatedAt)
    for (const fn of this.listeners) fn()
  }
}
