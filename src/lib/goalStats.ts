import type { TrackerGoal, TrackerTask } from '../api/tracker'
import type { ResolutionStats } from '../api/goalResolutions'
import { dayCount, shiftDay, todayKey } from './date'
import { isScheduledOn } from './schedule'
import { isPausedOn } from './vacation'
import { dayHeatMap, type DayHeat } from './dayHeat'

export interface TaskStats {
  id: string
  title: string
  done: number
  failed: number
  /** Scheduled days that were never answered either way. */
  missed: number
  possible: number
  rate: number
}

export interface GoalStats {
  /** Percentage of scheduled days actually ticked, 0-100. */
  rate: number
  done: number
  failed: number
  missed: number
  possible: number
  taskCount: number
  startDay: string
  dueDay: string | null
  /** Start through today, or through the due date once that has passed. */
  daysElapsed: number
  /** Start through due date, or null when the goal has no due date. */
  daysPlanned: number | null
  daysUntilDue: number | null
  /** Past its due date and not yet resolved - the state "resolve" exists for. */
  overdue: boolean
  resolved: boolean
  dueLabel: string
  perTask: TaskStats[]
}

function rateOf(done: number, possible: number): number {
  return possible === 0 ? 0 : Math.round((done / possible) * 100)
}

/** A goal's active window: from its start (or creation) through its due date, if any. */
export function goalDateRange(goal: TrackerGoal): { startDay: string; dueDay: string | null } {
  return {
    startDay: (goal.startDate ?? goal.createdAt).slice(0, 10),
    dueDay: goal.targetDate?.slice(0, 10) ?? null,
  }
}

/**
 * One task's record over the window it could actually be judged on: from the
 * later of its own creation and the goal's start, to the earlier of today and
 * the goal's due date.
 *
 * Clamping to that window is the whole point. The tracker now loads a goal's
 * entire history rather than a month of it, so counting every fetched day as a
 * missed opportunity would score a task against days before it existed.
 */
function taskStats(task: TrackerTask, from: string, to: string): TaskStats {
  // A once task is a single opportunity that isn't pinned to a day, so it's
  // counted as one, whenever it was answered.
  if (task.frequency.type === 'once') {
    const entries = Object.values(task.completions)
    const done = entries.some((entry) => entry.status === 'done') ? 1 : 0
    const failed = !done && entries.some((entry) => entry.status === 'failed') ? 1 : 0
    return {
      id: task.id,
      title: task.title,
      done,
      failed,
      missed: 1 - done - failed,
      possible: 1,
      rate: done * 100,
    }
  }

  const taskFrom = task.createdAt.slice(0, 10) > from ? task.createdAt.slice(0, 10) : from
  let possible = 0
  let done = 0
  let failed = 0

  for (let day = taskFrom; day <= to; day = shiftDay(day, 1)) {
    if (!isScheduledOn(task.frequency, day)) continue
    const status = task.completions[day]?.status
    // A vacation day is only an opportunity if it was taken.
    if (isPausedOn(task, day)) {
      if (status === 'done') {
        possible += 1
        done += 1
      }
      continue
    }
    possible += 1
    if (status === 'done') done += 1
    else if (status === 'failed') failed += 1
  }

  return {
    id: task.id,
    title: task.title,
    done,
    failed,
    missed: possible - done - failed,
    possible,
    rate: rateOf(done, possible),
  }
}

/**
 * The one implementation of "how is this goal going". Used by the timeline's
 * sidebar, the goals screen, and the resolve dialog - which also snapshots it
 * onto the resolution, so the figures survive the tasks being deleted later.
 */
export function goalStats(goal: TrackerGoal, today = todayKey()): GoalStats {
  const { startDay, dueDay } = goalDateRange(goal)
  // Nothing after today counts yet, and nothing after the due date ever will.
  const windowEnd = dueDay && dueDay < today ? dueDay : today

  const perTask = goal.tasks.map((task) => taskStats(task, startDay, windowEnd))
  const sum = (pick: (stats: TaskStats) => number) =>
    perTask.reduce((total, stats) => total + pick(stats), 0)

  const done = sum((stats) => stats.done)
  const possible = sum((stats) => stats.possible)
  const resolved = goal.resolution !== null

  return {
    rate: rateOf(done, possible),
    done,
    failed: sum((stats) => stats.failed),
    missed: sum((stats) => stats.missed),
    possible,
    taskCount: goal.tasks.length,
    startDay,
    dueDay,
    daysElapsed: dayCount(startDay, windowEnd),
    daysPlanned: dueDay ? dayCount(startDay, dueDay) : null,
    daysUntilDue: dueDay ? dayCount(today, dueDay) - 1 : null,
    overdue: Boolean(dueDay && dueDay < today) && !resolved,
    resolved,
    dueLabel: goal.targetDate
      ? `due ${new Date(goal.targetDate).toLocaleDateString()}`
      : 'no due date',
    perTask,
  }
}

/** The subset of the figures that gets frozen onto a resolution. */
export function toResolutionStats(stats: GoalStats): ResolutionStats {
  return {
    rate: stats.rate,
    done: stats.done,
    failed: stats.failed,
    missed: stats.missed,
    possible: stats.possible,
    taskCount: stats.taskCount,
    daysElapsed: stats.daysElapsed,
    daysPlanned: stats.daysPlanned,
  }
}

/** Every filter open - a goal's own page shows all of it, whatever the sidebar hides. */
const ALL_VISIBLE = { isVisible: () => true, isGoalStatusVisible: () => true }

/** The days a goal can be judged on so far: its start through today, or its due date. */
export function goalDays(goal: TrackerGoal, today = todayKey()): string[] {
  const { startDay, dueDay } = goalDateRange(goal)
  const end = dueDay && dueDay < today ? dueDay : today
  const days: string[] = []
  for (let day = startDay; day <= end; day = shiftDay(day, 1)) days.push(day)
  return days
}

/** One goal's calendar: how each of its days went (see dayHeatMap). */
export function goalHeat(goal: TrackerGoal, today = todayKey()): Map<string, DayHeat> {
  return dayHeatMap([goal], goalDays(goal, today), ALL_VISIBLE, today)
}

export interface GoalStreaks {
  /** Fully-done days in a row, up to today. */
  current: number
  best: number
}

/**
 * Runs of fully-done days - every task due that day done. A day with nothing
 * due neither extends nor breaks a run, and today only counts once it's
 * complete: an unfinished today is still in play, not a broken streak.
 */
export function goalStreaks(heat: Map<string, DayHeat>, days: string[], today = todayKey()): GoalStreaks {
  let run = 0
  let best = 0
  for (const day of days) {
    const entry = heat.get(day)
    if (!entry) continue
    if (entry.done === entry.scheduled) {
      run += 1
      best = Math.max(best, run)
    } else if (day !== today) {
      run = 0
    }
  }
  // The run still open at the end of the window is the current one - unless
  // the last judged day broke it.
  let current = 0
  for (let index = days.length - 1; index >= 0; index -= 1) {
    const entry = heat.get(days[index])
    if (!entry) continue
    if (entry.done === entry.scheduled) current += 1
    else if (days[index] === today) continue
    else break
  }
  return { current, best }
}

export type TaskDayMark = 'done' | 'failed' | 'open' | 'none'

/**
 * One task's last seven days for a row's dot strip: done, failed, due and
 * unanswered, or not due at all - in the same window rules as its stats.
 */
export function taskWeek(task: TrackerTask, goal: TrackerGoal, today = todayKey()): { day: string; mark: TaskDayMark }[] {
  const { startDay, dueDay } = goalDateRange(goal)
  const taskFrom = task.createdAt.slice(0, 10) > startDay ? task.createdAt.slice(0, 10) : startDay
  return Array.from({ length: 7 }, (_, index) => {
    const day = shiftDay(today, index - 6)
    const entry = task.completions[day]
    if (entry) return { day, mark: entry.status }
    const due =
      day >= taskFrom &&
      (!dueDay || day <= dueDay) &&
      task.frequency.type !== 'once' &&
      isScheduledOn(task.frequency, day) &&
      !isPausedOn(task, day)
    return { day, mark: due ? 'open' : 'none' }
  })
}
