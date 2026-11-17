import { createClient } from '@supabase/supabase-js'

// Publishable key: safe in the browser. RLS (owner only) protects every table.
// Never put a secret or service role key here. Anything secret lives in an edge function.
export const SUPABASE_URL = 'https://brqrszaljxeduelpuyty.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_l4fAmC7JOhbHTd3sGsmX-w_DiAyDKe5'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: { params: { eventsPerSecond: 2 } },
})
