// Marks (card 21). The pure model for the Marks tab: one row per assessment Liam types in by hand (subject, assessment,
// score, out of, weighting, date). Nothing is scraped from SEQTA. The "ATAR ring" shows the overall average mark. Halo does
// not predict an ATAR: that needs scaling across the whole state, which a handful of school marks cannot give.

export interface Mark {
  id: string
  subject: string
  assessment: string
  score: number
  out_of: number
  /** Percent of the course this assessment is worth. Null or 0 counts every mark equally. */
  weighting: number | null
  /** yyyy-mm-dd */
  date: string
}

/** A mark as a percentage, 0 to 100 and a bit over for bonus marks. Zero when out_of is not a positive number. */
export const percent = (m: Pick<Mark, 'score' | 'out_of'>): number => (m.out_of > 0 ? (m.score / m.out_of) * 100 : 0)
const round1 = (n: number) => Math.round(n * 10) / 10

/** Weighted mean of percentages. Weights that are missing or zero count as 1, so unweighted marks average evenly. */
export function average(marks: readonly Mark[]): number | null {
  if (!marks.length) return null
  let sum = 0
  let w = 0
  for (const m of marks) {
    const wt = m.weighting && m.weighting > 0 ? m.weighting : 1
    sum += percent(m) * wt
    w += wt
  }
  return w ? round1(sum / w) : null
}

export interface SubjectStat {
  subject: string
  avg: number
  /** The last five marks as percentages, oldest first (the sparkline). */
  last: number[]
  count: number
  /** Latest mark minus the one before it, in percentage points. Null with only one mark. */
  delta: number | null
  colour: string
}

const SUBJECT_COLOURS: [RegExp, string][] = [
  [/chem/i, '#3D9BFF'], [/math|method/i, '#5CFF7A'], [/spec/i, '#BF5AF2'], [/bio/i, '#FF2FA3'], [/eng/i, '#FFC23D'], [/relig/i, '#AEB6C2'],
]
const FALLBACK_COLOURS = ['#3D9BFF', '#5CFF7A', '#BF5AF2', '#FF2FA3', '#FFC23D', '#FF8A1E']
export function subjectColour(subject: string): string {
  const hit = SUBJECT_COLOURS.find(([re]) => re.test(subject))
  if (hit) return hit[1]
  let n = 0
  for (const c of subject) n = (n * 31 + c.charCodeAt(0)) >>> 0
  return FALLBACK_COLOURS[n % FALLBACK_COLOURS.length]
}
/** The tile colour class from the prototype's family for a subject. */
export function subjectTile(subject: string): string {
  if (/chem/i.test(subject)) return 'blue'
  if (/math|method/i.test(subject)) return 'green'
  if (/spec/i.test(subject)) return 'purple'
  if (/bio/i.test(subject)) return 'mag'
  if (/eng/i.test(subject)) return 'gold'
  return 'dark'
}

const SHORT: [RegExp, string][] = [[/human\s*bio/i, 'Human Bio'], [/specialist/i, 'Specialist'], [/religion/i, 'Religion']]
/** A subject name that fits a one cell tile. */
export const shortSubject = (s: string): string => SHORT.find(([re]) => re.test(s))?.[1] ?? (s.length > 12 ? `${s.slice(0, 11).trimEnd()}.` : s)

/** The usual order of Liam's subjects, so the tiles do not jump around as marks come in. Anything else follows alphabetically. */
const ORDER = [/chem/i, /math|method/i, /spec/i, /bio/i, /eng/i, /relig/i]
const rank = (s: string) => { const i = ORDER.findIndex((re) => re.test(s)); return i < 0 ? 99 : i }

export function subjectStats(marks: readonly Mark[]): SubjectStat[] {
  const by = new Map<string, Mark[]>()
  for (const m of marks) by.set(m.subject, [...(by.get(m.subject) ?? []), m])
  const out: SubjectStat[] = []
  for (const [subject, list] of by) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    const last = sorted.slice(-5).map((m) => round1(percent(m)))
    const n = last.length
    out.push({ subject, avg: average(list) ?? 0, last, count: list.length, delta: n >= 2 ? round1(last[n - 1] - last[n - 2]) : null, colour: subjectColour(subject) })
  }
  return out.sort((a, b) => rank(a.subject) - rank(b.subject) || a.subject.localeCompare(b.subject))
}

export interface MarksView {
  overall: number | null
  stats: SubjectStat[]
  /** The highest average, or null when there are no marks. */
  best: SubjectStat | null
  /** The biggest rise since the previous mark. Null when nothing has gone up. */
  improved: SubjectStat | null
  count: number
}

export function buildMarksView(marks: readonly Mark[]): MarksView {
  const stats = subjectStats(marks)
  const best = stats.reduce<SubjectStat | null>((b, s) => (!b || s.avg > b.avg ? s : b), null)
  const improved = stats.reduce<SubjectStat | null>((b, s) => (s.delta !== null && s.delta > 0 && (!b || s.delta > (b.delta ?? 0)) ? s : b), null)
  return { overall: average(marks), stats, best, improved, count: marks.length }
}

/** Validates a typed in mark. Returns a plain sentence for the first problem, or null. */
export function markProblem(v: { subject: string; assessment: string; score: number; out_of: number; weighting: number | null; date: string }): string | null {
  if (!v.subject.trim()) return 'Add a subject.'
  if (!v.assessment.trim()) return 'Add what the assessment was.'
  if (!Number.isFinite(v.score) || v.score < 0) return 'Score needs to be zero or more.'
  if (!Number.isFinite(v.out_of) || v.out_of <= 0) return 'Out of needs to be more than zero.'
  if (v.score > v.out_of * 1.5) return 'That score is a lot more than the total.'
  if (v.weighting !== null && (!Number.isFinite(v.weighting) || v.weighting < 0 || v.weighting > 100)) return 'Weighting is a percent from 0 to 100.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) return 'Pick a date.'
  return null
}

/** A very short subject name for the Best and Most improved tiles. */
export function abbrSubject(s: string): string {
  if (/chem/i.test(s)) return 'Chem'
  if (/math|method/i.test(s)) return 'Methods'
  if (/spec/i.test(s)) return 'Spec'
  if (/bio/i.test(s)) return 'Bio'
  return s.length > 9 ? `${s.slice(0, 8).trimEnd()}.` : s
}

/** Subjects Liam studies, offered as suggestions in the entry form. */
export const KNOWN_SUBJECTS = ['Chemistry', 'Methods', 'Specialist', 'Human Biology', 'English', 'Religion']
