import type { GoalDocument } from '../models/goal.model'
import { SpecialDayModel } from '../models/specialDay.model'
import { SpecialDayCategoryModel } from '../models/specialDayCategory.model'
import type { TaskDocument } from '../models/task.model'
import { addDays, toDayKey } from './date'

/**
 * Vacation pauses recurring work. On a day covered by a special day whose
 * category pauses habits (Vacations, and whatever else is switched to it - Sick
 * days, say) a habit is not due: the resolver never fails it, carry never stacks
 * it, and stats leave it out unless it was ticked done anyway (see
 * src/lib/goalStats.ts). "Vacation" below means any such day.
 *
 * The rule lives here and only here on the server; the client never decides it
 * itself - it is handed each task's paused days (getTracker) or a per-row flag
 * (getDay). That keeps it independent of the sidebar's special-day filter,
 * which only hides vacations from view and must not un-pause them.
 */

/** The vacation days on record, answerable for any day without a date window. */
export interface VacationDays {
  has(day: string): boolean
  /** Every covered day from `from` to `to` inclusive, in order. */
  within(from: string, to: string): string[]
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
function projectSpan(entry: { startDate: string; endDate: string }, year: number): [string, string] {
  const yearsCrossed = Number(entry.endDate.slice(0, 4)) - Number(entry.startDate.slice(0, 4))
  return [projectOntoYear(entry.startDate, year), projectOntoYear(entry.endDate, year + yearsCrossed)]
}

/**
 * Same expansion as expandStored in src/lib/specialDays.ts: a plain day covers
 * its range, an annual one covers its range again every year. A day can sit in
 * this year's copy or in last year's, if that one runs over New Year.
 */
export async function loadVacationDays(): Promise<VacationDays> {
  const pausing = await SpecialDayCategoryModel.find({ pausesHabits: true }).select('_id')
  const stored =
    pausing.length === 0
      ? []
      : await SpecialDayModel.find({
          categoryId: { $in: pausing.map((category) => category._id) },
        }).select('startDate endDate recurrence')
  const ranges = stored.filter((day) => day.recurrence !== 'annual')
  const annual = stored.filter((day) => day.recurrence === 'annual')

  const has = (day: string): boolean => {
    const year = Number(day.slice(0, 4))
    return (
      ranges.some((range) => range.startDate <= day && range.endDate >= day) ||
      annual.some((entry) =>
        [year - 1, year].some((onYear) => {
          const [start, end] = projectSpan(entry, onYear)
          return start <= day && end >= day
        }),
      )
    )
  }

  return {
    has,
    within(from, to) {
      if (stored.length === 0) return []
      const days: string[] = []
      for (let day = from; day <= to; day = addDays(day, 1)) {
        if (has(day)) days.push(day)
      }
      return days
    },
  }
}

/**
 * Whether a task pauses on vacation days at all.
 *
 *  - A once task never does: it was put on a day on purpose.
 *  - A goal that itself starts on a vacation day was made for the trip
 *    ("prepare for return"), so its tasks keep running.
 */
export function pausesOnVacation(
  task: Pick<TaskDocument, 'frequency'>,
  goal: GoalDocument,
  vacation: VacationDays,
): boolean {
  if (task.frequency.type === 'once') return false
  return !vacation.has(toDayKey(goal.startDate ?? goal.createdAt))
}

/** The vacation calendar a task is paused by, or undefined when it never pauses. */
export function pausedBy(
  task: Pick<TaskDocument, 'frequency'>,
  goal: GoalDocument,
  vacation: VacationDays,
): VacationDays | undefined {
  return pausesOnVacation(task, goal, vacation) ? vacation : undefined
}
