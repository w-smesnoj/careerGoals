import type { GoalStatus } from '../api/goals'
import type { TrackerGoal } from '../api/tracker'
import { todayKey } from './date'
import { goalDateRange } from './goalStats'
import { isScheduledOn } from './schedule'
import { isPausedOn } from './vacation'

/** How one day went: what it asked for, and how much of it got done. */
export interface DayHeat {
  done: number
  /** Tasks that were due that day, answered or not. Never 0 - a day with
   *  nothing due gets no entry at all. */
  scheduled: number
  /** 0 = nothing done, 4 = everything done. Drives the heatmap's brightness. */
  level: 0 | 1 | 2 | 3 | 4
}

/** The subset of `usePrefs()` the fold needs - passed in so this stays pure. */
export interface DayHeatFilters {
  isVisible: (categories: string[]) => boolean
  isGoalStatusVisible: (status: GoalStatus) => boolean
}

/** Completion rate to one of five buckets. Anything above zero shows colour,
 *  so a single tick on a heavy day still reads as progress. */
function levelOf(done: number, scheduled: number): DayHeat['level'] {
  if (done === 0) return 0
  const rate = done / scheduled
  if (rate <= 0.25) return 1
  if (rate <= 0.5) return 2
  if (rate <= 0.75) return 3
  return 4
}

/**
 * Per-day done/scheduled counts for the given days, folded out of the tracker
 * range the sidebar already has in cache. Days with nothing due are left out of
 * the map entirely - an empty day is "nothing was asked of you", not a zero.
 *
 * The window rules mirror `taskStats` in goalStats.ts: a task is only judged on
 * days it existed for, inside its goal's own start-to-due window, and never in
 * the future.
 */
export function dayHeatMap(
  goals: TrackerGoal[],
  days: string[],
  filters: DayHeatFilters,
  today = todayKey(),
): Map<string, DayHeat> {
  const counts = new Map<string, { done: number; scheduled: number }>()

  const bump = (day: string, done: boolean) => {
    const current = counts.get(day) ?? { done: 0, scheduled: 0 }
    current.scheduled += 1
    if (done) current.done += 1
    counts.set(day, current)
  }

  for (const goal of goals) {
    if (!filters.isGoalStatusVisible(goal.status)) continue
    if (!filters.isVisible(goal.categories)) continue

    const { startDay, dueDay } = goalDateRange(goal)

    for (const task of goal.tasks) {
      const taskFrom = task.createdAt.slice(0, 10) > startDay ? task.createdAt.slice(0, 10) : startDay

      for (const day of days) {
        if (day < taskFrom || day > today) continue
        if (dueDay && day > dueDay) continue

        // A once task is a single opportunity that isn't pinned to a day, so
        // `isScheduledOn` says yes to all of them. Count it only where it was
        // actually answered, or it would drag down every day of the month.
        if (task.frequency.type === 'once') {
          const entry = task.completions[day]
          if (entry) bump(day, entry.status === 'done')
          continue
        }

        if (!isScheduledOn(task.frequency, day)) continue
        const done = task.completions[day]?.status === 'done'
        // Paused for vacation: counts if done, otherwise isn't due at all.
        if (isPausedOn(task, day) && !done) continue
        bump(day, done)
      }
    }
  }

  const heat = new Map<string, DayHeat>()
  for (const [day, { done, scheduled }] of counts) {
    heat.set(day, { done, scheduled, level: levelOf(done, scheduled) })
  }
  return heat
}

/** "3 of 5 done" - a day's heat in words, where a colour or a ring can't say it exactly. */
export function completionLabel(heat: DayHeat): string {
  return `${heat.done} of ${heat.scheduled} done`
}

/** A run of days summed up - what a month of the calendar adds up to. */
export interface HeatTotals {
  done: number
  scheduled: number
  /** Share of everything due that got done, 0-100. */
  rate: number
  /** Days anything was due on. */
  days: number
  /** Days everything due got done. */
  fullDays: number
}

/** The totals over `days`, or null when nothing was due on any of them. */
export function heatTotals(heat: Map<string, DayHeat>, days: string[]): HeatTotals | null {
  let done = 0
  let scheduled = 0
  let judged = 0
  let fullDays = 0
  for (const day of days) {
    const entry = heat.get(day)
    if (!entry) continue
    done += entry.done
    scheduled += entry.scheduled
    judged += 1
    if (entry.done === entry.scheduled) fullDays += 1
  }
  if (scheduled === 0) return null
  return { done, scheduled, rate: Math.round((done / scheduled) * 100), days: judged, fullDays }
}
