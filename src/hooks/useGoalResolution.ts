import { useMutation, useQueryClient } from '@tanstack/react-query'
import { goalResolutionsApi, type GoalResolutionInput } from '../api/goalResolutions'
import { goalKeys } from './useGoals'
import { trackerKeys } from './useTracker'

/** Resolving changes the goal's status too, so both caches go stale together. */
function useResolutionMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: goalKeys.all })
      void queryClient.invalidateQueries({ queryKey: trackerKeys.all })
    },
  })
}

/** Close the book on a goal: writes the resolution and marks the goal completed. */
export function useResolveGoal() {
  return useResolutionMutation(({ goalId, ...input }: GoalResolutionInput & { goalId: string }) =>
    goalResolutionsApi.set(goalId, input),
  )
}

/** Reopen a goal that was resolved by mistake, or that turned out not to be over. */
export function useReopenGoal() {
  return useResolutionMutation((goalId: string) => goalResolutionsApi.remove(goalId))
}
