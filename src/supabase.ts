import { createClient } from '@supabase/supabase-js'
import type { Backend, Settings, Shift, StudySession, Test } from './types'
import { DEFAULT_SETTINGS } from './types'

// Publishable key: safe in the browser. RLS (owner only) protects every table.
// Never put a secret/service-role key here; anything secret belongs in an edge function.
const SUPABASE_URL = 'https://brqrszaljxeduelpuyty.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_l4fAmC7JOhbHTd3sGsmX-w_DiAyDKe5'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 2 } },
})

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

  async stopSession(id) {
    return must(
      await supabase
        .from('study_sessions')
        .update({ ended_at: new Date().toISOString() })
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
