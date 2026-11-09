import type { TaskFrequency, TaskFrequencyInput, TaskFrequencyType } from '../api/tasks'

/**
 * A frequency part-way through being edited.
 *
 * Every variant's fields are held at once, rather than as a union, so switching
 * between them in a form doesn't throw away what was already picked - flick from
 * weekly to monthly and back and the chosen weekdays are still there. Only the
 * fields the selected `type` cares about are read when it's built.
 */
export interface FrequencyDraft {
  type: TaskFrequencyType
  daysOfWeek: number[]
  daysOfMonth: number[]
  intervalDays: number
  startWeekday: number
}

/** A daily task: what a new task is until someone says otherwise. */
export const emptyFrequencyDraft: FrequencyDraft = {
  type: 'daily',
  daysOfWeek: [],
  daysOfMonth: [],
  intervalDays: 3,
  startWeekday: 1,
}

/** Seeds the form from an existing task's frequency, leaving the rest at defaults. */
export function draftFromFrequency(frequency: TaskFrequency): FrequencyDraft {
  switch (frequency.type) {
    case 'weekly':
      return { ...emptyFrequencyDraft, type: 'weekly', daysOfWeek: frequency.daysOfWeek }
    case 'monthly':
      return { ...emptyFrequencyDraft, type: 'monthly', daysOfMonth: frequency.daysOfMonth }
    case 'everyNDays':
      return {
        ...emptyFrequencyDraft,
        type: 'everyNDays',
        intervalDays: frequency.intervalDays,
        startWeekday: frequency.startWeekday,
      }
    default:
      return { ...emptyFrequencyDraft, type: frequency.type }
  }
}

/**
 * The draft as it goes to the API - the selected variant only, so a weekday
 * picked and then abandoned never reaches the server.
 *
 * No `anchorDate` for 'everyNDays': the server resolves the weekday into one.
 */
export function buildFrequency(draft: FrequencyDraft): TaskFrequencyInput {
  switch (draft.type) {
    case 'weekly':
      return { type: 'weekly', daysOfWeek: draft.daysOfWeek }
    case 'monthly':
      return { type: 'monthly', daysOfMonth: draft.daysOfMonth }
    case 'everyNDays':
      return {
        type: 'everyNDays',
        intervalDays: draft.intervalDays,
        startWeekday: draft.startWeekday,
      }
    case 'once':
      return { type: 'once' }
    default:
      return { type: 'daily' }
  }
}

/**
 * Whether the draft is complete enough to save. Mirrors what the API would
 * reject anyway - the point is to disable the button rather than explain a 400.
 */
export function isFrequencyValid(draft: FrequencyDraft): boolean {
  switch (draft.type) {
    case 'weekly':
      return draft.daysOfWeek.length > 0
    case 'monthly':
      return draft.daysOfMonth.length > 0
    case 'everyNDays':
      return Number.isInteger(draft.intervalDays) && draft.intervalDays >= 2 && draft.intervalDays <= 365
    default:
      return true
  }
}
