import { h, hexToRgb } from './dom'
import { addTicker, motion, reduced } from '../lib/motion'

// LightSpill: the island's signature glow (HALO.md 3.1b), drawn by one fragment shader.
//  - Three stacked exponential falloffs from the island edge: tight 26 px, medium 110 px, wide 300 px,
//    added together and tone mapped (1 - e^-x) so it never clips.
//  - Colour comes from the content. Pass two colours to split left and right (live game).
//  - A slow breathing pulse of about 14% brightness over 4 s. Music pulses faster.
//  - flare() adds one bright pulse that decays, used when an alert lands.
//  - Pauses when the tab is hidden or the canvas is off screen. Static glow under Reduce motion.
// Place it behind the island: it fills its positioned parent and ignores the pointer.

export interface SpillShape { /** Island centre x in css px. */ cx: number; w: number; h: number; r: number }
export interface LightSpillOptions {
  colours?: [string, string]
  pulse?: 'slow' | 'music'
  /** Force a static glow (battery saver). Reduce motion forces it too. */
  static?: boolean
}
export interface LightSpillHandle extends HTMLCanvasElement {
  setShape(s: SpillShape): void
  setColours(a: string, b?: string): void
  setPulse(p: 'slow' | 'music'): void
  setStatic(on: boolean): void
  flare(): void
}

const VERT = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }'
const FRAG = `
precision highp float;
uniform vec2 uRes;      // backing store size in px
uniform float uScale;   // backing px per css px
uniform vec4 uShape;    // centre x, width, height, bottom radius (css px)
uniform vec3 uColA;
uniform vec3 uColB;
uniform float uGain;    // breathing and flare brightness
// Signed distance to the island: flat top that runs off the screen edge, rounded bottom corners.
float sdIsland(vec2 p) {
  vec2 c = vec2(uShape.x, (uShape.z - 1000.0) * 0.5);
  vec2 b = vec2(uShape.y * 0.5, (uShape.z + 1000.0) * 0.5);
  vec2 q = p - c;
  float r = q.y > 0.0 ? uShape.w : 0.0;
  vec2 d = abs(q) - b + r;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale;
  float sd = sdIsland(p);
  float d = max(sd, 0.0);
  float g = 0.36 * exp(-d / 26.0) + 0.17 * exp(-d / 110.0) + 0.07 * exp(-d / 300.0);
  // Inside the island the glow eases to nothing instead of holding a flat plateau, so if the black body
  // and the glow are ever a pixel or two apart mid morph, the result is a soft gradient, never a hard edge.
  g *= smoothstep(-22.0, 0.0, sd);
  g *= uGain;
  float a = 1.0 - exp(-g * 1.1);
  float t = smoothstep(-0.18, 0.18, (p.x - uShape.x) / max(uShape.y, 1.0));
  vec3 col = mix(uColA, uColB, t);
  float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  a = max(a + n / 255.0, 0.0);
  gl_FragColor = vec4(col * a, a);
}`

const RES = 0.5 // render at half resolution, the glow is soft

export function LightSpill(o: LightSpillOptions = {}): LightSpillHandle {
  const canvas = h('canvas', { class: 'h-spill', 'aria-hidden': 'true' }) as LightSpillHandle
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'low-power' })

  let shape: SpillShape = { cx: 0, w: 200, h: 34, r: 17 }
  let a = hexToRgb(o.colours?.[0] ?? '#FF9F0A')
  let b = hexToRgb(o.colours?.[1] ?? o.colours?.[0] ?? '#FF9F0A')
  let pulse: 'slow' | 'music' = o.pulse ?? 'slow'
  let forceStatic = !!o.static
  let flareV = 0
  let t = 0
  let dirty = true
  let onScreen = true
  let running = false

  // CSS fallback if WebGL is unavailable: the same three falloffs as box shadows.
  const fallback = gl ? null : h('div', { class: 'h-spill-fallback' })
  if (fallback) canvas.append(fallback)

  let uRes: WebGLUniformLocation | null = null
  let uScale: WebGLUniformLocation | null = null
  let uShape: WebGLUniformLocation | null = null
  let uColA: WebGLUniformLocation | null = null
  let uColB: WebGLUniformLocation | null = null
  let uGain: WebGLUniformLocation | null = null
  if (gl) {
    const compile = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG))
    gl.linkProgram(prog)
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    uRes = gl.getUniformLocation(prog, 'uRes'); uScale = gl.getUniformLocation(prog, 'uScale'); uShape = gl.getUniformLocation(prog, 'uShape')
    uColA = gl.getUniformLocation(prog, 'uColA'); uColB = gl.getUniformLocation(prog, 'uColB'); uGain = gl.getUniformLocation(prog, 'uGain')
    gl.clearColor(0, 0, 0, 0)
  }

  const isStatic = () => forceStatic || reduced()
  const period = () => (pulse === 'music' ? 0.8 : 4)

  function gain(): number {
    // Breathing is +/- 14% around 1. Music pulses faster, roughly with the beat.
    const breath = isStatic() ? 1 : 1 + 0.14 * Math.sin((t / period()) * Math.PI * 2)
    return breath + flareV * 0.9
  }

  function resize() {
    const w = Math.max(1, Math.round(canvas.clientWidth * RES))
    const hh = Math.max(1, Math.round(canvas.clientHeight * RES))
    if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; dirty = true }
  }

  function draw() {
    resize()
    const g = gain()
    if (fallback) {
      const k = Math.min(1.4, g)
      const [r1, g1, b1] = a.map((v) => Math.round(v * 255))
      fallback.style.cssText = `position:absolute;left:${shape.cx - shape.w / 2}px;top:0;width:${shape.w}px;height:${shape.h}px;border-radius:0 0 ${shape.r}px ${shape.r}px;box-shadow:0 0 26px rgba(${r1},${g1},${b1},${0.38 * k}),0 0 110px rgba(${r1},${g1},${b1},${0.22 * k}),0 0 300px rgba(${r1},${g1},${b1},${0.14 * k})`
      return
    }
    if (!gl) return
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.uniform2f(uRes, canvas.width, canvas.height)
    gl.uniform1f(uScale, RES)
    gl.uniform4f(uShape, shape.cx, shape.w, shape.h, shape.r)
    gl.uniform3f(uColA, a[0], a[1], a[2])
    gl.uniform3f(uColB, b[0], b[1], b[2])
    gl.uniform1f(uGain, g)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    dirty = false
  }

  function tick(dt: number): boolean {
    if (document.hidden || !onScreen) { running = false; return false } // pause when hidden
    t += dt
    if (flareV > 0) flareV = Math.max(0, flareV - dt / 0.7)
    if (dirty || !isStatic() || flareV > 0) draw()
    if (isStatic() && !dirty && flareV === 0) { running = false; return false }
    return true
  }
  function wake() {
    if (running || document.hidden || !onScreen) return
    running = true
    addTicker(tick)
  }

  // The island calls this every frame with its live spring values. Draw straight away so the glow is
  // never a frame behind the body (a stale frame is what showed as a hard amber rectangle mid open).
  canvas.setShape = (s) => {
    shape = s
    dirty = true
    if (document.hidden || !onScreen) return
    draw()
    wake()
  }
  canvas.setColours = (c1, c2) => { a = hexToRgb(c1); b = hexToRgb(c2 ?? c1); dirty = true; wake() }
  canvas.setPulse = (p) => { pulse = p }
  canvas.setStatic = (on) => { forceStatic = on; dirty = true; wake() }
  canvas.flare = () => { if (!isStatic()) flareV = 1; else flareV = 0.5; wake() }

  new IntersectionObserver((e) => { onScreen = e[e.length - 1].isIntersecting; if (onScreen) { dirty = true; wake() } }).observe(canvas)
  new ResizeObserver(() => { dirty = true; wake() }).observe(canvas)
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { dirty = true; wake() } })
  if (motion.paused) dirty = true
  return canvas
}
