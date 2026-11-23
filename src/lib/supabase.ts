import { createClient } from '@supabase/supabase-js'
import { sessionStorageAdapter } from './session-store'

// Publishable key: safe in the browser. RLS (owner only) protects every table.
// Never put a secret or service role key here. Anything secret lives in an edge function.
export const SUPABASE_URL = 'https://brqrszaljxeduelpuyty.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_l4fAmC7JOhbHTd3sGsmX-w_DiAyDKe5'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  // Sessions last until Sign out. persistSession and autoRefreshToken stay on everywhere. The desktop app keeps the session
  // in the Windows Credential Manager (see session-store.ts), the web and phone in localStorage.
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: sessionStorageAdapter },
  realtime: { params: { eventsPerSecond: 2 } },
})

/** Supabase's storage key for the session, for checking whether one is stored. */
export const SESSION_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
