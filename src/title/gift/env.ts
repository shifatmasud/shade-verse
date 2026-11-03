/**
 * Shade Verse title GIFT: the adapter between Shifat's portfolio gift (copied verbatim from surface-tension src/dom/gift/,
 * gl/post/stickerGL.ts, core/spring.ts, services/blurFade.ts) and this game. Only what the portfolio imported from its own
 * engine lives here: the browser/viewport flags, the budget-GPU test, a frozen-frame stand-in (the title is DOM, not a GL
 * scene) and the sound bus (the game's master, so the game's mute = the gift's mute). soundKit's tick + plip are copied
 * from the portfolio (services/soundKit.ts) as is.
 */
import { audio as game } from '../../audio/engine'

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
/** portfolio services/settings.ts `browser` (the two fields the gift reads) */
export const browser = {
  isMobile: /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua)),
  get reducedMotion() { return matchMedia('(prefers-reduced-motion: reduce)').matches },
}
/** portfolio core/viewport.ts (w, h + resize subscription) */
export const viewport = { get w() { return innerWidth }, get h() { return innerHeight } }
export function onViewport(fn: () => void) { addEventListener('resize', fn); return () => removeEventListener('resize', fn) }
/** portfolio gl/engine.ts + state/props.ts + services/scroll.ts: the title has no GL scene to grab or hold */
export const engine = { canvas: null as HTMLCanvasElement | null, warm: false, grab: null as null | ((c: HTMLCanvasElement) => void) }
export const props = { sceneHold: false }
export const scroll = { stop() { /* the title does not scroll */ }, start() { /* */ } }

/**
 * The title's frozen frame (the portfolio copies the GL frame the visitor is looking at): the title is SVG + two baked panel
 * images, so the still is drawn from them where they sit on screen (black, each panel image clipped to its tilted quad, the
 * comic frame's cream border). gift.ts blurs it once, exactly as it blurs the portfolio's frame.
 */
const imgs = new Map<string, HTMLImageElement>()
export function titleStill(): HTMLCanvasElement | null {
  const svg = document.querySelector('.sv-title svg, svg.sv-art, .sv-ct svg') as SVGSVGElement | null
  const groups = Array.from(document.querySelectorAll('g.sv-pg')) as SVGGElement[]
  if (!groups.length) return null
  const W = Math.max(64, Math.round(innerWidth / 2)), H = Math.max(64, Math.round(innerHeight / 2)), k = W / innerWidth
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const g = cv.getContext('2d')!; g.fillStyle = '#000'; g.fillRect(0, 0, W, H)
  let drew = 0
  for (const grp of groups) {
    const poly = grp.querySelector('polygon') as SVGPolygonElement | null, im = grp.querySelector('image') as SVGImageElement | null
    const m = poly?.getScreenCTM(); if (!poly || !im || !m) continue
    const pts = Array.from(poly.points).map((p) => new DOMPoint(p.x, p.y).matrixTransform(m))
    const href = im.href.baseVal
    let el = imgs.get(href); if (!el) { el = new Image(); el.src = href; imgs.set(href, el) }
    g.save(); g.scale(k, k)
    g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.closePath()
    g.fillStyle = '#0b0d1c'; g.fill()
    if (el.complete && el.naturalWidth) {
      g.save(); g.clip()
      const a = new DOMPoint(im.x.baseVal.value, im.y.baseVal.value).matrixTransform(m)
      const b = new DOMPoint(im.x.baseVal.value + im.width.baseVal.value, im.y.baseVal.value + im.height.baseVal.value).matrixTransform(m)
      const bw = b.x - a.x, bh = b.y - a.y, s = Math.max(bw / el.naturalWidth, bh / el.naturalHeight)   // xMidYMid slice
      const dw = el.naturalWidth * s, dh = el.naturalHeight * s
      g.drawImage(el, a.x + (bw - dw) / 2, a.y + (bh - dh) / 2, dw, dh); g.restore(); drew++
    }
    g.lineJoin = 'round'; g.strokeStyle = '#f4efe4'; g.lineWidth = 9 * Math.abs(m.a); g.stroke()
    g.restore()
  }
  void svg
  return drew ? cv : null
}
/** decode the panel images ahead (they are already on screen, so this is the browser cache) */
export function warmStill() { titleStill() }

// ---------- sound: the game's master (its limiter / soft clip), silent while the game is muted ----------
let rv: ConvolverNode | null = null
function room(ctx: AudioContext): AudioNode {
  if (rv && rv.context === ctx) return rv
  // a small soft room (the portfolio's audio.reverb), 1.4 s decaying noise
  const n = Math.round(ctx.sampleRate * 1.4), ir = ctx.createBuffer(2, n, ctx.sampleRate)
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3) }
  rv = ctx.createConvolver(); rv.buffer = ir; const w = ctx.createGain(); w.gain.value = 0.35; rv.connect(w); w.connect(game.master)
  return rv
}
/** portfolio services/audio.ts `audio` (ctx, enabled, master, reverb, tick, plip) over the game's engine */
export const audio = {
  get ctx(): AudioContext | null { return game.ctx },
  get enabled() { return !game.muted && !!game.ctx },
  get master(): AudioNode { return game.master },
  get reverb(): AudioNode { return room(game.ctx!) },
  tick() { if (this.enabled) K.tick(this.bus()) },
  plip(intensity = 0.5, pitch = 1) { if (this.enabled) K.plip(this.bus(), intensity, pitch) },
  bus(): Bus { return { ctx: game.ctx!, master: game.master, reverb: room(game.ctx!) } },
}

// ---------- portfolio services/soundKit.ts (verbatim: Bus, env, sine, out, plip, tick) ----------
interface Bus { ctx: BaseAudioContext; master: AudioNode; reverb: AudioNode }
const now = (b: Bus, at?: number) => (at ?? b.ctx.currentTime)
function env(g: GainNode, t: number, peak: number, a: number, r: number) {
  g.gain.setValueAtTime(0, t)
  g.gain.linearRampToValueAtTime(peak, t + Math.max(0.01, a))
  g.gain.setTargetAtTime(0, t + Math.max(0.01, a), r / 4)
}
function sine(b: Bus, t: number, hz: number, dur: number) {
  const o = b.ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(hz, t); o.start(t); o.stop(t + dur); return o
}
function out(b: Bus, n: AudioNode, wet = true) { n.connect(b.master); if (wet) n.connect(b.reverb) }
const K = {
  /** a droplet: a rounded sine "bloop" (12 ms rise, a short upward glide as water bubbles do), no sharp click */
  plip(b: Bus, intensity = 0.5, pitch = 1, at?: number) {
    const t = now(b, at), f = (520 + Math.random() * 260) * pitch
    const o = sine(b, t, f, 0.4); o.frequency.exponentialRampToValueAtTime(f * 1.45, t + 0.09)
    const g = b.ctx.createGain(); env(g, t, 0.05 * intensity, 0.012, 0.2)
    o.connect(g); out(b, g)
  },
  /** hover: a tiny round wooden "tok" (880 Hz sine, 10 ms rise, gone in 80 ms) */
  tick(b: Bus, at?: number) {
    const t = now(b, at), o = sine(b, t, 880, 0.15), g = b.ctx.createGain()
    o.frequency.exponentialRampToValueAtTime(820, t + 0.06)
    env(g, t, 0.015, 0.01, 0.07); o.connect(g); out(b, g, false)
  },
}
