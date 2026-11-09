import type { DayTaskLimit, DayTaskUnit } from '../api/tracker'
import type { TaskFrequency, TaskLimitDirection, TaskLimitMeasure, TaskLimitPeriod } from '../api/tasks'
import { dayResolutionLabels, type TaskDayResolution } from '../api/tasks'

const weekdayShort = Array.from({ length: 7 }, (_, weekday) =>
  // 2024-01-07 was a Sunday, so the offset and `getDay()` line up.
  new Date(2024, 0, 7 + weekday).toLocaleDateString(undefined, { weekday: 'short' }),
)

const weekdayLong = Array.from({ length: 7 }, (_, weekday) =>
  new Date(2024, 0, 7 + weekday).toLocaleDateString(undefined, { weekday: 'long' }),
)

/** Weekday names in Monday-first order, with `Date.getDay()` indexes. */
export const WEEKDAYS_MONDAY_FIRST = [1, 2, 3, 4, 5, 6, 0].map((index) => ({
  index,
  short: weekdayShort[index],
  long: weekdayLong[index],
}))

export function weekdayName(index: number, style: 'short' | 'long' = 'long'): string {
  return style === 'short' ? weekdayShort[index] : weekdayLong[index]
}

/**
 * Only the day-keyed frequencies get a label on Today - daily and once are
 * already implied by being on Today.
 *
 * A cadence is spelled out in full rather than named. Weekly and monthly say
 * what they are, but "every 3 days" is the one repeat nobody can infer from
 * seeing the row on a given day.
 */
export function frequencyLabel(frequency: TaskFrequency): string | null {
  switch (frequency.type) {
    case 'weekly':
      return 'Weekly'
    case 'monthly':
      return 'Monthly'
    case 'everyNDays':
      return `Every ${frequency.intervalDays} days`
    default:
      return null
  }
}

/** Monday-first order for a set of `getDay()` weekdays. */
function mondayFirst(days: number[]): number[] {
  return [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
}

/** The whole repeat, in words: "Weekly on Mon, Thu", "Monthly on the 1st and 15th". */
export function frequencySummary(frequency: {
  type: TaskFrequency['type']
  daysOfWeek?: number[]
  daysOfMonth?: number[]
  intervalDays?: number
}): string {
  switch (frequency.type) {
    case 'once':
      return 'Once'
    case 'daily':
      return 'Daily'
    case 'weekly': {
      const days = mondayFirst(frequency.daysOfWeek ?? [])
      if (days.length === 0) return 'Weekly'
      if (days.length === 7) return 'Every day'
      const weekdays = [1, 2, 3, 4, 5]
      if (days.length === 5 && weekdays.every((day) => days.includes(day))) return 'Weekdays'
      if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends'
      return `Weekly on ${days.map((day) => weekdayShort[day]).join(', ')}`
    }
    case 'monthly': {
      const days = [...(frequency.daysOfMonth ?? [])].sort((a, b) => a - b)
      return days.length ? `Monthly on ${days.join(', ')}` : 'Monthly'
    }
    case 'everyNDays':
      return `Every ${frequency.intervalDays ?? '?'} days`
  }
}

export function resolutionSummary(resolution: TaskDayResolution): string {
  return dayResolutionLabels[resolution].label
}

/** A limit figure without trailing zeros and with grouping: 13, 10.4, 7,000. */
export function limitNumber(value: number, decimals: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: decimals })
}

/** "≤ 20 coffees a week", "≥ 7,000 steps a day", "≥ 8 h a day, weekly average". */
export function limitSummary(limit: {
  direction: TaskLimitDirection
  target: number
  period: TaskLimitPeriod
  measure?: TaskLimitMeasure
  unit?: { name: string; symbol: string; decimals: number } | null
}): string {
  const sign = limit.direction === 'atLeast' ? '≥' : '≤'
  const unit = limit.unit
  const amount = limitNumber(limit.target, unit?.decimals ?? 2)
  const what = unit ? (unit.symbol ? ` ${unit.symbol}` : ` ${unit.name.toLowerCase()}`) : ''
  if (limit.measure === 'average') return `${sign} ${amount}${what} a day, weekly average`
  return `${sign} ${amount}${what} a ${limit.period}`
}

/** Whether a limit's figure is on the right side of its target. */
function limitMet({ direction, target, used }: DayTaskLimit): boolean {
  return direction === 'atLeast' ? used >= target : used <= target
}

/** The second unit a daily limit still wants logged, if any. */
function missingUnit({ alsoLogged }: DayTaskLimit): DayTaskUnit | null {
  return alsoLogged && !alsoLogged.logged ? alsoLogged.unit : null
}

/**
 * A limit or target task's progress: how much of the day's or week's total is
 * used up (at most) or reached (at least). It turns bad only once the outcome
 * is: an 'atMost' total gone over, or an 'atLeast' period that ended short - or
 * a day that ended without the second unit it wanted logged. A target still
 * being climbed isn't a failure yet - and neither is an average, either way,
 * until its week is over.
 */
export function limitVerdict(limit: DayTaskLimit): { fill: number; bad: boolean } {
  const { direction, target, used, hasData, final } = limit
  const atLeast = direction === 'atLeast'
  const bad =
    hasData &&
    ((final && missingUnit(limit) !== null) ||
      (limit.measure === 'average' ? final && !limitMet(limit) : atLeast ? final && used < target : used > target))
  const fill = target > 0 ? Math.min(used / target, 1) : used > 0 ? 1 : 0
  return { fill, bad }
}

/** Where a row's detail leads: the unit that needs a number next. */
export function limitLogUnit(limit: DayTaskLimit): DayTaskUnit {
  const missing = missingUnit(limit)
  return missing && limit.hasData && limitMet(limit) ? missing : limit.unit
}

/** The few words a row has room for - "3 left", "2 over", "reached", "avg 7.4 h", "log hours". */
export function limitStatus(limit: DayTaskLimit): string {
  const { unit, direction, target, used, hasData, final } = limit
  const atLeast = direction === 'atLeast'
  if (!hasData) return 'nothing yet'
  if (limit.measure === 'average') {
    if (final && limitMet(limit)) return atLeast ? 'reached' : 'within limit'
    return `avg ${limitNumber(used, unit.decimals)}${unit.symbol ? ` ${unit.symbol}` : ''}`
  }
  const missing = missingUnit(limit)
  const missingStatus = missing
    ? `${final ? 'no' : 'log'} ${missing.symbol || missing.name.toLowerCase()}`
    : null
  if (atLeast) {
    if (used >= target) return missingStatus ?? 'reached'
    return final
      ? `${limitNumber(target - used, unit.decimals)} short`
      : `${limitNumber(target - used, unit.decimals)} to go`
  }
  if (used > target) return `${limitNumber(used - target, unit.decimals)} over`
  if (final && missingStatus) return missingStatus
  // A zero cap ("none at all") has nothing to count down - "0 left" reads as a
  // warning when it's actually the goal being met.
  if (target === 0) return final ? `none that ${limit.period}` : 'none so far'
  return final ? 'within limit' : `${limitNumber(target - used, unit.decimals)} left`
}

/** "1 task", "3 tasks" - counted nouns through the locale's plural rules. */
const plural = new Intl.PluralRules()

export function counted(count: number, one: string, other = `${one}s`): string {
  return `${count.toLocaleString()} ${plural.select(count) === 'one' ? one : other}`
}
