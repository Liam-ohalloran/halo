// Dev only. Inserts SAMPLE shifts, tests and settings for Liam's account so panels can be built
// before the TickTick sync exists.   npm run seed            add sample rows
//                                     npm run seed -- --clear  delete them again
// Sample rows are marked with a ticktick_id starting "sample:". Settings has no such column,
// so the script only creates a settings row when none exists and never removes it.
// No secret keys: the script signs in as Liam with an emailed 6 digit code, so RLS applies as normal.
import { createClient } from '@supabase/supabase-js'
import { createInterface } from 'node:readline/promises'

const URL = 'https://brqrszaljxeduelpuyty.supabase.co'
const KEY = 'sb_publishable_l4fAmC7JOhbHTd3sGsmX-w_DiAyDKe5'
const PREFIX = 'sample:'
const clear = process.argv.includes('--clear')

const rl = createInterface({ input: process.stdin, output: process.stdout })
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

const email = (process.env.HALO_EMAIL || (await rl.question('Your Halo email: '))).trim()
const sent = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
if (sent.error) throw new Error(sent.error.message)
const code = (await rl.question('Enter the code from the email (the email must show a 6 digit code): ')).trim()
rl.close()
const ver = await sb.auth.verifyOtp({ email, token: code, type: 'email' })
if (ver.error) throw new Error(ver.error.message)

const ok = (label, { error }) => { if (error) throw new Error(`${label}: ${error.message}`) }

if (clear) {
  ok('shifts', await sb.from('shifts').delete().like('ticktick_id', `${PREFIX}%`))
  ok('tests', await sb.from('tests').delete().like('ticktick_id', `${PREFIX}%`))
  console.log('Removed sample shifts and tests.')
  process.exit(0)
}

// Perth is UTC+8 with no daylight saving. Build times as Perth clock times on given days.
const DAY = 86400000
const perthMidnight = (offsetDays) => {
  const p = new Date(Date.now() + 8 * 3600000)
  return Date.UTC(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate() + offsetDays) - 8 * 3600000
}
const at = (day, h, m = 0) => new Date(perthMidnight(day) + (h * 60 + m) * 60000).toISOString()

const shifts = [
  { n: 'sat', day: 0, title: 'SAMPLE SATURDAY PA 5:30-9', station: 'PA', s: [17, 30], e: [21, 0] },
  { n: 'sun', day: 1, title: 'SAMPLE SUNDAY KITCHEN 10-4', station: 'Kitchen', s: [10, 0], e: [16, 0] },
  { n: 'tue', day: 3, title: 'SAMPLE TUESDAY FRONT 4-8', station: 'Front counter', s: [16, 0], e: [20, 0] },
  { n: 'fri', day: 6, title: 'SAMPLE FRIDAY PA 5-9', station: 'PA', s: [17, 0], e: [21, 0] },
  { n: 'sat2', day: 7, title: 'SAMPLE SATURDAY PA 5:30-9', station: 'PA', s: [17, 30], e: [21, 0] },
].map((x) => ({
  title: x.title, station: x.station, ticktick_id: `${PREFIX}shift-${x.n}`, is_public_holiday: false,
  starts_at: at(x.day, ...x.s), ends_at: at(x.day, ...x.e),
}))

const tests = [
  { n: 'chem', subject: 'Chemistry', title: 'SAMPLE Chemistry unit test', day: 5, h: 9 },
  { n: 'meth', subject: 'Methods', title: 'SAMPLE Methods calculus test', day: 9, h: 9 },
  { n: 'hb', subject: 'Human Biology', title: 'SAMPLE Human Biology assessment', day: 12, h: 11 },
].map((x) => ({ subject: x.subject, title: x.title, ticktick_id: `${PREFIX}test-${x.n}`, due_at: at(x.day, x.h) }))

ok('shifts', await sb.from('shifts').upsert(shifts, { onConflict: 'ticktick_id' }))
ok('tests', await sb.from('tests').upsert(tests, { onConflict: 'ticktick_id' }))

const existing = await sb.from('settings').select('owner_id').maybeSingle()
ok('settings', existing)
if (!existing.data) {
  ok('settings', await sb.from('settings').insert({ weekday_rate: 17.89, saturday_rate: 17.89, sunday_multiplier: 1.25, public_holiday_multiplier: 2 }))
}
console.log(`Seeded ${shifts.length} shifts, ${tests.length} tests${existing.data ? '' : ' and settings'}.`)
