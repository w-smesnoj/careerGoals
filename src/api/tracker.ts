import { apiFetch } from '../lib/apiClient'
import type { Goal, GoalStatus } from './goals'
import type { GoalResolution } from './goalResolutions'
import type {
  Task,
  TaskDayResolution,
  TaskFrequency,
  TaskLimitDirection,
  TaskLimitMeasure,
  TaskLimitPeriod,
} from './tasks'
import type { UnitAggregation } from './trackingUnits'

export const completionStatuses = ['done', 'failed'] as const
/** `null` means the day is still unanswered. */
export type CompletionStatus = (typeof completionStatuses)[number]

/** Same as `CompletionStatus`, but with `null` (unanswered) spelled out as
 *  'todo' - the sidebar filter needs a real key for every row, including the
 *  unanswered one. */
export const taskStatusFilters = ['todo', 'done', 'failed'] as const
export type TaskStatusFilter = (typeof taskStatusFilters)[number]

/** What happened on one day: the status, plus the reason if it failed. */
export interface DayEntry {
  status: CompletionStatus
  note: string
  /** Resolved by the day resolver rather than answered by hand. */
  auto: boolean
}

export interface TrackerTask extends Task {
  completions: Record<string, DayEntry>
  /** Days in the loaded window this task is paused for vacation (see lib/vacation.ts). */
  pausedDays?: string[]
}

export interface TrackerGoal extends Goal {
  /** Set once the goal has been resolved; the goal is greyed, never removed. */
  resolution: GoalResolution | null
  tasks: TrackerTask[]
}

export interface TrackerRange {
  from: string
  to: string
  days: string[]
  goals: TrackerGoal[]
}

/** A limit task's running figure for the period the day falls in - Today's budget bar. */
export interface DayTaskLimit {
  unit: DayTaskUnit
  direction: TaskLimitDirection
  target: number
  period: TaskLimitPeriod
  measure: TaskLimitMeasure
  /** The second unit a daily limit wants logged, and whether this day has it. */
  alsoLogged: { unit: DayTaskUnit; logged: boolean } | null
  /** The day the limit took effect; days before it were answered by hand. */
  since: string
  /**
   * Total so far: the day's, or Monday through the day for a weekly limit. For
   * an average, the mean of the days logged so far that week.
   */
  used: number
  /** Anything logged in the period at all, a 0 included. */
  hasData: boolean
  /** The period is over, so the figure won't move again. */
  final: boolean
}

/** A tracking unit a task asks for when it's ticked. */
export interface DayTaskUnit {
  id: string
  name: string
  symbol: string
  decimals: number
  /** 'latest' shows one editable reading (weight); 'sum' accumulates several. */
  aggregation: UnitAggregation
}

/** One reading, as the day screen carries it. */
export interface DayMeasurement {
  value: number
  note: string
}

/** One reading against an attached unit today, wherever it came from - a hand
 *  entry on the tracking page as much as any task's own tick. What a 'sum'
 *  unit's chip totals up and its log sheet lists. */
export interface DayUnitReading {
  id: string
  value: number
  note: string
  taskId: string | null
  /** The task that produced this, when one did - null for a hand entry. */
  taskTitle: string | null
}

/** A value being written for one unit as part of ticking a task off. */
export interface MeasurementInput {
  unitId: string
  value: number
  note?: string
}

/** One task as it appears on the mobile day screen. */
export interface DayTask {
  id: string
  title: string
  goalId: string
  goalTitle: string
  /** 'completed' means the goal was resolved - the row greys out rather than leaving. */
  goalStatus: GoalStatus
  /** The goal's categories, so the day screen can filter without a second request. */
  categories: string[]
  frequency: TaskFrequency
  /** What happens to this day if it's never answered. */
  dayResolution: TaskDayResolution
  status: CompletionStatus | null
  note: string
  /** On vacation: not owed today, though a tick still counts. */
  paused?: boolean
  /** A 'once' task's last day - its goal's due date. Null when the goal has
   *  none (it then stays on Today until ticked), and always for a recurring task. */
  deadline?: string | null
  /** Set when the task is judged from a unit's readings rather than ticked. */
  limit?: DayTaskLimit | null
  /** What ticking this task asks for. Empty for most tasks. */
  units: DayTaskUnit[]
  /** What's already recorded for this day, keyed by unit id. */
  measurements: Record<string, DayMeasurement>
}

/**
 * A day a carry-over task still owes an answer for, surfaced on Today above
 * the day's own list. One row per task - the oldest outstanding day, with the
 * rest stacked behind it - and answering it writes to `dueDate`, not to today.
 */
export interface DueTask {
  id: string
  title: string
  goalId: string
  goalTitle: string
  goalStatus: GoalStatus
  categories: string[]
  frequency: TaskFrequency
  /**
   * Offered when the row is ticked, but never prefilled: nothing was recorded
   * on a day that was never answered, and the day screen's `unitReadings` are
   * today's, not `dueDate`'s.
   */
  units: DayTaskUnit[]
  /** The day being answered - the oldest one still outstanding. */
  dueDate: string
  daysLate: number
  /** How many days are outstanding in total, this one included. */
  stacked: number
}

/** A weekly/monthly task not due today, previewed by its next occurrence. */
export interface UpcomingTask {
  id: string
  title: string
  goalId: string
  goalTitle: string
  goalStatus: GoalStatus
  categories: string[]
  frequency: TaskFrequency
  dueDate: string
  daysUntil: number
}

export interface TrackerDay {
  date: string
  tasks: DayTask[]
  /** Carried-over days still owed. Only ever populated when `date` is today. */
  due: DueTask[]
  upcoming: UpcomingTask[]
  /** Keyed by unit id - every reading recorded against it today. */
  unitReadings: Record<string, DayUnitReading[]>
}

export interface Completion {
  id: string
  taskId: string
  date: string
  status: CompletionStatus
  note: string
  auto: boolean
}

export const trackerApi = {
  /**
   * Everything there is, in one request. The server decides the span from the
   * data itself - the date window on screen is a view control, not a fetch
   * control, so panning never runs into blank days that had data behind them.
   */
  range: () => apiFetch<TrackerRange>('/tracker'),
  day: (date: string) => apiFetch<TrackerDay>(`/tracker/day?date=${date}`),
  /**
   * `measurements` omitted leaves the day's readings alone, `[]` clears them,
   * and a list replaces them - the same three cases the server distinguishes
   * (see setCompletion in tracker.controller.ts). The timeline never passes it,
   * so ticking a cell there can't wipe a value entered on the day screen.
   */
  set: (
    taskId: string,
    date: string,
    status: CompletionStatus,
    note = '',
    measurements?: MeasurementInput[],
  ) =>
    apiFetch<Completion>(`/tasks/${taskId}/completions/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ status, note, ...(measurements ? { measurements } : {}) }),
    }),
  /** Back to unanswered. */
  clear: (taskId: string, date: string) =>
    apiFetch<void>(`/tasks/${taskId}/completions/${date}`, { method: 'DELETE' }),
}
