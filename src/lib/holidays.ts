import Holidays, { type HolidaysTypes } from 'date-holidays'
import type { BuiltinCategory, SpecialDayOccurrence } from '../api/specialDays'
import { dayStart, isWeekend, shiftDay } from './date'

/**
 * The only file that knows `date-holidays` exists. Everything else consumes
 * `SpecialDayOccurrence`, so swapping the source stays a one-file change.
 *
 * Each day says which built-in category it lands in (`source`); pairing it with
 * that category is lib/specialDays' `placeComputed`, so this cache never holds
 * a category that might since have been renamed or recoloured.
 *
 * Holidays are computed, never stored: changing Bundesland re-derives them on
 * the spot, needs no migration, and can't leave a stale row behind.
 */

/**
 * `getHolidays` returns every observance it knows - Valentinstag, Muttertag,
 * all four Advent Sundays - which would bury the real days. Only these two
 * kinds are days the calendar actually turns on:
 *
 *  - `public` is a statutory holiday: work-free, and highlighted as such.
 *  - `bank` is Heiliger Abend and Silvester: worth seeing, but *not* a day off,
 *    so they're shown without the work-free highlight.
 *
 * Deliberately excluded: `school` (Buß- und Bettag outside Sachsen), `optional`
 * and `observance`.
 */
const SHOWN_TYPES: ReadonlySet<HolidaysTypes.HolidayType> = new Set(['public', 'bank'])

/**
 * The few rules surfaced as occasions instead, keyed by the package's rule
 * string. They move every year, so an `annual` stored day (fixed month/day)
 * can't stand in for them. Vatertag has no rule of its own: in Germany it *is*
 * Christi Himmelfahrt, so it rides on that holiday's rule as a second entry.
 */
const OCCASION_RULES: ReadonlyMap<string, string> = new Map([
  ['2nd sunday in May', 'Muttertag'],
  ['easter 39', 'Vatertag'],
])

/**
 * Building a `Holidays` parses the whole country dataset, and `getHolidays`
 * walks every rule for the year - both far too expensive to repeat on each of
 * the timeline's relayouts. Keyed by Bundesland, then by year.
 */
const byState = new Map<string, Holidays>()
const byYear = new Map<string, ComputedDay[]>()

/** An occurrence still waiting for its category. */
export type ComputedDay = Omit<SpecialDayOccurrence, 'category' | 'band'> & {
  source: BuiltinCategory
}

function instanceFor(state: string): Holidays {
  let instance = byState.get(state)
  if (!instance) {
    // No Bundesland chosen yet: the nine nationwide holidays, and nothing regional.
    instance = state ? new Holidays('DE', state) : new Holidays('DE')
    byState.set(state, instance)
  }
  return instance
}

function occurrencesForYear(year: number, state: string): ComputedDay[] {
  const cacheKey = `${state}:${year}`
  const cached = byYear.get(cacheKey)
  if (cached) return cached

  const holidays = instanceFor(state).getHolidays(year)

  const occasions = holidays.flatMap((holiday): ComputedDay[] => {
    const title = OCCASION_RULES.get(holiday.rule)
    if (!title) return []
    const day = holiday.date.slice(0, 10)
    return [
      {
        id: `hd:${day}:${title}`,
        source: 'observances',
        title,
        startDate: day,
        endDate: day,
        workFree: false,
        partial: false,
        note: '',
        age: null,
      },
    ]
  })

  const occurrences = holidays
    .filter((holiday) => SHOWN_TYPES.has(holiday.type))
    .map((holiday): ComputedDay => {
      // `date` is "YYYY-MM-DD hh:mm:ss"; the half-days (Heiliger Abend, Silvester)
      // carry a 14:00 start, which is still the same calendar day.
      const day = holiday.date.slice(0, 10)
      return {
        id: `hd:${day}:${holiday.rule}`,
        source: 'holidays',
        title: holiday.name,
        startDate: day,
        endDate: day,
        workFree: holiday.type === 'public',
        partial: holiday.type === 'bank',
        note: '',
        age: null,
      }
    })
    .concat(occasions)

  byYear.set(cacheKey, occurrences)
  return occurrences
}

/**
 * Every shown German holiday between two `YYYY-MM-DD` keys, inclusive, for the
 * given Bundesland (`''` for nationwide only).
 */
export function holidayOccurrences(
  fromDay: string,
  toDay: string,
  state: string,
): ComputedDay[] {
  if (toDay < fromDay) return []

  const firstYear = Number(fromDay.slice(0, 4))
  const lastYear = Number(toDay.slice(0, 4))

  const occurrences: ComputedDay[] = []
  for (let year = firstYear; year <= lastYear; year += 1) {
    for (const occurrence of occurrencesForYear(year, state)) {
      if (occurrence.startDate >= fromDay && occurrence.startDate <= toDay) {
        occurrences.push(occurrence)
      }
    }
  }
  return occurrences
}

/**
 * Monday to Friday, minus the public holidays of the chosen Bundesland.
 * Heiligabend and Silvester are bank days, not holidays, so they count as
 * working days like any other.
 */
export function workingDays(from: string, to: string, bundesland: string): string[] {
  if (to < from) return []
  const holidays = new Set(
    holidayOccurrences(from, to, bundesland)
      .filter((holiday) => holiday.workFree)
      .map((holiday) => holiday.startDate),
  )
  const days: string[] = []
  for (let day = from; day <= to; day = shiftDay(day, 1)) {
    if (!isWeekend(new Date(dayStart(day)).getDay()) && !holidays.has(day)) days.push(day)
  }
  return days
}

export interface Bundesland {
  code: string
  name: string
}

/**
 * The sixteen Bundesländer, from the package rather than a list of our own, so
 * the picker can't drift from the data behind it.
 */
export function bundeslaender(): Bundesland[] {
  const states = instanceFor('').getStates('DE')
  return Object.entries(states)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
}
