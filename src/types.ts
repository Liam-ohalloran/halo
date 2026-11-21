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

/** One row of the alerts table (card 20). `read_at` null means unread. */
export interface AlertRow {
  id: string
  type: string
  title: string
  body: string
  action_label: string | null
  action_url: string | null
  created_at: string
  read_at: string | null
}

import type { Goal, MoneyItem } from './lib/money'
import type { Mark } from './lib/marks'

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
  /** Ends a session. `endedAt` defaults to now. The timer passes started_at + focused time so paused time is not logged. */
  stopSession(id: string, endedAt?: Date): Promise<StudySession>
  /** Tests due after `now`, soonest first. */
  upcomingTests(now: Date): Promise<Test[]>
  /** Tests due in [from, to), soonest first (the Week tab). */
  testsBetween(from: Date, to: Date): Promise<Test[]>
  /** Subjects seen in tests and past study sessions. */
  subjects(): Promise<string[]>
  /** Unread alerts, newest first (the Alerts tab and the island's gold dot). */
  unreadAlerts(): Promise<AlertRow[]>
  /** Mark alerts read. Only ever sets read_at, never anything else. */
  markAlertsRead(ids: string[]): Promise<void>
  /** Realtime: called whenever an alert row is inserted or changed. Returns unsubscribe. */
  onAlertsChange(cb: () => void): () => void
  /** Money tab (card 21). Manual rows only, nothing here touches a bank. */
  goals(): Promise<Goal[]>
  saveGoal(g: { id?: string; name: string; saved: number; target: number; colour: string }): Promise<void>
  deleteGoal(id: string): Promise<void>
  /** Spend and subscription rows, newest first. */
  moneyItems(): Promise<MoneyItem[]>
  addMoneyItem(i: Omit<MoneyItem, 'id'>): Promise<void>
  deleteMoneyItem(id: string): Promise<void>
  /** Marks tab (card 21). Typed in by hand. */
  marks(): Promise<Mark[]>
  addMark(m: Omit<Mark, 'id'>): Promise<void>
  deleteMark(id: string): Promise<void>
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
