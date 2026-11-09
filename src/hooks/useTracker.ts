import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  trackerApi,
  type CompletionStatus,
  type TrackerRange,
} from '../api/tracker'

export const trackerKeys = {
  all: ['tracker'] as const,
  /** No date in the key: the grid is fetched whole, once. */
  range: () => [...trackerKeys.all, 'range'] as const,
  day: (date: string) => [...trackerKeys.all, 'day', date] as const,
}

/**
 * The whole grid: goals -> tasks -> answered days, for every day the data
 * covers. The visible window is chosen on screen, not here - nothing about
 * panning or zooming the timeline re-fetches anything.
 *
 * `enabled: false` for a screen that only wants it some of the time - it
 * still gets whatever is already cached, it just won't ask for it.
 */
export function useTracker(enabled = true) {
  return useQuery({
    queryKey: trackerKeys.range(),
    queryFn: () => trackerApi.range(),
    enabled,
  })
}

interface RangeMutation {
  taskId: string
  date: string
  status: CompletionStatus | null
  note?: string
}

/**
 * Marking a day from the grid. The cell flips before the request goes out and
 * rolls back if the server rejects it, so the table never feels laggy.
 */
export function useSetRangeCompletion() {
  const queryClient = useQueryClient()
  const queryKey = trackerKeys.range()

  return useMutation({
    mutationFn: async ({ taskId, date, status, note }: RangeMutation) => {
      if (status === null) await trackerApi.clear(taskId, date)
      else await trackerApi.set(taskId, date, status, note)
    },

    onMutate: async ({ taskId, date, status, note }) => {
      // Stop an in-flight refetch from overwriting the optimistic value.
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<TrackerRange>(queryKey)

      queryClient.setQueryData<TrackerRange>(queryKey, (current) => {
        if (!current) return current
        return {
          ...current,
          goals: current.goals.map((goal) => ({
            ...goal,
            tasks: goal.tasks.map((task) => {
              if (task.id !== taskId) return task
              const completions = { ...task.completions }
              if (status === null) delete completions[date]
              // Answering a cell by hand always takes it off the resolver.
              else completions[date] = { status, note: note ?? '', auto: false }
              return { ...task, completions }
            }),
          })),
        }
      })

      return { previous }
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
    },

    onSettled: () => {
      // The day screen shows the same records, so refresh both views.
      void queryClient.invalidateQueries({ queryKey: trackerKeys.all })
    },
  })
}
