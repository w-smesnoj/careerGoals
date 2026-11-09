import { useMutation, useQueryClient } from '@tanstack/react-query'
import { tasksApi, type Task, type TaskInput, type TaskLimitInput } from '../api/tasks'
import { trackerApi } from '../api/tracker'
import { trackerKeys } from './useTracker'
import { measurementKeys } from './useMeasurements'
import { trackingUnitKeys } from './useTrackingUnits'

export const taskKeys = {
  all: ['tasks'] as const,
  list: (goalId?: string) => [...taskKeys.all, 'list', goalId ?? 'any'] as const,
}

/**
 * Everything a task edit can make stale. Readings are on the list: detaching a
 * unit deletes the readings this task captured for it, and a limit changes
 * what the unit pages say about it.
 */
function invalidateAfterTask(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: taskKeys.all })
  void queryClient.invalidateQueries({ queryKey: trackerKeys.all })
  void queryClient.invalidateQueries({ queryKey: measurementKeys.all })
  void queryClient.invalidateQueries({ queryKey: trackingUnitKeys.all })
}

function useTaskMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: () => invalidateAfterTask(queryClient),
  })
}

export function useCreateTask() {
  return useTaskMutation((input: TaskInput) => tasksApi.create(input))
}

export function useUpdateTask() {
  return useTaskMutation(({ id, ...input }: Partial<TaskInput> & { id: string }) =>
    tasksApi.update(id, input),
  )
}

export function useDeleteTask() {
  return useTaskMutation((id: string) => tasksApi.remove(id))
}

export type SaveTask =
  | { kind: 'update'; id: string; patch: Partial<TaskInput> }
  | {
      kind: 'create'
      input: TaskInput
      /** POST doesn't take a limit - it's set by a PATCH right after. */
      limit?: TaskLimitInput
      /** A once task done on a past day: tick it there in the same step. */
      doneOn?: string
    }

/**
 * The task sheet's Save. Editing is one PATCH of only what changed. Creating is
 * up to three steps the server takes separately - create, then the limit, then
 * the backdated tick - and they run in that order so a failure part-way leaves
 * a real task behind rather than a half-written one.
 */
export function useSaveTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (save: SaveTask): Promise<Task> => {
      if (save.kind === 'update') return tasksApi.update(save.id, save.patch)
      let task = await tasksApi.create(save.input)
      if (save.limit) task = await tasksApi.update(task.id, { limit: save.limit })
      if (save.doneOn) await trackerApi.set(task.id, save.doneOn, 'done')
      return task
    },
    onSuccess: () => invalidateAfterTask(queryClient),
  })
}
