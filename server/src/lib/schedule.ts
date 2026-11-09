import type { TaskFrequency } from '../models/task.model'
import { dayDiff, weekdayOf } from './date'

/**
 * Pure day-match for daily/weekly/monthly/everyNDays. Always true for 'once' -
 * a once task's real visibility also depends on completion history (has it
 * already got one, and on what date), which callers with completion data must
 * layer on top; see tracker.controller.ts getDay.
 *
 * Mirrored in src/lib/schedule.ts on the frontend - keep the two in sync by hand.
 */
/**
 * Whether a frequency picks out particular calendar days, rather than applying
 * to all of them ('daily') or to none in particular ('once').
 *
 * Exists so the three places that ask the question - what shows on a day, what
 * gets previewed instead, and what may be ticked - can't answer it differently.
 * They used to spell it `type === 'weekly' || type === 'monthly'` each, which
 * meant a new frequency was silently treated as daily in all three.
 */
export function isDayKeyed(frequency: TaskFrequency): boolean {
  return (
    frequency.type === 'weekly' ||
    frequency.type === 'monthly' ||
    frequency.type === 'everyNDays'
  )
}

export function isScheduledOn(frequency: TaskFrequency, date: string): boolean {
  switch (frequency.type) {
    case 'daily':
    case 'once':
      return true
    case 'weekly':
      return frequency.daysOfWeek.includes(weekdayOf(date))
    case 'monthly':
      return frequency.daysOfMonth.includes(Number(date.slice(-2)))
    case 'everyNDays':
      // Nothing before the anchor: it *is* the first occurrence, so a cadence
      // never reaches back past the day it was set from.
      if (date < frequency.anchorDate) return false
      return dayDiff(frequency.anchorDate, date) % frequency.intervalDays === 0
  }
}
