import { useEffect, useRef } from 'react'
import { metrics } from './engine/metrics'

/** Small always-on-top panel; updates its own DOM every 500 ms (no React re-renders). */
export function MetricsOverlay() {
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    metrics.startFps()
    const id = window.setInterval(() => {
      const el = ref.current
      if (!el) return
      const lines = [
        `fps ${metrics.fps.toFixed(0)}  min ${Number.isFinite(metrics.minFps) ? metrics.minFps.toFixed(0) : '-'}  long ${metrics.longFrames}`,
        `mem ${metrics.memory()}`,
        `net ${(metrics.bytes / 1e6).toFixed(2)} MB`,
        ...[...metrics.values].map(([k, v]) => `${k}: ${v}`),
      ]
      el.textContent = lines.join('\n')
    }, 500)
    return () => {
      window.clearInterval(id)
      metrics.stopFps()
    }
  }, [])

  return (
    <pre
      ref={ref}
      className="metrics"
      onClick={() => {
        metrics.minFps = Infinity
        metrics.longFrames = 0
      }}
    />
  )
}
