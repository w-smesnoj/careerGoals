import { apiFetch, type RequestOptions } from '../lib/apiClient'

export const taskFrequencyTypes = ['once', 'daily', 'weekly', 'monthly', 'everyNDays'] as const
export type TaskFrequencyType = (typeof taskFrequencyTypes)[number]

/**
 * `once` isn't date-keyed - it stays an outstanding to-do every day until it
 * has a completion. If its goal has a target date, the task's single chance runs
 * out when that date passes (see dayResolution); without one it waits indefinitely.
 *
 * `everyNDays` counts from `anchorDate`, the first occurrence. That field is
 * the server's to set - it resolves the weekday the user picked into a real
 * date when the task is saved - so it's present on everything read back and
 * absent from everything sent; see TaskFrequencyInput.
 *
 * Mirrors TaskFrequency in server/src/models/task.model.ts - keep the two in
 * sync by hand.
 */
export type TaskFrequency =
  | { type: 'once' }
  | { type: 'daily' }
  | { type: 'weekly'; daysOfWeek: number[] }
  | { type: 'monthly'; daysOfMonth: number[] }
  | { type: 'everyNDays'; intervalDays: number; startWeekday: number; anchorDate: string }

/**
 * A frequency as it goes out: the same union with the server-owned `anchorDate`
 * omitted.
 *
 * The distinction is load-bearing rather than pedantic. tsconfig.app.json isn't
 * strict, so a merely-optional `anchorDate` would let `day < undefined` compile
 * in isScheduledOn, evaluate false for every day, and silently schedule the
 * task nowhere at all.
 */
export type TaskFrequencyInput =
  | Exclude<TaskFrequency, { type: 'everyNDays' }>
  | Omit<Extract<TaskFrequency, { type: 'everyNDays' }>, 'anchorDate'>

export const taskDayResolutions = ['open', 'fail', 'carry'] as const

/**
 * What becomes of a scheduled day the user never answered.
 *
 * 'open'  - nothing; it stays unanswered forever. The original behaviour.
 * 'fail'  - once the day is past it resolves to a failed completion.
 * 'carry' - the day stacks forward and shows on Today as due until it's
 *           answered on its own date; whatever is still outstanding when the
 *           goal's target date has passed is failed automatically.
 *
 * Mirrors TaskDayResolution in server/src/models/task.model.ts - keep the two
 * in sync by hand.
 */
export type TaskDayResolution = (typeof taskDayResolutions)[number]

/** What each mode is called, and what it does, wherever one is offered. */
export const dayResolutionLabels: Record<TaskDayResolution, { label: string; hint: string }> = {
  open: { label: 'Leave open', hint: 'A day you never answer just stays blank.' },
  fail: { label: 'Mark as failed', hint: 'Once the day is past, it counts as a fail.' },
  carry: {
    label: 'Carry over',
    hint: 'It stays due on Today until you answer it. Anything still open when the goal is past due fails automatically.',
  },
}

export const taskLimitPeriods = ['day', 'week'] as const
export type TaskLimitPeriod = (typeof taskLimitPeriods)[number]

/** 'atMost' caps a total (coffees); 'atLeast' asks for one (steps). */
export const taskLimitDirections = ['atMost', 'atLeast'] as const
export type TaskLimitDirection = (typeof taskLimitDirections)[number]

/** 'total' adds readings up (coffees); 'average' averages each day's figure over a week (sleep). */
export const taskLimitMeasures = ['total', 'average'] as const
export type TaskLimitMeasure = (typeof taskLimitMeasures)[number]

/**
 * "At most / at least `target` of a unit's day figure", "... of a 'sum' unit
 * per Mon-Sun week", or of any unit's daily figure averaged over a week, judged from the unit's
 * readings instead of ticked. `since` is set by the server: the day it took
 * effect, before which the task's old answers stand.
 *
 * Mirrors TaskLimit in server/src/models/task.model.ts - keep the two in sync by hand.
 */
export interface TaskLimit {
  unitId: string
  direction: TaskLimitDirection
  target: number
  period: TaskLimitPeriod
  /** 'average' only ever goes with a 'week' period. */
  measure: TaskLimitMeasure
  /** A second unit that must also have a reading that day. Only with a 'day' period. */
  alsoLoggedUnitId: string | null
  since: string
}

export type TaskLimitInput = Omit<TaskLimit, 'since'> & {
  /** Judge every day since the task started too, replacing their old answers. */
  fromStart?: boolean
}

/** A Task belongs to one Goal and recurs according to its frequency. */
export interface Task {
  id: string
  title: string
  goalId: string
  archived: boolean
  /** Global row position on the day screen; lower sorts first. */
  order: number
  frequency: TaskFrequency
  /** Tracking units this task asks for when it's ticked; empty for most tasks. */
  unitIds: string[]
  /** What happens to a scheduled day that's never answered. */
  dayResolution: TaskDayResolution
  /** Judged from a unit's readings instead of ticked; null for most tasks. */
  limit: TaskLimit | null
  createdAt: string
  updatedAt: string
}

export interface TaskInput {
  title: string
  goalId: string
  archived?: boolean
  frequency?: TaskFrequencyInput
  unitIds?: string[]
  dayResolution?: TaskDayResolution
  /** Update only; null removes it. */
  limit?: TaskLimitInput | null
  /**
   * Create only, and only for a once task: backdates it to a day already gone
   * by (no later than today, no earlier than its goal) so it can be logged as
   * done on that day in one go.
   */
  startDay?: string
}

export const tasksApi = {
  list: (goalId?: string) =>
    apiFetch<Task[]>(`/tasks${goalId ? `?goalId=${goalId}` : ''}`),
  create: (input: TaskInput) =>
    apiFetch<Task>('/tasks', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: Partial<TaskInput>, options?: RequestOptions) =>
    apiFetch<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(input), ...options }),
  remove: (id: string) => apiFetch<void>(`/tasks/${id}`, { method: 'DELETE' }),
  /** `taskIds` is the full visible list, in its new order. */
  reorder: (taskIds: string[]) =>
    apiFetch<void>('/tasks/reorder', { method: 'PUT', body: JSON.stringify({ taskIds }) }),
}
