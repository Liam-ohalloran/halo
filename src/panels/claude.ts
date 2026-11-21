import '../styles/tokens.css'
import '../styles/proto.css'
import './claude.css'
import type { Backend } from '../types'
import { MAX_RUNS, STATUS_COLOUR, answerNext, answerPay, answerStudy, answerTasks, recentRuns, type TaskRun } from '../lib/claude'
import { ago } from '../lib/alerts'
import { calcWeek, perthWeekStart } from '../lib/pay'
import { perthDate, perthDayStart } from '../lib/money'
import { DAILY_GOAL_MIN, todayMinutes } from '../lib/study'
import { pvRoot, reducedMotion, type PvRoot } from '../ui/charts'

// Claude tab (card 22), the glass family. The orb, an ask box, quick pills and the recent task runs.
// Quick pills answer from Halo's own data, with no network and no key. Free text goes to the ask-claude edge function,
// which holds the Anthropic key. Nothing secret is in this file. Built once, a task run changing only touches the list.

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const HELLO = 'Hey Liam. Ask me anything, or tap one of the pills below.'
const OFFLINE = "Claude isn't connected yet. The ask-claude function needs setting up."
const SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
const PILLS: [string, string, string][] = [['next', "What's next", '#FF8A1E'], ['pay', 'Pay', '#5CFF7A'], ['study', 'Study', '#BF5AF2'], ['tasks', 'Tasks', '#3D9BFF']]

const TEMPLATE = `<div class="clG">
  <div class="orbStage pop" style="--i:0" data-k="orb" role="button" tabindex="0" aria-label="Ask Claude">
    <div class="orbit"></div><div class="lum"><i class="b b1"></i><i class="b b2"></i><i class="b b3"></i><i class="shade"></i><i class="spec"></i><i class="rim"></i></div>
    <svg class="ribbons" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0 20 Q25 6 50 20 T100 20 T150 20 T200 20" stroke="#3dd6ff"/><path d="M0 20 Q25 34 50 20 T100 20 T150 20 T200 20" stroke="#ff6ad5"/><path d="M0 20 Q25 12 50 20 T100 20 T150 20 T200 20" stroke="#ffffff"/></svg>
    <div class="lbl" data-k="state">CLAUDE · READY</div>
  </div>
  <div class="clR">
    <div class="glassAns pop" style="--i:1">
      <div class="gh"><span class="caps" data-k="cap">Ask anything</span><div class="toggle" data-k="view" role="group" aria-label="View"><button type="button" data-v="ask" class="on" aria-pressed="true">ASK</button><button type="button" data-v="tasks" aria-pressed="false">TASKS</button></div></div>
      <div class="vAsk" data-k="askView"><div class="ansT" data-k="ans" data-ellipsis aria-live="polite">${HELLO}</div>
        <form class="ask" data-k="form"><input data-k="in" type="text" maxlength="300" placeholder="Ask Claude" aria-label="Ask Claude" autocomplete="off"><button type="submit" aria-label="Send" data-k="send">${SEND}</button></form></div>
      <div class="vTasks" data-k="tasksView" hidden><div class="runs" data-k="runs"></div></div>
    </div>
    <div class="gpills">${PILLS.map(([k, l, c], i) => `<button type="button" class="gp pop" style="--i:${i + 2};--c:${c}" data-q="${k}">${l}</button>`).join('')}</div>
  </div>
</div>`

export interface ClaudePanelHandle extends PvRoot { destroy(): void }

export function ClaudePanel(api: Backend, clock: () => Date = () => new Date()): ClaudePanelHandle {
  const root = pvRoot('claude-pv') as ClaudePanelHandle
  root.insertAdjacentHTML('beforeend', TEMPLATE)
  root.setAttribute('aria-label', 'Claude')
  const $ = <T extends HTMLElement = HTMLElement>(k: string) => root.querySelector<T>(`[data-k="${k}"]`)!
  const input = $<HTMLInputElement>('in'), ans = $('ans'), stage = $('orb')
  let alive = true
  let runs: TaskRun[] = []
  let runsOk: 'loading' | 'ok' | 'error' = 'loading'
  let typer = 0
  let busy = false
  let seq = 0

  // ---- The answer. Typed out a couple of letters at a time, all at once under reduced motion.
  function say(text: string, cap = 'Claude') {
    clearInterval(typer)
    $('cap').textContent = cap
    if (reducedMotion()) { ans.textContent = text; return }
    let n = 0
    ans.textContent = ''
    typer = window.setInterval(() => {
      n = Math.min(text.length, n + 2)
      ans.textContent = text.slice(0, n)
      if (n >= text.length) clearInterval(typer)
    }, 16)
  }
  function think(on: boolean) {
    busy = on
    stage.classList.toggle('thinking', on)
    $('state').textContent = on ? 'CLAUDE · THINKING' : 'CLAUDE · READY'
    $<HTMLButtonElement>('send').disabled = on
    root.querySelectorAll<HTMLButtonElement>('.gp').forEach((b) => { b.disabled = on })
  }
  function setView(v: 'ask' | 'tasks') {
    $('askView').hidden = v !== 'ask'
    $('tasksView').hidden = v !== 'tasks'
    $('cap').textContent = v === 'ask' ? 'Ask anything' : 'Recent tasks'
    $('view').querySelectorAll<HTMLElement>('button').forEach((b) => { const on = b.dataset.v === v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)) })
    if (v === 'tasks') void loadRuns()
  }

  // ---- Quick answers, straight from Halo's own data.
  async function quick(k: string) {
    if (busy) return
    setView('ask')
    think(true)
    try {
      const now = clock()
      let text = ''
      if (k === 'next') text = answerNext(await api.nextShift(now), await api.nextTest(now), now)
      else if (k === 'pay') {
        const ws = perthWeekStart(now)
        const [s, sh] = await Promise.all([api.settings(), api.shiftsBetween(ws, new Date(ws.getTime() + 7 * 864e5))])
        text = answerPay(calcWeek(sh, ws, s))
      } else if (k === 'study') {
        const sessions = await api.sessionsSince(perthDayStart(perthDate(now)))
        text = answerStudy(todayMinutes(sessions, now), DAILY_GOAL_MIN)
      } else { await loadRuns(); text = answerTasks(runs) }
      await new Promise((r) => setTimeout(r, reducedMotion() ? 0 : 350))
      if (alive) say(text, PILLS.find((p) => p[0] === k)![1])
    } catch {
      if (alive) say(navigator.onLine ? 'Something went wrong. Try again.' : "You're offline. Reconnect and try again.")
    } finally { if (alive) think(false) }
  }

  async function ask(text: string) {
    if (busy) return
    think(true)
    $('cap').textContent = '● Thinking'
    try {
      const answer = await Promise.race([api.askClaude(text), new Promise<string>((_, rej) => setTimeout(() => rej(new Error('slow')), 25_000))])
      if (alive) say(answer.trim().slice(0, 600), 'Claude')
    } catch (e) {
      if (alive) say(!navigator.onLine ? "You're offline. Reconnect and try again." : (e as Error).message === 'slow' ? 'That took too long. Try again.' : OFFLINE, 'Claude')
    } finally { if (alive) think(false) }
  }

  // ---- Task runs. Only the list is rewritten, and only when it changed.
  let shownRuns = ''
  function paintRuns() {
    const now = clock()
    const list = recentRuns(runs)
    const html = runsOk === 'error' && !runs.length
      ? '<div class="note">Couldn\'t load your tasks. Try again in a moment.</div>'
      : list.length
        ? list.map((r) => `<div class="run" data-id="${esc(r.id)}"><i class="st ${r.status}" style="background:${STATUS_COLOUR[r.status]}" role="img" aria-label="${r.status}"></i><div class="rt"><b data-ellipsis>${esc(r.title)}</b>${r.detail ? `<span data-ellipsis>${esc(r.detail)}</span>` : ''}</div><span class="w" data-w>${ago(now, r.created_at)}</span></div>`).join('')
        : runsOk === 'loading' ? '<div class="skel"></div><div class="skel"></div><div class="skel"></div>' : '<div class="note">No task runs yet. Scheduled tasks show up here when they finish.</div>'
    if (html !== shownRuns) { shownRuns = html; $('runs').innerHTML = html }
  }
  async function loadRuns() {
    const my = ++seq
    try {
      const r = await api.taskRuns()
      if (!alive || my !== seq) return
      runs = r; runsOk = 'ok'
    } catch { if (!alive || my !== seq) return; runsOk = 'error' }
    paintRuns()
  }

  root.addEventListener('click', (e) => {
    const t = e.target as HTMLElement
    const q = t.closest<HTMLElement>('[data-q]')
    if (q) return void quick(q.dataset.q!)
    const v = t.closest<HTMLElement>('[data-v]')
    if (v) return setView(v.dataset.v as 'ask' | 'tasks')
    if (t.closest('[data-k="orb"]')) { setView('ask'); input.focus() }
  })
  stage.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setView('ask'); input.focus() } })
  $('form').addEventListener('submit', (e) => {
    e.preventDefault()
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    void ask(text)
  })
  input.addEventListener('keydown', (e) => e.stopPropagation()) // arrow keys move the caret here, they don't change tab

  const off = api.onTaskRunsChange(() => void loadRuns())
  const tick = window.setInterval(() => { if (alive && !document.hidden && runsOk === 'ok') paintRuns() }, 30_000)
  const baseEnter = root.enter
  root.enter = () => { baseEnter(); void loadRuns() }
  paintRuns()
  root.destroy = () => { alive = false; clearInterval(typer); clearInterval(tick); off() }
  return root
}

void MAX_RUNS
