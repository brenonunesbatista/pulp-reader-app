// Benchmark metrics. Plain mutable store (no React state) so measuring does not cause re-renders.

interface PerfMemory { usedJSHeapSize: number; totalJSHeapSize: number }

class Metrics {
  values = new Map<string, string>()
  bytes = 0
  private turnStart = 0
  private turnCached = false
  turnSamples: number[] = []
  // FPS
  fps = 0
  minFps = Infinity
  longFrames = 0
  private frames = 0
  private lastSec = 0
  private lastFrame = 0
  private running = false

  set(key: string, value: string) {
    this.values.set(key, value)
  }

  addBytes(n: number) {
    this.bytes += n
  }

  reset() {
    this.values.clear()
    this.bytes = 0
    this.turnSamples = []
    this.minFps = Infinity
    this.longFrames = 0
  }

  /** call when a page turn is requested */
  turnBegin(cached: boolean) {
    this.turnStart = performance.now()
    this.turnCached = cached
  }

  /** call when the new page is visible (first image painted) */
  turnEnd() {
    if (!this.turnStart) return
    const start = this.turnStart
    this.turnStart = 0
    const cached = this.turnCached
    // wait for the next frame so the time includes paint
    requestAnimationFrame(() => {
      const ms = performance.now() - start
      this.turnSamples.push(ms)
      const s = [...this.turnSamples].sort((a, b) => a - b)
      const med = s[Math.floor(s.length / 2)]
      const p90 = s[Math.floor(s.length * 0.9)]
      this.set('turn last', `${Math.round(ms)} ms${cached ? ' (cached)' : ' (net)'}`)
      this.set('turn med/p90', `${Math.round(med)} / ${Math.round(p90)} ms (n=${s.length})`)
    })
  }

  memory(): string {
    const m = (performance as unknown as { memory?: PerfMemory }).memory
    return m ? `${(m.usedJSHeapSize / 1e6).toFixed(0)} / ${(m.totalJSHeapSize / 1e6).toFixed(0)} MB` : 'n/a'
  }

  startFps() {
    if (this.running) return
    this.running = true
    this.lastSec = this.lastFrame = performance.now()
    const loop = (t: number) => {
      if (!this.running) return
      this.frames++
      if (t - this.lastFrame > 25) this.longFrames++ // < 40 fps frame
      this.lastFrame = t
      if (t - this.lastSec >= 1000) {
        this.fps = (this.frames * 1000) / (t - this.lastSec)
        // ignore idle seconds: rAF keeps running even when nothing changes, so min is meaningful
        this.minFps = Math.min(this.minFps, this.fps)
        this.frames = 0
        this.lastSec = t
      }
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }

  stopFps() {
    this.running = false
  }
}

export const metrics = new Metrics()
