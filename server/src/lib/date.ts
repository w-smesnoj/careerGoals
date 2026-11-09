/**
 * Days are identified by a local calendar date string, `YYYY-MM-DD`, never a Date.
 * Storing a timestamp would make "which day was this?" depend on the reader's
 * timezone, so a tick near midnight could land on the wrong column.
 */
export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export function daysInMonth(month: string): number {
  const [year, monthIndex] = month.split('-').map(Number)
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, monthIndex, 0)).getUTCDate()
}

/** Every day of the month as `YYYY-MM-DD`, in order. */
export function monthDays(month: string): string[] {
  return Array.from(
    { length: daysInMonth(month) },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`,
  )
}

/** Every day from `from` to `to` inclusive, as `YYYY-MM-DD`, in order. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day)
  }
  return days
}

/**
 * Days from `from` to `to`, exclusive of `from`: 0 for the same day, negative
 * when `to` precedes it. Divides exactly rather than rounding - every helper
 * here builds its dates with `Date.UTC`, so no day is ever 23 or 25 hours long.
 *
 * The cheap counterpart to `daysBetween(...).length - 1`, which allocates the
 * whole span to measure it.
 */
export function dayDiff(from: string, to: string): number {
  const [fromYear, fromMonth, fromDate] = from.split('-').map(Number)
  const [toYear, toMonth, toDate] = to.split('-').map(Number)
  const start = Date.UTC(fromYear, fromMonth - 1, fromDate)
  const end = Date.UTC(toYear, toMonth - 1, toDate)
  return (end - start) / 86_400_000
}

/** 0 (Sun) .. 6 (Sat) for a `YYYY-MM-DD` key, computed in UTC to avoid server-timezone drift. */
export function weekdayOf(day: string): number {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay()
}

/** Shift a `YYYY-MM-DD` key by a number of days, computed in UTC (see weekdayOf). */
export function addDays(day: string, delta: number): string {
  const [year, month, date] = day.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, date + delta))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

/**
 * The UTC calendar day of a stored Date, matching how the client reads the
 * same field off the ISO string it receives (`startDate.slice(0, 10)`).
 */
export function toDayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Today as a local calendar day on the server, for future-day guards. */
export function today(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
