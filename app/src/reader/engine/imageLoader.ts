// Image pipeline for reader B: prioritized, cancellable, max 4 concurrent fetches; encoded blobs kept in an
// LRU (cheap), decoded <img> elements kept only for the current window (expensive).
import { BLOB_CACHE_PAGES } from './config'
import { metrics } from './metrics'

const MAX_CONCURRENT = 4

interface Task {
  url: string
  priority: number
  ctrl: AbortController
  resolve: (b: Blob) => void
  reject: (e: unknown) => void
  started: boolean
}

export class ImageLoader {
  private blobs = new Map<string, Blob>() // insertion order = LRU order
  private pending = new Map<string, Task>()
  private active = 0

  has(url: string) {
    return this.blobs.has(url)
  }

  /** Fetch (or reuse) the blob and return a decoded <img>. Lower priority number = sooner. */
  async load(url: string, priority: number): Promise<HTMLImageElement> {
    const blob = await this.blob(url, priority)
    const img = new Image()
    img.decoding = 'async'
    img.draggable = false
    img.src = URL.createObjectURL(blob)
    await img.decode()
    return img
  }

  /** Download into the blob cache without decoding (pages further ahead). */
  prefetch(url: string, priority: number): void {
    if (this.blobs.has(url)) return
    this.blob(url, priority).catch(() => { /* aborted or failed: will be retried when the page gets closer */ })
  }

  release(img: HTMLImageElement) {
    URL.revokeObjectURL(img.src)
    img.removeAttribute('src')
  }

  /** Abort queued/in-flight requests whose URL is not in `keep`; re-prioritize the rest. */
  retain(keep: Map<string, number>) {
    for (const [url, t] of this.pending) {
      const p = keep.get(url)
      if (p === undefined) {
        t.ctrl.abort()
        this.pending.delete(url)
        t.reject(new DOMException('stale', 'AbortError'))
        if (t.started) this.active--
      } else {
        t.priority = p
      }
    }
    this.pump()
  }

  private blob(url: string, priority: number): Promise<Blob> {
    const cached = this.blobs.get(url)
    if (cached) {
      this.blobs.delete(url)
      this.blobs.set(url, cached)
      return Promise.resolve(cached)
    }
    const existing = this.pending.get(url)
    if (existing) {
      existing.priority = Math.min(existing.priority, priority)
      return new Promise((res, rej) => {
        const { resolve, reject } = existing
        existing.resolve = (b) => { resolve(b); res(b) }
        existing.reject = (e) => { reject(e); rej(e) }
      })
    }
    return new Promise((resolve, reject) => {
      this.pending.set(url, { url, priority, ctrl: new AbortController(), resolve, reject, started: false })
      this.pump()
    })
  }

  private pump() {
    while (this.active < MAX_CONCURRENT) {
      let next: Task | undefined
      for (const t of this.pending.values()) if (!t.started && (!next || t.priority < next.priority)) next = t
      if (!next) return
      this.run(next)
    }
  }

  private async run(t: Task) {
    t.started = true
    this.active++
    try {
      const r = await fetch(t.url, { signal: t.ctrl.signal })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const b = await r.blob()
      metrics.addBytes(b.size)
      this.blobs.set(t.url, b)
      while (this.blobs.size > BLOB_CACHE_PAGES * 2) this.blobs.delete(this.blobs.keys().next().value!)
      if (this.pending.get(t.url) === t) {
        this.pending.delete(t.url)
        this.active--
        t.resolve(b)
      }
    } catch (e) {
      if (this.pending.get(t.url) === t) {
        this.pending.delete(t.url)
        this.active--
        t.reject(e)
      }
    }
    this.pump()
  }
}
