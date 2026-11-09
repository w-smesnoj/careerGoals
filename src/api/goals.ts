import { apiFetch, type RequestOptions } from '../lib/apiClient'

export const goalStatuses = ['active', 'completed', 'archived'] as const
export type GoalStatus = (typeof goalStatuses)[number]

/**
 * The goal palette - mirrors `goalColors` in server/src/models/goal.model.ts.
 * Validated as a set in both modes (see `--goal-*` in index.css). Red is left
 * out: on these screens it means "failed".
 */
export const goalColors = ['purple', 'blue', 'green', 'orange', 'pink'] as const
export type GoalColor = (typeof goalColors)[number]

export const goalColorLabels: Record<GoalColor, string> = {
  purple: 'Purple',
  blue: 'Blue',
  green: 'Green',
  orange: 'Orange',
  pink: 'Pink',
}

/** A Goal is the container: it holds the deadline and is assembled from Tasks. */
export interface Goal {
  id: string
  title: string
  /** The goal's plan, in the owner's words. */
  description: string
  categories: string[]
  status: GoalStatus
  /** When work on the goal begins; null means "use createdAt". */
  startDate: string | null
  targetDate: string | null
  /** Marks only - never text. Null (or absent on old goals) means the accent. */
  color?: GoalColor | null
  /** Manual drag order on the goals list. */
  order: number
  createdAt: string
  updatedAt: string
}

export interface GoalInput {
  title: string
  description?: string
  categories?: string[]
  status?: GoalStatus
  startDate?: string | null
  targetDate?: string | null
  color?: GoalColor | null
}

export const goalsApi = {
  list: () => apiFetch<Goal[]>('/goals'),
  get: (id: string) => apiFetch<Goal>(`/goals/${id}`),
  create: (input: GoalInput) =>
    apiFetch<Goal>('/goals', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: Partial<GoalInput>, options?: RequestOptions) =>
    apiFetch<Goal>(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(input), ...options }),
  /** Also removes the goal's tasks and their day records. */
  remove: (id: string) => apiFetch<void>(`/goals/${id}`, { method: 'DELETE' }),
  reorder: (goalIds: string[]) =>
    apiFetch<void>('/goals/reorder', { method: 'PUT', body: JSON.stringify({ goalIds }) }),
}
