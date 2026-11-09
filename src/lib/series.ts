import type { SeriesPoint, TrackingUnit } from '../api/trackingUnits'
import { formatMeasurement } from './units'
import { dayCount, shiftDay, toDayKey, todayKey } from './date'

/**
 * The chart pages' maths, kept free of React and ECharts so the unit page and
 * the compare page bucket, average and correlate the exact same way.
 *
 * Throughout, an unlogged day is "no data", never a zero - for a summing unit
 * too. A day nobody wrote steps down for wasn't a day of zero steps, and
 * treating it as one would drag every average and correlation towards 0.
 */

export const PERIODS = [
  { id: 'week', label: 'W', name: 'Week' },
  { id: 'month', label: 'M', name: 'Month' },
  { id: '6m', label: '6M', name: '6 months' },
  { id: 'year', label: 'Y', name: 'Year' },
  { id: 'all', label: 'All', name: 'All time' },
] as const

export type Period = (typeof PERIODS)[number]['id']

/** What one bar / point on the chart stands for. */
export type Resolution = 'day' | 'week' | 'month'

/**
 * Apple Health's rule of thumb: a week or a month is read day by day, half a
 * year week by week, anything longer month by month - so there are never more
 * than ~31 marks across, and a bar is never a hairline.
 */
export function resolutionFor(period: Period): Resolution {
  if (period === 'week' || period === 'month') return 'day'
  if (period === '6m') return 'week'
  return 'month'
}

export interface Bounds {
  from: string
  to: string
  /** "6–12 Oct 2026", "October 2026", "2026" - what the headline says the period is. */
  label: string
}

function parts(day: string): [number, number, number] {
  const [year, month, date] = day.split('-').map(Number)
  return [year, month, date]
}

function monthStart(year: number, monthIndex: number): string {
  return toDayKey(new Date(year, monthIndex, 1))
}

function monthEnd(year: number, monthIndex: number): string {
  return toDayKey(new Date(year, monthIndex + 1, 0))
}

/** Monday of the ISO week holding `day`. */
export function weekStart(day: string): string {
  const [year, month, date] = parts(day)
  const weekday = new Date(year, month - 1, date).getDay()
  return shiftDay(day, -((weekday + 6) % 7))
}

const monthYear = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const shortMonthYear = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' })
const dayMonthYear = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const weekdayDayMonth = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})
const narrowWeekday = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })
const shortMonth = new Intl.DateTimeFormat(undefined, { month: 'short' })

function asDate(day: string): Date {
  const [year, month, date] = parts(day)
  return new Date(year, month - 1, date)
}

/** "6–12 Oct 2026" style, collapsing whatever the two ends share - the locale decides how. */
function formatSpan(from: string, to: string): string {
  return dayMonthYear.formatRange(asDate(from), asDate(to))
}

/**
 * A calendar-aligned period, `offset` periods back from the one holding today
 * (0 = this week / month / year; negative pages ahead, for a projection).
 * Calendar pages rather than rolling windows, so paging back lands on
 * "September", not "the 30 days before the 30 days before today".
 *
 * `to` can lie in the future - this week runs to Sunday - so the axis keeps
 * its full width and the empty days read as "still to come".
 */
export function periodBounds(period: Period, offset: number, earliest?: string): Bounds {
  const today = todayKey()
  const [year, month] = parts(today)

  switch (period) {
    case 'week': {
      const from = shiftDay(weekStart(today), -7 * offset)
      const to = shiftDay(from, 6)
      return { from, to, label: formatSpan(from, to) }
    }
    case 'month': {
      const from = monthStart(year, month - 1 - offset)
      const [y, m] = parts(from)
      return { from, to: monthEnd(y, m - 1), label: monthYear.format(asDate(from)) }
    }
    case '6m': {
      // The six months ending with this one, then the six before those.
      const lastMonth = month - 1 - 6 * offset
      const from = monthStart(year, lastMonth - 5)
      const to = monthEnd(year, lastMonth)
      return {
        from,
        to,
        label: `${shortMonthYear.format(asDate(from))} – ${shortMonthYear.format(asDate(to))}`,
      }
    }
    case 'year': {
      const y = year - offset
      return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) }
    }
    case 'all': {
      const start = earliest && earliest < today ? earliest : today
      const [y, m] = parts(start)
      const from = monthStart(y, m - 1)
      return { from, to: monthEnd(year, month - 1), label: `Since ${shortMonthYear.format(asDate(start))}` }
    }
  }
}

/** One mark on the x-axis: a day, a week or a month. */
export interface Slot {
  /** The category value - the slot's first day. */
  key: string
  start: string
  end: string
  /** What the axis prints under it; '' leaves the tick bare. */
  axisLabel: string
  /** What the headline prints while it's hovered. */
  title: string
}

/**
 * The period's x-axis, slot by slot. Week slots are clipped to the period so
 * the first one of a 6-month view can't reach back into the month before.
 */
export function buildSlots(bounds: Bounds, resolution: Resolution, period: Period): Slot[] {
  const slots: Slot[] = []

  if (resolution === 'day') {
    for (let day = bounds.from; day <= bounds.to; day = shiftDay(day, 1)) {
      const date = asDate(day)
      const dayOfMonth = date.getDate()
      const axisLabel =
        period === 'week'
          ? narrowWeekday.format(date)
          : dayOfMonth === 1 || dayOfMonth % 7 === 1
            ? String(dayOfMonth)
            : ''
      slots.push({ key: day, start: day, end: day, axisLabel, title: weekdayDayMonth.format(date) })
    }
    return slots
  }

  if (resolution === 'week') {
    for (let start = weekStart(bounds.from); start <= bounds.to; start = shiftDay(start, 7)) {
      const clippedStart = start < bounds.from ? bounds.from : start
      const end = shiftDay(start, 6) > bounds.to ? bounds.to : shiftDay(start, 6)
      // A month's name under the first week that opens in it, nothing under the rest.
      const previous = slots[slots.length - 1]
      const opensMonth = !previous || parts(previous.start)[1] !== parts(clippedStart)[1]
      slots.push({
        key: clippedStart,
        start: clippedStart,
        end,
        axisLabel: opensMonth ? shortMonth.format(asDate(clippedStart)) : '',
        title: `Week of ${formatSpan(clippedStart, end)}`,
      })
    }
    return slots
  }

  const [fromYear, fromMonth] = parts(bounds.from)
  const spansYears = parts(bounds.to)[0] !== fromYear
  for (let index = 0; ; index++) {
    const start = monthStart(fromYear, fromMonth - 1 + index)
    if (start > bounds.to) break
    const [y, m] = parts(start)
    const date = asDate(start)
    const label = shortMonth.format(date)
    slots.push({
      key: start,
      start,
      end: monthEnd(y, m - 1),
      // Across several years, January carries its year so the axis can be read.
      axisLabel: spansYears && m === 1 ? `${label} ’${String(y).slice(2)}` : label,
      title: monthYear.format(date),
    })
  }
  return slots
}

/** A slot's readings, collapsed. For a day slot avg = min = max = that day's figure. */
export interface SlotStat {
  avg: number
  min: number
  max: number
  total: number
  /** Days in the slot with something logged. */
  days: number
  /** Readings behind it - several coffees can make up one day. */
  entries: number
}

/**
 * Every slot's figure from a unit's per-day series (already one value per day,
 * aggregated server-side by the unit's own rule). Days outside every slot are
 * ignored; a slot with nothing logged is null, never zeros.
 */
export function slotStats(points: SeriesPoint[], slots: Slot[]): (SlotStat | null)[] {
  if (slots.length === 0) return []
  const first = slots[0].start
  const last = slots[slots.length - 1].end
  const stats: (SlotStat | null)[] = slots.map(() => null)

  let slotIndex = 0
  for (const point of points) {
    if (point.date < first) continue
    if (point.date > last) break
    while (slotIndex < slots.length && slots[slotIndex].end < point.date) slotIndex++
    if (slotIndex >= slots.length) break
    if (point.date < slots[slotIndex].start) continue

    const current = stats[slotIndex]
    if (!current) {
      stats[slotIndex] = {
        avg: point.value,
        min: point.value,
        max: point.value,
        total: point.value,
        days: 1,
        entries: point.count,
      }
    } else {
      current.total += point.value
      current.days += 1
      current.entries += point.count
      current.min = Math.min(current.min, point.value)
      current.max = Math.max(current.max, point.value)
      current.avg = current.total / current.days
    }
  }
  return stats
}

/**
 * A trailing 7-day average at each day slot - the trend line drawn through
 * daily readings. Read from the whole history, so the first days of a week
 * view still average over the week before it. Null where the window holds
 * nothing at all.
 */
export function rollingMean(points: SeriesPoint[], slots: Slot[], window = 7): (number | null)[] {
  const byDate = new Map(points.map((point) => [point.date, point.value]))
  const today = todayKey()
  return slots.map((slot) => {
    if (slot.start > today) return null
    let sum = 0
    let count = 0
    for (let back = 0; back < window; back++) {
      const value = byDate.get(shiftDay(slot.start, -back))
      if (value !== undefined) {
        sum += value
        count++
      }
    }
    return count > 0 ? sum / count : null
  })
}

export interface Projection {
  /** Today - where the projection sets off. */
  from: string
  /** Today's 7-day average, the projection's first point. */
  start: number
  /** The fitted change per day. */
  perDay: number
}

/**
 * Where the 7-day average is heading. The slope is a least-squares fit of the
 * last `basis` days' readings; it sets off from today's average rather than
 * the fit's own value so it carries on the solid line instead of jumping to
 * the raw readings, which the average lags by a few days.
 *
 * Null without enough to go on - a reading in the last week, and readings on
 * at least 4 days a week or more apart end to end - so two weigh-ins can't
 * set a slope.
 */
export function trendProjection(points: SeriesPoint[], basis = 14, window = 7): Projection | null {
  const today = todayKey()
  const week = pointsIn(points, { from: shiftDay(today, -(window - 1)), to: today })
  if (week.length === 0) return null

  const since = shiftDay(today, -(basis - 1))
  const recent = pointsIn(points, { from: since, to: today })
  if (recent.length < 4 || dayCount(recent[0].date, recent[recent.length - 1].date) < 8) return null

  // fitLine is only null here when every reading was the same: a flat line.
  const fit = fitLine(recent.map((point) => ({ x: dayCount(since, point.date), y: point.value })))
  return {
    from: today,
    start: week.reduce((sum, point) => sum + point.value, 0) / week.length,
    perDay: fit?.slope ?? 0,
  }
}

/**
 * A projection laid over a period's day slots: null before today, then where
 * the average will be each day. Null for a period that's already over.
 */
export function projectedValues(projection: Projection, slots: Slot[]): (number | null)[] | null {
  if (slots.length === 0 || slots[slots.length - 1].start < projection.from) return null
  return slots.map((slot) =>
    slot.start < projection.from
      ? null
      : projection.start + projection.perDay * (dayCount(projection.from, slot.start) - 1),
  )
}

/** The points inside a period, oldest first. */
export function pointsIn(points: SeriesPoint[], bounds: { from: string; to: string }): SeriesPoint[] {
  return points.filter((point) => point.date >= bounds.from && point.date <= bounds.to)
}

export interface Stat {
  label: string
  value: string
}

export interface PeriodSummary {
  /** "Daily average" for a summing unit, "Average" for a reading. */
  headlineLabel: string
  headline: number
  stats: Stat[]
}

/**
 * The headline and the tiles for one period.
 *
 * Both kinds average only the days something was actually recorded - an
 * unlogged day is "no data", not a zero, so it mustn't drag the average down.
 */
export function summarisePeriod(
  unit: TrackingUnit,
  points: SeriesPoint[],
  bounds: Bounds,
): PeriodSummary | null {
  if (points.length === 0) return null
  const values = points.map((point) => point.value)
  const format = (value: number) => formatMeasurement(value, unit)
  const total = values.reduce((sum, value) => sum + value, 0)
  const average = total / values.length

  if (unit.aggregation === 'sum') {
    const today = todayKey()
    const elapsed = dayCount(bounds.from, bounds.to < today ? bounds.to : today)
    return {
      headlineLabel: 'Daily average',
      headline: average,
      stats: [
        { label: 'Total', value: format(total) },
        { label: 'Best day', value: format(Math.max(...values)) },
        { label: 'Lowest day', value: format(Math.min(...values)) },
        { label: 'Days logged', value: `${points.length} of ${elapsed}` },
      ],
    }
  }

  const change = values[values.length - 1] - values[0]
  const sign = change > 0 ? '+' : change < 0 ? '−' : '±'
  return {
    headlineLabel: 'Average',
    headline: average,
    stats: [
      { label: 'Latest', value: format(values[values.length - 1]) },
      { label: 'Change', value: `${sign}${format(Math.abs(change))}` },
      { label: 'Low', value: format(Math.min(...values)) },
      { label: 'High', value: format(Math.max(...values)) },
    ],
  }
}

/**
 * Pairs two units' days: A's reading on day d against B's on d + lag. Only
 * days where both were actually logged count.
 */
export function alignDays(
  a: SeriesPoint[],
  b: SeriesPoint[],
  lagDays: number,
): { date: string; x: number; y: number }[] {
  const bByDate = new Map(b.map((point) => [point.date, point.value]))
  const pairs: { date: string; x: number; y: number }[] = []
  for (const point of a) {
    const y = bByDate.get(lagDays === 0 ? point.date : shiftDay(point.date, lagDays))
    if (y !== undefined) pairs.push({ date: point.date, x: point.value, y })
  }
  return pairs
}

export interface Fit {
  /** Pearson's r, -1..1. */
  r: number
  n: number
  slope: number
  intercept: number
}

/** Pearson correlation plus the least-squares line, or null when it's undefined. */
export function fitLine(pairs: { x: number; y: number }[]): Fit | null {
  const n = pairs.length
  if (n < 3) return null
  let sx = 0
  let sy = 0
  for (const { x, y } of pairs) {
    sx += x
    sy += y
  }
  const mx = sx / n
  const my = sy / n
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (const { x, y } of pairs) {
    sxx += (x - mx) ** 2
    syy += (y - my) ** 2
    sxy += (x - mx) * (y - my)
  }
  if (sxx === 0 || syy === 0) return null
  const slope = sxy / sxx
  return { r: sxy / Math.sqrt(sxx * syy), n, slope, intercept: my - slope * mx }
}

/** Plain words for an r - the number alone means little to most people. */
export function strengthLabel(r: number): string {
  const size = Math.abs(r)
  const strength =
    size < 0.1 ? 'no' : size < 0.3 ? 'weak' : size < 0.5 ? 'moderate' : size < 0.7 ? 'strong' : 'very strong'
  if (strength === 'no') return 'no real link'
  return `${strength} ${r > 0 ? 'positive' : 'negative'}`
}

/**
 * Rescales values to 0-100 of their own low..high in view - how the overlay
 * puts steps and kilograms on one axis without inventing a second one.
 */
export function indexToRange(values: (number | null)[]): (number | null)[] {
  const present = values.filter((value): value is number => value !== null)
  if (present.length === 0) return values
  const low = Math.min(...present)
  const high = Math.max(...present)
  const span = high - low
  return values.map((value) => (value === null ? null : span === 0 ? 50 : ((value - low) / span) * 100))
}

/** The earliest day across several series, for the "All" period's start. */
export function earliestDay(series: (SeriesPoint[] | undefined)[]): string | undefined {
  let earliest: string | undefined
  for (const points of series) {
    const first = points?.[0]?.date
    if (first && (!earliest || first < earliest)) earliest = first
  }
  return earliest
}
