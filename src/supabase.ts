import type { AlertRow, Backend, Settings, Shift, StudySession, Test } from './types'
import { DEFAULT_SETTINGS } from './types'
import { supabase } from './lib/supabase'

// The client lives in lib/supabase.ts. Re-exported for the older draft views.
export { supabase }

const SHIFT_COLS = 'id,title,station,starts_at,ends_at,is_public_holiday'
const SESSION_COLS = 'id,subject,started_at,ended_at,minutes'

function must<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message)
  return res.data as T
}

export const supabaseBackend: Backend = {
  async nextShift(now) {
    const rows = must(
      await supabase
        .from('shifts')
        .select(SHIFT_COLS)
        .gt('ends_at', now.toISOString())
        .order('starts_at', { ascending: true })
        .limit(1),
    ) as Shift[]
    return rows[0] ?? null
  },

  async nextTest(now) {
    const rows = must(
      await supabase
        .from('tests')
        .select('id,subject,title,due_at')
        .gt('due_at', now.toISOString())
        .order('due_at', { ascending: true })
        .limit(1),
    ) as Test[]
    return rows[0] ?? null
  },

  async upcomingTests(now) {
    return must(
      await supabase
        .from('tests')
        .select('id,subject,title,due_at')
        .gt('due_at', now.toISOString())
        .order('due_at', { ascending: true })
        .limit(50),
    ) as Test[]
  },

  async testsBetween(from, to) {
    return must(
      await supabase
        .from('tests')
        .select('id,subject,title,due_at')
        .gte('due_at', from.toISOString())
        .lt('due_at', to.toISOString())
        .order('due_at', { ascending: true }),
    ) as Test[]
  },

  async shiftsBetween(from, to) {
    return must(
      await supabase
        .from('shifts')
        .select(SHIFT_COLS)
        .lt('starts_at', to.toISOString())
        .gt('ends_at', from.toISOString())
        .order('starts_at'),
    ) as Shift[]
  },

  async unreadAlerts() {
    return must(
      await supabase
        .from('alerts')
        .select('id,type,title,body,action_label,action_url,created_at,read_at')
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .limit(50),
    ) as AlertRow[]
  },

  async markAlertsRead(ids) {
    if (!ids.length) return
    const res = await supabase.from('alerts').update({ read_at: new Date().toISOString() }).in('id', ids).is('read_at', null)
    if (res.error) throw new Error(res.error.message)
  },

  onAlertsChange(cb) {
    // Row level security applies to the stream, so only this user's rows arrive.
    const ch = supabase.channel(`alerts-${Math.random().toString(36).slice(2)}`).on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => cb()).subscribe()
    return () => { void supabase.removeChannel(ch) }
  },

  async goals() {
    const rows = must(await supabase.from('goals').select('id,name,saved,target,colour').order('created_at')) as Record<string, unknown>[]
    return rows.map((r) => ({ id: String(r.id), name: String(r.name), saved: Number(r.saved), target: Number(r.target), colour: String(r.colour) }))
  },
  async saveGoal(g) {
    const body = { name: g.name, saved: g.saved, target: g.target, colour: g.colour }
    const res = g.id ? await supabase.from('goals').update(body).eq('id', g.id) : await supabase.from('goals').insert(body)
    if (res.error) throw new Error(res.error.message)
  },
  async deleteGoal(id) {
    const res = await supabase.from('goals').delete().eq('id', id)
    if (res.error) throw new Error(res.error.message)
  },
  async moneyItems() {
    const rows = must(await supabase.from('money_items').select('id,kind,name,amount,category,on_date').order('on_date', { ascending: false }).limit(300)) as Record<string, unknown>[]
    return rows.map((r) => ({ id: String(r.id), kind: r.kind as 'spend' | 'sub', name: String(r.name), amount: Number(r.amount), category: String(r.category), on_date: String(r.on_date) }))
  },
  async addMoneyItem(i) {
    const res = await supabase.from('money_items').insert({ kind: i.kind, name: i.name, amount: i.amount, category: i.category, on_date: i.on_date })
    if (res.error) throw new Error(res.error.message)
  },
  async deleteMoneyItem(id) {
    const res = await supabase.from('money_items').delete().eq('id', id)
    if (res.error) throw new Error(res.error.message)
  },
  async marks() {
    const rows = must(await supabase.from('marks').select('id,subject,assessment,score,out_of,weighting,date').order('date', { ascending: false }).limit(500)) as Record<string, unknown>[]
    return rows.map((r) => ({ id: String(r.id), subject: String(r.subject), assessment: String(r.assessment), score: Number(r.score), out_of: Number(r.out_of), weighting: r.weighting == null ? null : Number(r.weighting), date: String(r.date) }))
  },
  async addMark(m) {
    const res = await supabase.from('marks').insert({ subject: m.subject, assessment: m.assessment, score: m.score, out_of: m.out_of, weighting: m.weighting, date: m.date })
    if (res.error) throw new Error(res.error.message)
  },
  async deleteMark(id) {
    const res = await supabase.from('marks').delete().eq('id', id)
    if (res.error) throw new Error(res.error.message)
  },

  async settings() {
    const row = must(
      await supabase
        .from('settings')
        .select('weekday_rate,saturday_rate,sunday_multiplier,public_holiday_multiplier')
        .maybeSingle(),
    ) as Partial<Record<keyof Settings, number | string>> | null
    if (!row) return { ...DEFAULT_SETTINGS }
    return {
      weekday_rate: Number(row.weekday_rate ?? DEFAULT_SETTINGS.weekday_rate),
      saturday_rate: Number(row.saturday_rate ?? DEFAULT_SETTINGS.saturday_rate),
      sunday_multiplier: Number(row.sunday_multiplier ?? DEFAULT_SETTINGS.sunday_multiplier),
      public_holiday_multiplier: Number(
        row.public_holiday_multiplier ?? DEFAULT_SETTINGS.public_holiday_multiplier,
      ),
    }
  },

  async activeSession() {
    const rows = must(
      await supabase
        .from('study_sessions')
        .select(SESSION_COLS)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1),
    ) as StudySession[]
    return rows[0] ?? null
  },

  async sessionsSince(from) {
    return must(
      await supabase
        .from('study_sessions')
        .select(SESSION_COLS)
        .gte('started_at', from.toISOString())
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false }),
    ) as StudySession[]
  },

  async startSession(subject) {
    return must(
      await supabase
        .from('study_sessions')
        .insert({ subject, started_at: new Date().toISOString() })
        .select(SESSION_COLS)
        .single(),
    ) as StudySession
  },

  async stopSession(id, endedAt = new Date()) {
    return must(
      await supabase
        .from('study_sessions')
        .update({ ended_at: endedAt.toISOString() })
        .eq('id', id)
        .select(SESSION_COLS)
        .single(),
    ) as StudySession
  },

  async subjects() {
    const [tests, sessions] = await Promise.all([
      supabase.from('tests').select('subject').limit(200),
      supabase.from('study_sessions').select('subject').order('started_at', { ascending: false }).limit(200),
    ])
    const names = [...(must(tests) ?? []), ...(must(sessions) ?? [])].map((r) => (r as { subject: string }).subject)
    return [...new Set(names.filter(Boolean))]
  },

  onShiftsChange(cb, onStatus) {
    const ch = supabase
      .channel('halo-shifts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shifts' }, () => cb())
      .subscribe((status) => onStatus?.(status === 'SUBSCRIBED'))
    return () => void supabase.removeChannel(ch)
  },
}
