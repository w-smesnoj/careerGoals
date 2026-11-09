/**
 * The client is the source of truth for "what day is it" - it uses the user's
 * local calendar date, never UTC, so ticking a box at 23:50 lands on today.
 */
export function toDayKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayKey(): string {
  return toDayKey(new Date())
}

/** Local midnight for a `YYYY-MM-DD` key, in epoch millis. */
export function dayStart(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).getTime()
}

/**
 * Narrow weekday labels indexed by `Date.getDay()`, used for the timeline's
 * weekday row. Built once at import: the header asks for a label per day every
 * time it rebuilds, and `toLocaleDateString` spins up a formatter per call.
 */
const WEEKDAY_LABELS = Array.from({ length: 7 }, (_, weekday) =>
  // 2024-01-07 was a Sunday, so the offset and `getDay()` line up.
  new Date(2024, 0, 7 + weekday).toLocaleDateString(undefined, { weekday: 'narrow' }),
)

/** Narrow label for a `Date.getDay()` weekday number. */
export function weekdayLabel(weekday: number): string {
  return WEEKDAY_LABELS[weekday]
}

/**
 * Two-letter weekday labels indexed by `Date.getDay()` - "Mo", "Tu" in English,
 * "Mo", "Di" in German - for a wall-planner cell. The short form with its
 * abbreviation dot dropped, cut to two letters; built once, like the above.
 */
const WEEKDAY_SHORT = Array.from({ length: 7 }, (_, weekday) =>
  new Date(2024, 0, 7 + weekday)
    .toLocaleDateString(undefined, { weekday: 'short' })
    .replace('.', '')
    .slice(0, 2),
)

/** Two-letter label for a `Date.getDay()` weekday number. */
export function weekdayShort(weekday: number): string {
  return WEEKDAY_SHORT[weekday]
}

/** Monday-first, so the weekend closes the row. `Date.getDay()` is Sunday-first. */
export const WEEK_START = 1

export interface CalendarCell {
  key: string
  date: number
  inMonth: boolean
}

/** The month `day` falls in, padded out to whole weeks with its neighbours' days. */
export function monthGrid(day: Date): CalendarCell[] {
  const year = day.getFullYear()
  const month = day.getMonth()
  // How many leading days of the previous month the first row needs.
  const lead = (new Date(year, month, 1).getDay() - WEEK_START + 7) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Whole weeks only, so the grid never reflows as months change length.
  const cellCount = Math.ceil((lead + daysInMonth) / 7) * 7

  return Array.from({ length: cellCount }, (_, index) => {
    const date = new Date(year, month, index - lead + 1)
    return { key: toDayKey(date), date: date.getDate(), inMonth: date.getMonth() === month }
  })
}

/** Rows of seven, so each week can carry its own KW number. */
export function weeksOf(cells: CalendarCell[]): CalendarCell[][] {
  return Array.from({ length: cells.length / 7 }, (_, row) => cells.slice(row * 7, row * 7 + 7))
}

export function isWeekend(weekday: number): boolean {
  return weekday === 0 || weekday === 6
}

/**
 * Inclusive day count between two `YYYY-MM-DD` keys; 0 when `to` precedes
 * `from`. Rounded rather than divided exactly: a DST day is 23 or 25 hours, so
 * the raw quotient is off by an hour's worth on either side of a shift.
 */
export function dayCount(from: string, to: string): number {
  if (to < from) return 0
  return Math.round((dayStart(to) - dayStart(from)) / 86_400_000) + 1
}

/** Shift a `YYYY-MM-DD` key by a number of days. */
export function shiftDay(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number)
  return toDayKey(new Date(year, month - 1, date + delta))
}

/**
 * ISO-8601 calendar week (KW) for a `YYYY-MM-DD` key: weeks run Monday to
 * Sunday and week 1 is the one holding the first Thursday of the year.
 */
export function isoWeek(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  const thursday = new Date(year, month - 1, date)
  // Step to this week's Thursday - the day that decides both number and year.
  thursday.setDate(thursday.getDate() + 3 - ((thursday.getDay() + 6) % 7))
  const firstThursday = new Date(thursday.getFullYear(), 0, 4)
  firstThursday.setDate(firstThursday.getDate() + 3 - ((firstThursday.getDay() + 6) % 7))
  // Rounded, not divided exactly: a DST shift makes a week 167 or 169 hours.
  return 1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
}

export function formatDayLong(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** "Wednesday" for a `YYYY-MM-DD` key, e.g. heading a day in an upcoming-tasks preview. */
export function formatWeekday(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString(undefined, { weekday: 'long' })
}

/** "Tomorrow"/"In N days" for a days-until count, e.g. in an upcoming-tasks preview. */
export function formatRelativeDays(daysUntil: number): string {
  return daysUntil === 1 ? 'Tomorrow' : `In ${daysUntil} days`
}

/** Compact "Sep 2" label for a `YYYY-MM-DD` key, e.g. on a timeline bar. */
export function formatDayShort(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  })
}
