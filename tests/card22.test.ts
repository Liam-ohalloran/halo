import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_FILE_BYTES, SHELF_MAX, badge, classifyText, formatSize, itemColour, itemMeta, pageOf, safeFileName, safeUrl, shelfProblem, tileName, type ShelfItem } from '../src/lib/shelf.ts'
import { DEFAULT_COUNTDOWNS, GAMES, daysUntil, nextTarget, parseTicks, weekOfYear, weekStrip, yearProgress } from '../src/lib/widgets.ts'
import { answerNext, answerPay, answerStudy, answerTasks, recentRuns, type TaskRun } from '../src/lib/claude.ts'

// Sat 21 Nov 2026, 3:48 pm Perth.
const NOW = new Date('2026-11-21T07:48:00Z')
const file = (name: string): ShelfItem => ({ id: name, kind: 'file', name, content: '', storage_path: `u/${name}`, size_bytes: 2_200_000, mime: null, created_at: '' })

test('shelf: badges, names, sizes', () => {
  assert.equal(badge(file('Chem summer work.pdf')), 'PDF')
  assert.equal(badge(file('README')), 'FILE')
  assert.equal(tileName(file('Chem summer work.pdf')), 'Chem summer work')
  assert.equal(tileName(file('README')), 'README')
  assert.equal(itemColour(file('a.pdf')), '#FF453A')
  assert.equal(itemColour(file('a.weird')), '#AEB6C2')
  assert.equal(formatSize(2.1 * 1024 * 1024), '2.1 MB')
  assert.equal(formatSize(840 * 1024), '840 KB')
  assert.equal(formatSize(500), '500 B')
  assert.equal(formatSize(null), '')
  assert.equal(itemMeta({ ...file('x'), kind: 'link', content: 'https://www.curtin.edu.au/study/' }), 'curtin.edu.au')
})

test('shelf: pasted text becomes a link only when it is just an address', () => {
  assert.deepEqual(classifyText('https://www.example.com/a'), { kind: 'link', name: 'example.com', content: 'https://www.example.com/a' })
  assert.equal(classifyText('see https://example.com later')?.kind, 'text')
  assert.equal(classifyText('javascript:alert(1)')?.kind, 'text')
  assert.equal(classifyText('   '), null)
  assert.equal(classifyText('first line\nsecond')?.name, 'first line')
  assert.equal(safeUrl('javascript:alert(1)'), null)
  assert.equal(safeUrl('data:text/html,hi'), null)
  assert.equal(safeUrl('https://a.b/c'), 'https://a.b/c')
})

test('shelf: file names are safe in a storage path and the limits hold', () => {
  assert.equal(safeFileName('../../etc/passwd'), '.._.._etc_passwd'.replace(/^\.+/, ''))
  assert.equal(safeFileName('a/b\\c.txt'), 'a_b_c.txt')
  assert.equal(safeFileName('...'), 'file')
  assert.equal(shelfProblem(SHELF_MAX), 'The Shelf is full. Remove something first.')
  assert.equal(shelfProblem(0, MAX_FILE_BYTES + 1), 'That file is over 20 MB.')
  assert.equal(shelfProblem(SHELF_MAX - 1, 10), null)
  assert.deepEqual(pageOf([1, 2], 0), [1, 2])
  assert.deepEqual(pageOf([1, 2, 3, 4, 5], 4), [5, 1, 2])
})

test('widgets: countdowns in Perth days, yearly ones roll over', () => {
  const [doom, bday, xmas] = DEFAULT_COUNTDOWNS.map((d) => ({ ...d }))
  assert.equal(daysUntil(doom, NOW), 27)
  assert.equal(daysUntil(bday, NOW), 13)
  assert.equal(daysUntil(xmas, NOW), 34)
  assert.equal(daysUntil({ target_date: '2026-11-21', yearly: false }, NOW), 0, 'today is zero')
  assert.equal(daysUntil({ target_date: '2026-11-20', yearly: false }, NOW), 0, 'never negative')
  assert.equal(nextTarget({ target_date: '2000-11-21', yearly: true }, NOW), '2026-11-21', 'today still counts')
  assert.equal(nextTarget({ target_date: '2000-03-02', yearly: true }, NOW), '2027-03-02', 'rolls to next year')
  // 1 am Sunday in Perth is still Saturday in UTC: the Perth date must win.
  assert.equal(daysUntil({ target_date: '2026-11-22', yearly: false }, new Date('2026-11-21T17:00:00Z')), 0)
})

test('widgets: year dots, week of the year, week strip', () => {
  const y = yearProgress(NOW)
  assert.equal(y.dots, 52)
  assert.equal(y.filled, 46)
  assert.ok(y.f > 0.88 && y.f < 0.9)
  assert.equal(weekOfYear(NOW), 47)
  const strip = weekStrip(NOW)
  assert.equal(strip.map((d) => d.day).join(','), '16,17,18,19,20,21,22')
  assert.deepEqual(strip.filter((d) => d.today).map((d) => d.letter + d.day), ['S21'])
})

test('widgets: game ticks survive bad data', () => {
  assert.deepEqual(parseTicks('[true,false,true]'), [true, false, true, false])
  assert.deepEqual(parseTicks('nonsense'), GAMES.map(() => false))
  assert.deepEqual(parseTicks(null), GAMES.map(() => false))
  assert.deepEqual(parseTicks('{"a":1}'), GAMES.map(() => false))
})

const run = (id: string, status: TaskRun['status'], min: number, detail = ''): TaskRun => ({ id, title: id, status, detail, created_at: new Date(NOW.getTime() - min * 60_000).toISOString(), finished_at: null })

test('claude: running tasks first, then newest, at most four', () => {
  const r = recentRuns([run('old', 'done', 500), run('new', 'done', 5), run('go', 'running', 100), run('bad', 'failed', 50), run('x', 'done', 300)])
  assert.deepEqual(r.map((x) => x.id), ['go', 'new', 'bad', 'x'])
})

test('claude: quick answers are plain sentences from the data', () => {
  assert.match(answerNext({ starts_at: '2026-11-21T22:30:00Z', title: 'SUNDAY PL 6-2' }, null, NOW), /SUNDAY PL 6-2, tomorrow at 6:30am/)
  assert.match(answerNext(null, { due_at: '2026-11-23T02:00:00Z', subject: 'Chemistry', title: 'Test' }, NOW), /Chemistry, Test, Monday at 10am/)
  assert.equal(answerNext(null, null, NOW), 'Nothing coming up. No shifts or tests booked.')
  assert.equal(answerPay({ hours: 0, gross: 0, net: 0 }), 'No shifts this week yet, so nothing earned.')
  assert.equal(answerPay({ hours: 15.5, gross: 321.82, net: 321.82 }), '$321.82 for 15.5 hours this week. About $321.82 after tax.')
  assert.equal(answerStudy(0, 120), 'No study logged today. The goal is 2h.')
  assert.match(answerStudy(90, 120), /30m to go/)
  assert.match(answerStudy(130, 120), /Goal reached/)
  assert.equal(answerTasks([]), 'No task runs yet.')
  assert.equal(answerTasks([run('Sync', 'failed', 3, 'Sign in expired')]), 'Sync failed. Sign in expired')
  for (const s of [answerNext(null, null, NOW), answerPay({ hours: 1, gross: 1, net: 1 })]) assert.doesNotMatch(s, /[;—]/)
})
