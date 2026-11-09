import { createContext } from 'react'
import type { GoalStatus } from '../api/goals'
import type { CompletionStatus, TaskStatusFilter } from '../api/tracker'
import type { SortOrder } from '../hooks/useTimelineRows'

export interface PrefsValue {
  hiddenCategories: Set<string>
  toggleCategory: (name: string) => void
  /** Show only this one, hiding every other category currently in use. */
  soloCategory: (name: string, all: string[]) => void
  clearCategories: () => void
  /** Whether something tagged with `categories` survives the current filter. */
  isVisible: (categories: string[]) => boolean
  hiddenStatuses: Set<TaskStatusFilter>
  toggleStatus: (status: TaskStatusFilter) => void
  /** Show only this one, hiding the other two statuses. */
  soloStatus: (status: TaskStatusFilter) => void
  clearStatuses: () => void
  /** Whether a task with this completion status survives the current filter. */
  isStatusVisible: (status: CompletionStatus | null) => boolean
  hiddenGoalStatuses: Set<GoalStatus>
  toggleGoalStatus: (status: GoalStatus) => void
  /** Show only this one, hiding the other two goal statuses. */
  soloGoalStatus: (status: GoalStatus) => void
  clearGoalStatuses: () => void
  /** Whether a goal with this status survives the current filter. */
  isGoalStatusVisible: (status: GoalStatus) => boolean
  sortOrder: SortOrder
  setSortOrder: (order: SortOrder) => void
  /** Special-day categories hidden from view, by id. */
  hiddenSpecialCategories: Set<string>
  toggleSpecialCategory: (id: string) => void
  /** Show only this one, hiding every other category of special day. */
  soloSpecialCategory: (id: string, all: string[]) => void
  clearSpecialCategories: () => void
  /** Whether a special day in this category survives the current filter. */
  isSpecialCategoryVisible: (id: string) => boolean
  /** ISO 3166-2 code of the chosen Bundesland; '' means nationwide holidays only. */
  bundesland: string
  setBundesland: (code: string) => void
  /** The calendar's completion layer - how each day so far went. Off until
   *  turned on, then remembered. */
  showCompletion: boolean
  toggleCompletion: () => void
}

/** Split from the provider so this file exports no components - a file that
 *  mixes the two breaks fast refresh. */
export const PrefsContext = createContext<PrefsValue | null>(null)
