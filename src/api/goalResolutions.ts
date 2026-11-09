import { apiFetch } from '../lib/apiClient'

/** How the goal actually ended, in the owner's own judgement. */
export const resolutionOutcomes = ['achieved', 'partial', 'missed', 'abandoned'] as const
export type ResolutionOutcome = (typeof resolutionOutcomes)[number]

export const outcomeLabels: Record<ResolutionOutcome, string> = {
  achieved: 'Achieved',
  partial: 'Partly there',
  missed: 'Missed it',
  abandoned: 'Let it go',
}

/** The figures as they stood when the book was closed - see the model for why
 *  they are stored rather than recomputed on read. */
export interface ResolutionStats {
  rate: number
  done: number
  failed: number
  missed: number
  possible: number
  taskCount: number
  daysElapsed: number
  daysPlanned: number | null
}

export interface GoalResolution {
  id: string
  goalId: string
  outcome: ResolutionOutcome
  note: string
  stats: ResolutionStats
  resolvedAt: string
  createdAt: string
  updatedAt: string
}

export interface GoalResolutionInput {
  outcome: ResolutionOutcome
  note?: string
  stats: ResolutionStats
}

export const goalResolutionsApi = {
  /** Upsert - resolving an already-resolved goal edits its resolution. */
  set: (goalId: string, input: GoalResolutionInput) =>
    apiFetch<GoalResolution>(`/goals/${goalId}/resolution`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  /** Reopen the goal: drops the resolution and puts it back to active. */
  remove: (goalId: string) =>
    apiFetch<void>(`/goals/${goalId}/resolution`, { method: 'DELETE' }),
}
