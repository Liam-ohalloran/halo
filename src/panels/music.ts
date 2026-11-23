import '../styles/tokens.css'
import '../styles/proto.css'
import './music.css'
import { pvRoot, type PvRoot } from '../ui/charts'
import { getArtUrl, getMedia, getVolume, helperToken, mediaControl, seekMedia, setVolume, type Media } from '../lib/helper'
import { fmtTime, fraction, livePosition, musicView, wavePath, type MusicView } from '../lib/music'
import { FALLBACK, accentsFromUrl } from '../lib/palette'

// Music tab (card 24), glass family. Whatever Windows is playing (Spotify first, but YouTube in Chrome shows too): the real cover,
// tinted by two colours taken from it, title, artist, a wave that ripples up to the playhead, previous, play or pause, next and
// the volume. Built once, a change only touches what changed. When the helper is off, or nothing is playing, a plain state.
// Windows' media controls do not tell an app about shuffle, likes or the queue, so Halo does not pretend to have them.

const SPOT = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#1ED760"/><path d="M6.5 9.3c3.7-1.1 7.9-.8 11.2 1M7.2 12.4c3-.8 6.3-.5 9 .9M7.8 15.3c2.4-.6 4.9-.4 7 .7" fill="none" stroke="#000" stroke-width="1.6" stroke-linecap="round"/></svg>'
const NOTE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>'
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4v16l13-8z"/></svg>'
const PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>'
const VOL = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'

const TEMPLATE = `<div class="muBg" aria-hidden="true"><i data-k="bg"></i></div>
<div class="muG" data-k="song" hidden>
  <div class="muArt pop" style="--i:0" data-k="art"><span class="src" data-k="src"></span></div>
  <div class="muInfo">
    <div class="pop" style="--i:1"><span class="caps" data-k="state">Now playing</span><h2 data-k="title"></h2><p data-k="sub"></p></div>
    <div class="muWave pop" style="--i:2"><svg viewBox="0 0 300 18" preserveAspectRatio="none" role="slider" tabindex="0" aria-label="Song position" aria-valuemin="0" aria-valuemax="100" data-k="seek"><path d="M0 9 L300 9" stroke="rgba(255,255,255,.22)" stroke-width="3" stroke-linecap="round"/><path data-k="wave" d="M0 9 L300 9" fill="none" stroke="var(--a1,#ff2fa3)" stroke-width="3" stroke-linecap="round" style="filter:drop-shadow(0 0 4px var(--a1,#ff2fa3))"/><circle data-k="knob" cx="0" cy="9" r="5" fill="#fff"/></svg><div class="tm"><span data-k="el">0:00</span><span data-k="left">0:00</span></div></div>
    <div class="muCtl pop" style="--i:3">
      <button type="button" data-m="prev" aria-label="Previous song"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg></button>
      <button type="button" class="big" data-m="play" aria-label="Pause"></button>
      <button type="button" data-m="next" aria-label="Next song"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg></button>
      <label class="muVol" title="Volume">${VOL}<input type="range" min="0" max="100" step="1" data-k="vol" aria-label="Volume"><b class="num" data-k="volN">0</b></label>
    </div>
  </div>
</div>
<div class="muState" data-k="plain" role="status" hidden><span class="ico" aria-hidden="true">${NOTE}</span><b data-k="pt"></b><span data-k="ps"></span><button type="button" data-k="retry">Try again</button></div>`

export interface MusicPanelHandle extends PvRoot { destroy(): void }

export function MusicPanel(): MusicPanelHandle {
  const root = pvRoot('music-pv') as MusicPanelHandle
  root.insertAdjacentHTML('beforeend', TEMPLATE)
  root.setAttribute('aria-label', 'Music')
  const $ = <T extends HTMLElement | SVGElement = HTMLElement>(k: string) => root.querySelector<T>(`[data-k="${k}"]`)!
  const shown: Record<string, string> = {}
  const text = (k: string, v: string) => { if (shown[k] !== v) { shown[k] = v; $(k).textContent = v } }

  let alive = true
  let view: MusicView = { kind: 'off' }
  let reportedAt = 0
  let pos = 0
  let dur = 0
  let playing = false
  let artFor = ''
  let artUrl: string | null = null
  let draggingVol = 0
  let timer = 0
  let tick = 0

  const onScreen = () => alive && !document.hidden && root.isConnected && root.offsetParent !== null && !root.classList.contains('h-off')

  function plain(title: string, sub: string, retry: boolean) {
    $('song').hidden = true
    $('plain').hidden = false
    text('pt', title); text('ps', sub)
    $<HTMLButtonElement>('retry').hidden = !retry
    root.dataset.state = retry ? 'off' : 'idle'
  }

  function paintWave() {
    const live = livePosition(pos, dur, playing, Date.now() - reportedAt)
    const f = fraction(live, dur)
    const d = wavePath(f, playing)
    if (shown.wave !== d) { shown.wave = d; $('wave').setAttribute('d', d) }
    $('knob').setAttribute('cx', String(f * 300))
    $('seek').setAttribute('aria-valuenow', String(Math.round(f * 100)))
    text('el', fmtTime(live))
    text('left', dur > 0 ? `−${fmtTime(dur - live)}` : '')
  }

  async function setArt(m: Media) {
    const id = `${m.title}|${m.artist}`
    if (artFor === id) return
    artFor = id
    if (!m.has_art) { applyArt(null); return }
    const url = await getArtUrl()
    if (!alive || artFor !== id) { if (url) URL.revokeObjectURL(url); return }
    applyArt(url)
  }
  async function applyArt(url: string | null) {
    if (artUrl) URL.revokeObjectURL(artUrl)
    artUrl = url
    const img = url ? `url(${url})` : ''
    ;($('art')).style.backgroundImage = img
    ;($('bg')).style.backgroundImage = img
    root.classList.toggle('no-art', !url)
    const [a, b] = url ? await accentsFromUrl(url) : FALLBACK
    root.style.setProperty('--a1', a)
    root.style.setProperty('--a2', b)
  }

  function paint(m: Media | null) {
    view = musicView(m)
    root.dataset.state = view.kind
    if (view.kind === 'off') return plain(helperToken() ? 'Start Halo helper' : 'Open Halo on your laptop', 'Music shows here once Halo can see your laptop.', true)
    if (view.kind === 'idle') return plain('Nothing playing', 'Start a song in Spotify, or a video in Chrome, and it shows here.', false)
    $('song').hidden = false
    $('plain').hidden = true
    text('title', view.title)
    text('sub', [view.artist, view.album].filter(Boolean).join(' · '))
    text('state', `${view.source} · ${view.playing ? 'Now playing' : 'Paused'}`)
    $('src').innerHTML = /spotify/i.test(view.source) ? SPOT : NOTE
    const play = $<HTMLButtonElement>('song').querySelector<HTMLButtonElement>('[data-m="play"]')!
    const html = view.playing ? PAUSE : PLAY
    if (shown.play !== html) { shown.play = html; play.innerHTML = html; play.setAttribute('aria-label', view.playing ? 'Pause' : 'Play') }
    root.classList.toggle('paused', !view.playing)
    pos = view.pos; dur = view.dur; playing = view.playing; reportedAt = Date.now()
    paintWave()
    void setArt(m!)
  }

  async function refresh() {
    const m = await getMedia()
    if (!alive) return
    paint(m)
    if (!draggingVol && m) { const v = await getVolume(); if (v && alive && !draggingVol) { const el = $<HTMLInputElement>('vol'); el.value = String(v.level); text('volN', String(v.level)); el.style.setProperty('--p', `${v.level}%`) } }
  }
  function loop() {
    window.clearInterval(timer); window.clearInterval(tick)
    timer = window.setInterval(() => { if (onScreen()) void refresh() }, 1500)
    tick = window.setInterval(() => { if (onScreen() && view.kind === 'song') paintWave() }, 250)
  }

  // ---- Input. Pressing a button only changes that button, then the next report from the helper confirms it.
  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-m]')
    if (b) {
      const a = b.dataset.m as 'prev' | 'play' | 'next'
      if (a === 'play' && view.kind === 'song') { playing = !playing; reportedAt = Date.now(); view = { ...view, playing }; root.classList.toggle('paused', !playing); void mediaControl('toggle').then(refresh) }
      else if (a !== 'play') void mediaControl(a === 'prev' ? 'previous' : 'next').then(() => setTimeout(refresh, 400))
    }
    if ((e.target as HTMLElement).closest('[data-k="retry"]')) void refresh()
  })
  const seekTo = (clientX: number) => {
    if (view.kind !== 'song' || dur <= 0) return
    const r = $('seek').getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width))
    pos = f * dur; reportedAt = Date.now(); paintWave()
    void seekMedia(Math.round(pos))
  }
  $('seek').addEventListener('pointerdown', (e) => { seekTo((e as PointerEvent).clientX) })
  $('seek').addEventListener('keydown', (e) => {
    const k = (e as KeyboardEvent).key
    if (view.kind !== 'song' || (k !== 'ArrowLeft' && k !== 'ArrowRight')) return
    e.preventDefault(); e.stopPropagation()
    pos = Math.max(0, Math.min(dur, livePosition(pos, dur, playing, Date.now() - reportedAt) + (k === 'ArrowRight' ? 10 : -10)))
    reportedAt = Date.now(); paintWave(); void seekMedia(Math.round(pos))
  })
  const vol = $<HTMLInputElement>('vol')
  vol.addEventListener('input', () => { draggingVol = Date.now(); vol.style.setProperty('--p', `${vol.value}%`); text('volN', vol.value); void setVolume(Number(vol.value)); window.setTimeout(() => { if (Date.now() - draggingVol >= 900) draggingVol = 0 }, 1000) })

  root.onEnter = () => { void refresh() }
  paint(null)
  loop()
  void refresh()
  root.destroy = () => { alive = false; window.clearInterval(timer); window.clearInterval(tick); if (artUrl) URL.revokeObjectURL(artUrl) }
  return root
}
