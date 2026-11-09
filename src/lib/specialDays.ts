import type {
  BuiltinCategory,
  SpecialDay,
  SpecialDayCategory,
  SpecialDayOccurrence,
} from '../api/specialDays'
import type { ComputedDay } from './holidays'
import { formatDayLong, shiftDay } from './date'

/**
 * Turning stored special days into dated occurrences. No date library: the
 * whole app treats a day as a `YYYY-MM-DD` string, and month/day slicing is
 * exact on those in a way arithmetic on a `Date` is not.
 */

export interface CategoryIndex {
  /** In filter order. */
  list: SpecialDayCategory[]
  byId: ReadonlyMap<string, SpecialDayCategory>
  /** Where the computed days land - missing only before the migration has run. */
  builtin: Partial<Record<BuiltinCategory, SpecialDayCategory>>
}

export function categoryIndex(categories: SpecialDayCategory[]): CategoryIndex {
  const builtin: CategoryIndex['builtin'] = {}
  for (const category of categories) if (category.builtin) builtin[category.builtin] = category
  return {
    list: categories,
    byId: new Map(categories.map((category) => [category.id, category])),
    builtin,
  }
}

/** A birthday shows the age it turns, when the year behind it is real. */
export function specialLabel(occurrence: SpecialDayOccurrence): string {
  return occurrence.age === null ? occurrence.title : `${occurrence.title} (${occurrence.age})`
}

/**
 * Which of a day's events a calendar cell names first. The days entered by
 * hand lead - they're the reason to look - then the computed observances,
 * then the days everyone has off, and time off last: its band already says
 * it's there. Within a rank, the categories' own order.
 */
function labelRank(occurrence: SpecialDayOccurrence): number {
  if (occurrence.band) return 3
  if (occurrence.source === 'holidays') return 2
  return occurrence.source === 'observances' ? 1 : 0
}

export function byLabelOrder(a: SpecialDayOccurrence, b: SpecialDayOccurrence): number {
  return labelRank(a) - labelRank(b) || a.category.order - b.category.order
}

/** "Monday, 25 May: Floo, Pfingstmontag" - a cell's tooltip and accessible name. */
export function describeDay(day: string, events: SpecialDayOccurrence[]): string {
  return `${formatDayLong(day)}: ${[...events].sort(byLabelOrder).map(specialLabel).join(', ')}`
}

/** Feb 29 has no counterpart in a common year; it lands on the 28th there. */
function projectOntoYear(startDate: string, year: number): string {
  const monthDay = startDate.slice(5)
  if (monthDay === '02-29') {
    const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
    if (!isLeap) return `${year}-02-28`
  }
  return `${year}-${monthDay}`
}

/**
 * Where an annual day lands in the year it starts in: both ends keep their
 * month/day, and a range that runs over New Year still ends in the year after.
 */
function projectSpan(day: SpecialDay, year: number): [string, string] {
  const yearsCrossed = Number(day.endDate.slice(0, 4)) - Number(day.startDate.slice(0, 4))
  return [projectOntoYear(day.startDate, year), projectOntoYear(day.endDate, year + yearsCrossed)]
}

/**
 * The last day an annual range may end on: the day before the same date a year
 * on, where its next copy starts. Mirrors the server's `checkRange`.
 */
export function lastAnnualEnd(startDate: string): string {
  // shiftDay normalises an impossible Feb 29 a year on before stepping back.
  return shiftDay(`${Number(startDate.slice(0, 4)) + 1}${startDate.slice(4)}`, -1)
}

function occurrenceOf(
  day: SpecialDay,
  category: SpecialDayCategory,
  startDate: string,
  endDate: string,
): SpecialDayOccurrence {
  const sinceYear = Number(day.startDate.slice(0, 4))
  const onYear = Number(startDate.slice(0, 4))
  return {
    id: `sd:${day.id}:${onYear}`,
    category,
    source: 'stored',
    title: day.title,
    startDate,
    endDate,
    workFree: category.dayOff,
    partial: false,
    band: category.dayOff,
    note: day.note,
    // Only meaningful for a recurring day with a real year behind it, and only
    // from its first anniversary on - the year it started reads as no count
    // rather than "(0)", and a year before it as nothing rather than "-3".
    age:
      day.recurrence === 'annual' && day.yearKnown && onYear > sinceYear
        ? onYear - sinceYear
        : null,
  }
}

/**
 * Stored days resolved onto concrete dates within a window, inclusive.
 *
 * A `none` day passes through when its range overlaps the window at all; an
 * `annual` one is projected onto every year the window touches. The window can
 * span a year boundary, so both ends' years are tried and the result filtered -
 * plus the year before, whose copy of a range over New Year reaches into it.
 *
 * A day whose category isn't in `categories` is left out: it can only be one
 * whose category was just deleted, and is about to go with it.
 */
export function expandStored(
  days: SpecialDay[],
  fromDay: string,
  toDay: string,
  categories: ReadonlyMap<string, SpecialDayCategory>,
): SpecialDayOccurrence[] {
  if (toDay < fromDay) return []

  const firstYear = Number(fromDay.slice(0, 4))
  const lastYear = Number(toDay.slice(0, 4))
  const occurrences: SpecialDayOccurrence[] = []

  for (const day of days) {
    const category = categories.get(day.categoryId)
    if (!category) continue

    if (day.recurrence === 'annual') {
      for (let year = firstYear - 1; year <= lastYear; year += 1) {
        const [start, end] = projectSpan(day, year)
        if (start <= toDay && end >= fromDay) {
          occurrences.push(occurrenceOf(day, category, start, end))
        }
      }
      continue
    }

    // Plain overlap: it starts before the window ends, and ends after it starts.
    if (day.startDate <= toDay && day.endDate >= fromDay) {
      occurrences.push(occurrenceOf(day, category, day.startDate, day.endDate))
    }
  }

  return occurrences
}

/**
 * The computed days, each put in the built-in category it belongs to. Public
 * holidays decide for themselves whether they're a day off - by law, not by
 * their category - and are never a band: everyone has them off.
 */
export function placeComputed(
  computed: ComputedDay[],
  builtin: CategoryIndex['builtin'],
): SpecialDayOccurrence[] {
  return computed.flatMap((day): SpecialDayOccurrence[] => {
    const category = builtin[day.source]
    return category ? [{ ...day, category, band: false }] : []
  })
}

/**
 * One ordered list out of the computed holidays and the stored days. Sorted by
 * start, then longest first so a vacation is laid out before the single days
 * sitting inside it, then by title to keep the order stable across renders.
 */
export function mergeOccurrences(
  ...groups: SpecialDayOccurrence[][]
): SpecialDayOccurrence[] {
  return groups.flat().sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      b.endDate.localeCompare(a.endDate) ||
      a.title.localeCompare(b.title),
  )
}

/** The occurrences covering one day, for the day-shaped screens. */
export function occurrencesOn(
  occurrences: SpecialDayOccurrence[],
  day: string,
): SpecialDayOccurrence[] {
  return occurrences.filter(
    (occurrence) => occurrence.startDate <= day && occurrence.endDate >= day,
  )
}

/**
 * The occurrences filed under every day they cover, for a grid of days. A
 * vacation lands on each of its days, clamped to the window, so a cell looks
 * up its own day rather than testing every range. Order within a day is the
 * order given.
 */
export function occurrencesByDay(
  occurrences: SpecialDayOccurrence[],
  fromDay: string,
  toDay: string,
): Map<string, SpecialDayOccurrence[]> {
  const byDay = new Map<string, SpecialDayOccurrence[]>()
  for (const occurrence of occurrences) {
    const last = occurrence.endDate < toDay ? occurrence.endDate : toDay
    let day = occurrence.startDate > fromDay ? occurrence.startDate : fromDay
    for (; day <= last; day = shiftDay(day, 1)) {
      const list = byDay.get(day)
      if (list) list.push(occurrence)
      else byDay.set(day, [occurrence])
    }
  }
  return byDay
}
