import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { goalsApi, type GoalInput } from '../api/goals'
import type { TrackerRange } from '../api/tracker'
import { trackerKeys } from './useTracker'

export const goalKeys = {
  all: ['goals'] as const,
  list: () => [...goalKeys.all, 'list'] as const,
  detail: (id: string) => [...goalKeys.all, 'detail', id] as const,
}

export function useGoals() {
  return useQuery({ queryKey: goalKeys.list(), queryFn: () => goalsApi.list() })
}

export function useCreateGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (input: GoalInput) => goalsApi.create(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.all })
      void queryClient.invalidateQueries({ queryKey: trackerKeys.all })
    },
  })
}

export function useUpdateGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...input }: Partial<GoalInput> & { id: string }) =>
      goalsApi.update(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.all })
      void queryClient.invalidateQueries({ queryKey: trackerKeys.all })
    },
  })
}

/**
 * Dragging a row on the goals list. Reorders the cached tracker range
 * immediately, then ships the new order - the goal mirror of
 * useReorderTrackingUnits. GoalsPage reads its goals from useTracker(), so
 * that's the cache this patches rather than the plain goalKeys list.
 */
export function useReorderGoals() {
  const queryClient = useQueryClient()
  const queryKey = trackerKeys.range()

  return useMutation({
    mutationFn: (goalIds: string[]) => goalsApi.reorder(goalIds),

    onMutate: async (goalIds: string[]) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<TrackerRange>(queryKey)

      queryClient.setQueryData<TrackerRange>(queryKey, (current) => {
        if (!current) return current
        const byId = new Map(current.goals.map((goal) => [goal.id, goal]))
        const ordered = goalIds
          .map((id) => byId.get(id))
          .filter((goal): goal is TrackerRange['goals'][number] => goal !== undefined)
        return { ...current, goals: ordered }
      })

      return { previous }
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: trackerKeys.all })
    },
  })
}

/** Deletes the goal's tasks and day records too, so the whole grid refetches. */
export function useDeleteGoal() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => goalsApi.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.all })
      void queryClient.invalidateQueries({ queryKey: trackerKeys.all })
    },
  })
}

/** Every category already used on a goal, offered as suggestions wherever
 *  categories are typed - a shortcut to reuse, not a closed list. */
export function useCategorySuggestions(): string[] {
  const { data: goals } = useGoals()
  const used = new Set<string>()
  for (const goal of goals ?? []) {
    for (const category of goal.categories) used.add(category)
  }
  return [...used].sort((a, b) => a.localeCompare(b))
}
