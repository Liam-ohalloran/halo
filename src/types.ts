export interface Shift {
  id: string
  title: string
  station: string | null
  starts_at: string
  ends_at: string
  is_public_holiday: boolean
}

export interface Test {
  id: string
  subject: string
  title: string
  due_at: string
}

export interface Settings {
  weekday_rate: number
  saturday_rate: number
  sunday_multiplier: number
  public_holiday_multiplier: number
}

export interface StudySession {
  id: string
  subject: string
  started_at: string
  ended_at: string | null
  minutes: number | null
}

/** Everything the UI needs from the database. Real impl talks to Supabase; dev impl is in-memory. */
export interface Backend {
  /** The shift happening now, or else the next one. */
  nextShift(now: Date): Promise<Shift | null>
  nextTest(now: Date): Promise<Test | null>
  /** Shifts that overlap [from, to). */
  shiftsBetween(from: Date, to: Date): Promise<Shift[]>
  settings(): Promise<Settings>
  activeSession(): Promise<StudySession | null>
  sessionsSince(from: Date): Promise<StudySession[]>
  startSession(subject: string): Promise<StudySession>
  stopSession(id: string): Promise<StudySession>
  /** Subjects seen in tests and past study sessions. */
  subjects(): Promise<string[]>
  /** Realtime: called whenever a shift row changes. Returns unsubscribe. */
  onShiftsChange(cb: () => void, onStatus?: (live: boolean) => void): () => void
}

/** Column defaults from the settings table, used until a row exists. */
export const DEFAULT_SETTINGS: Settings = {
  weekday_rate: 17.89,
  saturday_rate: 17.89,
  sunday_multiplier: 1.25,
  public_holiday_multiplier: 2,
}
