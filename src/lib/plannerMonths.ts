import { isoWeek } from './date'

/*
 * The calendar's strip of months, as numbers. Every month in reach has an
 * index - its column in the strip - counted from January of the first year,
 * so scrolling, windowing and "where was I" are all plain integer maths.
 */

/** How far the strip reaches either side of the current year. */
export const PLANNER_YEARS = 10

/** Fixed when the app loads, so an index means the same month all session. */
const ORIGIN_YEAR = new Date().getFullYear() - PLANNER_YEARS

export const MONTH_COUNT = (PLANNER_YEARS * 2 + 1) * 12

export interface PlannerDay {
  key: string
  date: number
  /** `Date.getDay()`: 0 is Sunday. */
  weekday: number
  /** The KW, on Mondays only - the row a week starts on. */
  week: number | null
}

export interface PlannerMonth {
  index: number
  /** `YYYY-MM`. */
  key: string
  year: number
  /** 0-11, as `Date` counts them. */
  month: number
  days: PlannerDay[]
}

export function monthIndex(year: number, month: number): number {
  return (year - ORIGIN_YEAR) * 12 + month
}

export function monthAt(index: number): { year: number; month: number } {
  return { year: ORIGIN_YEAR + Math.floor(index / 12), month: ((index % 12) + 12) % 12 }
}

export function monthKeyAt(index: number): string {
  const { year, month } = monthAt(index)
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

/** The index of a `YYYY-MM` key, or null when it isn't one or is out of reach. */
export function indexOfKey(key: string): number | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key)
  if (!match) return null
  const month = Number(match[2]) - 1
  if (month < 0 || month > 11) return null
  const index = monthIndex(Number(match[1]), month)
  return index >= 0 && index < MONTH_COUNT ? index : null
}

/** A leading month that still leaves a full screen of months after it. */
export function clampLead(lead: number, perScreen: number): number {
  return Math.min(Math.max(lead, 0), MONTH_COUNT - perScreen)
}

/** The month that contains a `YYYY-MM-DD` key. */
export function indexOfDay(day: string): number {
  return monthIndex(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1)
}

/**
 * Where the strip opens: the page of the current year that holds today. A
 * year to a screen opens on January; half a year on July (from July on);
 * a quarter on today's quarter.
 */
export function homeLead(perScreen: number, today: string): number {
  const month = Number(today.slice(5, 7)) - 1
  return monthIndex(Number(today.slice(0, 4)), Math.floor(month / perScreen) * perScreen)
}

/** Months are pure functions of their index; built once each and kept. */
const built = new Map<number, PlannerMonth>()

export function buildMonth(index: number): PlannerMonth {
  const cached = built.get(index)
  if (cached) return cached

  const { year, month } = monthAt(index)
  const first = new Date(year, month, 1)
  const length = new Date(year, month + 1, 0).getDate()
  const key = monthKeyAt(index)
  const days = Array.from({ length }, (_, offset): PlannerDay => {
    const dayKey = `${key}-${String(offset + 1).padStart(2, '0')}`
    const weekday = (first.getDay() + offset) % 7
    return { key: dayKey, date: offset + 1, weekday, week: weekday === 1 ? isoWeek(dayKey) : null }
  })

  const result = { index, key, year, month, days }
  built.set(index, result)
  return result
}
