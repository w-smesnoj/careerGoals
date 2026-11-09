import { apiFetch } from '../lib/apiClient'

/**
 * The hues a category can wear - `--hue-*` in src/index.css. Mirrored in
 * `server/src/models/specialDayCategory.model.ts` - keep the two in sync by hand.
 */
export const specialDayHues = [
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'indigo',
  'pink',
  'brown',
  'slate',
] as const
export type SpecialDayHue = (typeof specialDayHues)[number]

/** The glyphs a category's tile can show (components/specialDayGlyphs.tsx). Mirrored likewise. */
export const specialDayIcons = [
  'flag',
  'sun',
  'gift',
  'star',
  'heart',
  'music',
  'thermometer',
  'plane',
  'briefcase',
  'sparkle',
  'graduation',
  'home',
  'ticket',
  'leaf',
  'trophy',
  'moon',
] as const
export type SpecialDayIcon = (typeof specialDayIcons)[number]

/**
 * Which computed days a built-in category receives: the Bundesland's public
 * holidays, or the moving observances (Muttertag, Vatertag). Both come from
 * `src/lib/holidays.ts` and are never stored.
 */
export type BuiltinCategory = 'holidays' | 'observances'

/**
 * What a special day is - Birthdays, Vacations, Sick days. The calendar's
 * filter is the list of these, and what a day does to the rest of the app
 * (time off, paused habits) is its category's to say.
 */
export interface SpecialDayCategory {
  id: string
  name: string
  color: SpecialDayHue
  icon: SpecialDayIcon
  order: number
  /** Its days are time off: a tinted band, not counted as working days. */
  dayOff: boolean
  /** Recurring habits aren't due on its days (decided on the server). */
  pausesHabits: boolean
  builtin: BuiltinCategory | null
  createdAt: string
  updatedAt: string
}

export interface SpecialDayCategoryInput {
  name: string
  color: SpecialDayHue
  icon: SpecialDayIcon
  dayOff?: boolean
  pausesHabits?: boolean
}

export type SpecialDayRecurrence = 'none' | 'annual'

export interface SpecialDay {
  id: string
  categoryId: string
  title: string
  startDate: string
  /** Always present; equal to `startDate` for a single day. */
  endDate: string
  recurrence: SpecialDayRecurrence
  /** Whether the start date's year is real, and so counted from - an age, an anniversary. */
  yearKnown: boolean
  note: string
  createdAt: string
  updatedAt: string
}

export interface SpecialDayInput {
  categoryId: string
  title: string
  startDate: string
  endDate?: string
  recurrence?: SpecialDayRecurrence
  yearKnown?: boolean
  note?: string
}

/**
 * One resolved appearance of a special day on the calendar - a stored day
 * projected onto a concrete year, or a computed holiday - already paired with
 * its category. This is the only shape the screens deal with, so the
 * timeline, Today and Upcoming can't disagree about what a day means.
 */
export interface SpecialDayOccurrence {
  /** Stable per occurrence: `sd:<id>:<year>` for stored, `hd:<date>:<name>` for holidays. */
  id: string
  category: SpecialDayCategory
  /** Entered by hand, or computed for the Bundesland. */
  source: 'stored' | BuiltinCategory
  title: string
  startDate: string
  endDate: string
  /** A guaranteed day off: a statutory holiday, or a day in a day-off category. */
  workFree: boolean
  /** Observed but not a day off - Heiliger Abend and Silvester are bank days. */
  partial: boolean
  /**
   * Time off you took (a stored day in a day-off category): drawn as a tinted
   * band, named where it starts, rather than named on every day it covers.
   */
  band: boolean
  note: string
  /** Years since the start date, when its year is real and it recurs; null otherwise. */
  age: number | null
}

export const specialDaysApi = {
  list: () => apiFetch<SpecialDay[]>('/special-days'),
  create: (input: SpecialDayInput) =>
    apiFetch<SpecialDay>('/special-days', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: Partial<SpecialDayInput>) =>
    apiFetch<SpecialDay>(`/special-days/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string) => apiFetch<void>(`/special-days/${id}`, { method: 'DELETE' }),
}

export const specialDayCategoriesApi = {
  list: () => apiFetch<SpecialDayCategory[]>('/special-day-categories'),
  create: (input: SpecialDayCategoryInput) =>
    apiFetch<SpecialDayCategory>('/special-day-categories', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  update: (id: string, input: Partial<SpecialDayCategoryInput>) =>
    apiFetch<SpecialDayCategory>(`/special-day-categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  remove: (id: string) => apiFetch<void>(`/special-day-categories/${id}`, { method: 'DELETE' }),
}
