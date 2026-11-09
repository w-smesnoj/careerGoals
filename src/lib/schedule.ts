import type { TaskFrequency } from '../api/tasks'
import { dayCount } from './date'

/**
 * Pure day-match for daily/weekly/monthly/everyNDays. Always true for 'once' -
 * a once task's real visibility also depends on completion history, handled
 * separately by callers (see TrackerTable's DayCell).
 *
 * Mirrors server/src/lib/schedule.ts - keep the two in sync by hand.
 *
 * The `default` case is load-bearing: tsconfig.app.json isn't strict, so a
 * missing branch would return `undefined` and still compile, and this function
 * decides what the timeline, the heatmap and every stat can see. Assigning to
 * `never` fails the build without strictNullChecks; falling off the end doesn't.
 */
export function isScheduledOn(frequency: TaskFrequency, day: string): boolean {
  switch (frequency.type) {
    case 'daily':
    case 'once':
      return true
    case 'weekly': {
      const [year, month, date] = day.split('-').map(Number)
      return frequency.daysOfWeek.includes(new Date(year, month - 1, date).getDay())
    }
    case 'monthly':
      return frequency.daysOfMonth.includes(Number(day.slice(-2)))
    case 'everyNDays':
      // Nothing before the anchor - it *is* the first occurrence. dayCount is
      // inclusive, so minus one is the gap; it rounds rather than dividing
      // because these are local midnights and a DST day isn't 24 hours.
      if (day < frequency.anchorDate) return false
      return (dayCount(frequency.anchorDate, day) - 1) % frequency.intervalDays === 0
    default: {
      const exhaustive: never = frequency
      return exhaustive
    }
  }
}
