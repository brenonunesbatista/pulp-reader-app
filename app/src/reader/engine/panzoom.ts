// Reader gesture controller.
// All per-frame work is a single CSS transform written in requestAnimationFrame — no React state.
//   1 finger, not zoomed : page follows finger, swipe → turn
//   1 finger, zoomed     : pan with inertia; dragging past the left/right page edge → turn (zoom kept)
//   2 fingers            : pinch-zoom around the midpoint
//   tap left/right 25%   : turn (12% when zoomed);  tap center: toggle chrome;  double-tap center: zoom in/out

export interface PanZoomOptions {
  onTurn: (dir: -1 | 1) => void
  /** single tap in the middle zone; client coordinates (for hit-testing highlights) */
  onCenterTap: (client: { x: number; y: number }) => void
  onZoomSettled?: (scale: number) => void
  /** zoom or position changed by the user (for saving progress) */
  onViewChange?: () => void
  /** true while the user has a text selection — gestures are then left to the browser */
  isSelecting: () => boolean
}

interface Pt { x: number; y: number }

const MAX_SCALE = 5
const DOUBLE_TAP_MS = 280
const TAP_SLOP = 10
const SWIPE_MIN = 60
const EDGE = 0.25 // tap zone width (fraction of the screen) at fit
const EDGE_ZOOMED = 0.12
const OVERSCROLL_TURN = 90 // px dragged past the page edge (finger distance) to turn while zoomed
const RUBBER_MAX = 140

export class PanZoom {
  private vw = 0
  private vh = 0
  private fitW = 0
  private fitH = 0
  scale = 1
  private x = 0
  private y = 0
  private pointers = new Map<number, Pt>()
  private start: { p: Pt; t: number; x: number; y: number } | null = null
  private pinch: { dist: number; scale: number; mid: Pt; x: number; y: number } | null = null
  private moved = false
  private wasPinch = false
  private vel: Pt = { x: 0, y: 0 }
  private lastMove: { p: Pt; t: number } | null = null
  private raf = 0
  private inertiaRaf = 0
  private lastTap: { t: number; p: Pt } | null = null
  private centerTapTimer = 0
  private viewport: HTMLElement
  private content: HTMLElement
  private opts: PanZoomOptions
  private ro: ResizeObserver
  private pageW = 1
  private pageH = 1
  private rubber = 0 // visual-only horizontal offset while over-dragging a zoomed page
  private overscroll = 0
  private carry: { scale: number; dir: -1 | 1 } | null = null
  /** phones in portrait: pages open zoomed to the screen width, at the top */
  fitWidth = false

  constructor(viewport: HTMLElement, content: HTMLElement, opts: PanZoomOptions) {
    this.viewport = viewport
    this.content = content
    this.opts = opts
    viewport.style.touchAction = 'none'
    content.style.transformOrigin = '0 0'
    content.style.willChange = 'transform'
    viewport.addEventListener('pointerdown', this.onDown)
    viewport.addEventListener('pointermove', this.onMove)
    viewport.addEventListener('pointerup', this.onUp)
    viewport.addEventListener('pointercancel', this.onCancel)
    this.ro = new ResizeObserver(() => this.layout())
    this.ro.observe(viewport)
  }

  destroy() {
    this.viewport.removeEventListener('pointerdown', this.onDown)
    this.viewport.removeEventListener('pointermove', this.onMove)
    this.viewport.removeEventListener('pointerup', this.onUp)
    this.viewport.removeEventListener('pointercancel', this.onCancel)
    this.ro.disconnect()
    cancelAnimationFrame(this.raf)
    cancelAnimationFrame(this.inertiaRaf)
    window.clearTimeout(this.centerTapTimer)
  }

  /** Size in CSS px the content is laid out at (fit-to-viewport, scale 1). */
  get fitSize() {
    return { w: this.fitW, h: this.fitH }
  }

  /** Set the page aspect (native px). After a gesture turn while zoomed, keep the zoom and start at the
   *  top-left (next page) or bottom-right (previous page); otherwise (jumps, first open) fit the page. */
  setPage(pageW: number, pageH: number) {
    this.pageW = pageW
    this.pageH = pageH
    const carry = this.carry
    this.carry = null
    this.rubber = 0
    this.overscroll = 0
    this.scale = carry ? carry.scale : 1
    if (carry) this.x = this.y = carry.dir > 0 ? 0 : -1e9 // clamp() snaps to the page edge
    this.layout()
    if (!carry && this.fitWidth && this.vw / this.fitW > 1.05) {
      this.scale = this.vw / this.fitW
      this.x = 0
      this.y = 0
      this.clamp()
      this.apply()
    }
  }

  /** Zoom + centre of the visible area in content coordinates (0..1), independent of the screen size. */
  getView(): { zoom: number; cx: number; cy: number } {
    const cw = this.fitW * this.scale || 1
    const ch = this.fitH * this.scale || 1
    return { zoom: this.scale, cx: (this.vw / 2 - this.x) / cw, cy: (this.vh / 2 - this.y) / ch }
  }

  setView(v: { zoom: number; cx: number; cy: number }) {
    this.scale = Math.min(MAX_SCALE, Math.max(1, v.zoom))
    this.x = this.vw / 2 - v.cx * this.fitW * this.scale
    this.y = this.vh / 2 - v.cy * this.fitH * this.scale
    this.clamp()
    this.apply()
  }

  private layout() {
    const r = this.viewport.getBoundingClientRect()
    this.vw = r.width
    this.vh = r.height
    const k = Math.min(this.vw / this.pageW, this.vh / this.pageH)
    this.fitW = Math.round(this.pageW * k)
    this.fitH = Math.round(this.pageH * k)
    this.content.style.width = `${this.fitW}px`
    this.content.style.height = `${this.fitH}px`
    this.clamp()
    this.apply()
  }

  private clamp() {
    const cw = this.fitW * this.scale
    const ch = this.fitH * this.scale
    this.x = cw <= this.vw ? (this.vw - cw) / 2 : Math.min(0, Math.max(this.vw - cw, this.x))
    this.y = ch <= this.vh ? (this.vh - ch) / 2 : Math.min(0, Math.max(this.vh - ch, this.y))
  }

  private apply() {
    this.content.style.transform = `translate3d(${this.x + this.rubber}px, ${this.y}px, 0) scale(${this.scale})`
  }

  private schedule() {
    if (this.raf) return
    this.raf = requestAnimationFrame(() => {
      this.raf = 0
      this.apply()
    })
  }

  private local(e: PointerEvent): Pt {
    const r = this.viewport.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private onDown = (e: PointerEvent) => {
    if (this.opts.isSelecting()) return
    cancelAnimationFrame(this.inertiaRaf)
    this.pointers.set(e.pointerId, this.local(e))
    if (this.pointers.size === 1) {
      this.start = { p: this.local(e), t: performance.now(), x: this.x, y: this.y }
      this.moved = false
      this.wasPinch = false
      this.lastMove = { p: this.local(e), t: performance.now() }
      this.vel = { x: 0, y: 0 }
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()]
      this.pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y), scale: this.scale,
        mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, x: this.x, y: this.y,
      }
      this.wasPinch = true
      this.moved = true
    }
  }

  private onMove = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return
    const p = this.local(e)
    this.pointers.set(e.pointerId, p)
    if (this.pointers.size >= 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
      const s = Math.min(MAX_SCALE, Math.max(1, (this.pinch.scale * dist) / this.pinch.dist))
      // keep the content point that was under the initial midpoint under the current midpoint
      const cx = (this.pinch.mid.x - this.pinch.x) / this.pinch.scale
      const cy = (this.pinch.mid.y - this.pinch.y) / this.pinch.scale
      this.scale = s
      this.x = mid.x - cx * s
      this.y = mid.y - cy * s
      this.clamp()
      this.schedule()
      return
    }
    if (!this.start || this.wasPinch) return
    const dx = p.x - this.start.p.x
    const dy = p.y - this.start.p.y
    if (!this.moved && Math.hypot(dx, dy) > TAP_SLOP) this.moved = true
    if (!this.moved) return
    const now = performance.now()
    if (this.lastMove) {
      const dt = Math.max(1, now - this.lastMove.t)
      this.vel = { x: (p.x - this.lastMove.p.x) / dt, y: (p.y - this.lastMove.p.y) / dt }
    }
    this.lastMove = { p, t: now }
    if (this.scale > 1.01) {
      const wantX = this.start.x + dx
      this.x = wantX
      this.y = this.start.y + dy
      this.clamp()
      // dragging past the left/right edge of the zoomed page: rubber band, turn on release
      this.overscroll = wantX - this.x
      this.rubber = Math.sign(this.overscroll) * Math.min(Math.abs(this.overscroll) * 0.4, RUBBER_MAX)
    } else {
      this.clamp()
      this.x += dx // page follows the finger horizontally
    }
    this.schedule()
  }

  private onUp = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return
    const p = this.local(e)
    this.pointers.delete(e.pointerId)
    if (this.pointers.size === 1) {
      // pinch → one finger left: restart single-finger tracking to avoid a jump
      const [q] = [...this.pointers.values()]
      this.start = { p: q, t: performance.now(), x: this.x, y: this.y }
      this.pinch = null
      return
    }
    if (this.pointers.size > 0) return
    this.pinch = null
    const start = this.start
    this.start = null
    if (!start) return

    if (this.wasPinch) {
      this.opts.onZoomSettled?.(this.scale)
      this.opts.onViewChange?.()
      return
    }
    const dx = p.x - start.p.x
    const dt = performance.now() - start.t
    if (!this.moved && dt < 400) {
      this.tap(p)
      return
    }
    if (this.scale > 1.01) {
      const over = this.overscroll
      this.releaseRubber()
      if (Math.abs(over) > OVERSCROLL_TURN) this.turn(over < 0 ? 1 : -1)
      else this.inertia()
      return
    }
    // swipe
    const fast = Math.abs(this.vel.x) > 0.5
    this.clamp()
    this.schedule()
    if (Math.abs(dx) > SWIPE_MIN || (fast && Math.abs(dx) > TAP_SLOP)) this.turn(dx < 0 ? 1 : -1)
  }

  private releaseRubber() {
    this.overscroll = 0
    if (!this.rubber) return
    this.rubber = 0
    this.content.style.transition = 'transform 150ms ease-out'
    this.apply()
    window.setTimeout(() => { this.content.style.transition = '' }, 160)
  }

  /** Turn (gesture or button); when zoomed, the next page keeps the zoom (see setPage). */
  turn(dir: -1 | 1) {
    this.carry = this.scale > 1.01 ? { scale: this.scale, dir } : null
    this.opts.onTurn(dir)
  }

  private onCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId)
    if (this.pointers.size === 0) {
      this.start = null
      this.pinch = null
      this.releaseRubber()
      this.clamp()
      this.schedule()
    }
  }

  private tap(p: Pt) {
    // edge taps turn pages; zoomed, the edge strips are narrower to avoid accidental turns
    const edge = this.scale > 1.01 ? EDGE_ZOOMED : EDGE
    const zone = p.x < this.vw * edge ? 'left' : p.x > this.vw * (1 - edge) ? 'right' : 'center'
    if (zone !== 'center') {
      this.turn(zone === 'left' ? -1 : 1)
      return
    }
    const now = performance.now()
    if (this.lastTap && now - this.lastTap.t < DOUBLE_TAP_MS && Math.hypot(p.x - this.lastTap.p.x, p.y - this.lastTap.p.y) < 40) {
      window.clearTimeout(this.centerTapTimer)
      this.lastTap = null
      this.zoomAt(p, this.scale > 1.01 ? 1 : 2.5)
      return
    }
    this.lastTap = { t: now, p }
    window.clearTimeout(this.centerTapTimer)
    const r = this.viewport.getBoundingClientRect()
    const client = { x: p.x + r.left, y: p.y + r.top }
    this.centerTapTimer = window.setTimeout(() => this.opts.onCenterTap(client), DOUBLE_TAP_MS)
  }

  private zoomAt(p: Pt, s: number) {
    const cx = (p.x - this.x) / this.scale
    const cy = (p.y - this.y) / this.scale
    this.scale = s
    this.x = p.x - cx * s
    this.y = p.y - cy * s
    this.clamp()
    this.content.style.transition = 'transform 180ms ease-out'
    this.apply()
    window.setTimeout(() => {
      this.content.style.transition = ''
      this.opts.onZoomSettled?.(this.scale)
      this.opts.onViewChange?.()
    }, 190)
  }

  resetZoom() {
    this.scale = 1
    this.clamp()
    this.apply()
  }

  private inertia() {
    let { x: vx, y: vy } = this.vel
    let last = performance.now()
    const step = (t: number) => {
      const dt = t - last
      last = t
      vx *= Math.pow(0.95, dt / 16)
      vy *= Math.pow(0.95, dt / 16)
      if (Math.hypot(vx, vy) < 0.02) {
        this.opts.onViewChange?.()
        return
      }
      this.x += vx * dt
      this.y += vy * dt
      this.clamp()
      this.apply()
      this.inertiaRaf = requestAnimationFrame(step)
    }
    this.inertiaRaf = requestAnimationFrame(step)
  }
}
