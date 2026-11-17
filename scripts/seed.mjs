// Dev only. Inserts SAMPLE shifts, tests and settings for Liam's account so panels can be built
// before the TickTick sync exists.
//   npm run seed                 sign in with an emailed 6 digit code, then insert the rows
//   npm run seed -- --clear      delete the sample shifts and tests again
//   npm run seed -- --sql        print the same rows as SQL (no sign-in), to run in the Supabase SQL editor
// Sample rows are marked with a ticktick_id starting "sample:". Settings has no such column,
// so the script only creates a settings row when none exists and never removes it.
// No secret keys: the script signs in as Liam, so RLS applies as normal.
import { createClient } from '@supabase/supabase-js'
import { createInterface } from 'node:readline/promises'

const URL = 'https://brqrszaljxeduelpuyty.supabase.co'
const KEY = 'sb_publishable_l4fAmC7JOhbHTd3sGsmX-w_DiAyDKe5'
const PREFIX = 'sample:'
const clear = process.argv.includes('--clear')
const asSql = process.argv.includes('--sql')

// Perth is UTC+8 with no daylight saving. Days are counted from Monday of the current Perth week.
const HOUR = 3600000
const DAY = 86400000
const perthNow = new Date(Date.now() + 8 * HOUR)
const mondayUtc = Date.UTC(perthNow.getUTCFullYear(), perthNow.getUTCMonth(), perthNow.getUTCDate()) - ((perthNow.getUTCDay() + 6) % 7) * DAY
/** ISO time for a Perth clock time. week 0 = this week, 1 = next. weekday 0 = Monday ... 6 = Sunday. */
const at = (week, weekday, h, m = 0) => new Date(mondayUtc + (week * 7 + weekday) * DAY + (h * 60 + m) * 60000 - 8 * HOUR).toISOString()

// Real station codes only: GC, PI, PL, PA. Each title names the weekday it falls on.
const shifts = [
  { n: 'w0-thu', week: 0, wd: 3, title: 'SAMPLE THURSDAY PI 4-8', station: 'PI', s: [16, 0], e: [20, 0] },
  { n: 'w0-sat', week: 0, wd: 5, title: 'SAMPLE SATURDAY PA 5:30-9', station: 'PA', s: [17, 30], e: [21, 0] },
  { n: 'w0-sun', week: 0, wd: 6, title: 'SAMPLE SUNDAY GC 10-4', station: 'GC', s: [10, 0], e: [16, 0] },
  { n: 'w1-tue', week: 1, wd: 1, title: 'SAMPLE TUESDAY PL 4-8', station: 'PL', s: [16, 0], e: [20, 0] },
  { n: 'w1-fri', week: 1, wd: 4, title: 'SAMPLE FRIDAY PI 5-9', station: 'PI', s: [17, 0], e: [21, 0] },
  { n: 'w1-sat', week: 1, wd: 5, title: 'SAMPLE SATURDAY PA 5:30-9', station: 'PA', s: [17, 30], e: [21, 0], holiday: true },
].map((x) => ({
  title: x.title, station: x.station, ticktick_id: `${PREFIX}shift-${x.n}`, is_public_holiday: Boolean(x.holiday),
  starts_at: at(x.week, x.wd, ...x.s), ends_at: at(x.week, x.wd, ...x.e),
}))

const tests = [
  { n: 'chem', subject: 'Chemistry', title: 'SAMPLE Chemistry unit test', week: 1, wd: 0, h: 9 },
  { n: 'meth', subject: 'Methods', title: 'SAMPLE Methods calculus test', week: 1, wd: 4, h: 9 },
  { n: 'hb', subject: 'Human Biology', title: 'SAMPLE Human Biology assessment', week: 2, wd: 0, h: 11 },
].map((x) => ({ subject: x.subject, title: x.title, ticktick_id: `${PREFIX}test-${x.n}`, due_at: at(x.week, x.wd, x.h) }))

if (asSql) {
  const q = (v) => `'${String(v).replace(/'/g, "''")}'`
  const owner = '(select id from auth.users limit 1)'
  const rows = shifts.map((s) => `(${owner}, ${q(s.title)}, ${q(s.station)}, ${q(s.starts_at)}, ${q(s.ends_at)}, ${s.is_public_holiday}, ${q(s.ticktick_id)})`)
  const trows = tests.map((t) => `(${owner}, ${q(t.subject)}, ${q(t.title)}, ${q(t.due_at)}, ${q(t.ticktick_id)})`)
  console.log(`delete from shifts where ticktick_id like '${PREFIX}%';
delete from tests where ticktick_id like '${PREFIX}%';
insert into shifts (owner_id, title, station, starts_at, ends_at, is_public_holiday, ticktick_id) values
${rows.join(',\n')};
insert into tests (owner_id, subject, title, due_at, ticktick_id) values
${trows.join(',\n')};
insert into settings (owner_id) values (${owner}) on conflict do nothing;`)
  process.exit(0)
}

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

// Always clear old sample rows first so renamed samples never linger.
ok('shifts', await sb.from('shifts').delete().like('ticktick_id', `${PREFIX}%`))
ok('tests', await sb.from('tests').delete().like('ticktick_id', `${PREFIX}%`))
if (clear) {
  console.log('Removed sample shifts and tests.')
  process.exit(0)
}

ok('shifts', await sb.from('shifts').insert(shifts))
ok('tests', await sb.from('tests').insert(tests))

const existing = await sb.from('settings').select('owner_id').maybeSingle()
ok('settings', existing)
if (!existing.data) {
  ok('settings', await sb.from('settings').insert({ weekday_rate: 17.89, saturday_rate: 17.89, sunday_multiplier: 1.25, public_holiday_multiplier: 2 }))
}
console.log(`Seeded ${shifts.length} shifts, ${tests.length} tests${existing.data ? '' : ' and settings'}.`)
