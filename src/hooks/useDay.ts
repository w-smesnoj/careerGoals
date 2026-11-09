import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  trackerApi,
  type CompletionStatus,
  type DayTask,
  type MeasurementInput,
  type TrackerDay,
} from '../api/tracker'
import { tasksApi } from '../api/tasks'
import { trackerKeys } from './useTracker'
import { measurementKeys } from './useMeasurements'
import { trackingUnitKeys } from './useTrackingUnits'

/** One day's task list - what the mobile screen renders. */
export function useDay(date: string) {
  return useQuery({
    queryKey: trackerKeys.day(date),
    queryFn: () => trackerApi.day(date),
    placeholderData: (previous) => previous,
  })
}

interface DayMutation {
  taskId: string
  /** `null` puts the task back to unanswered. */
  status: CompletionStatus | null
  /**
   * The day being answered, when it isn't the one on screen - a carried-over
   * row resolves its own past date, which is the whole point of carrying it.
   * Defaults to the day the hook was opened on.
   */
  date?: string
  note?: string
  /**
   * Omitted leaves the day's readings alone, `[]` clears them, a list replaces
   * them - see `nextMeasurements`.
   */
  measurements?: MeasurementInput[]
}

/**
 * The client half of the measurement rule in setCompletion
 * (server/src/controllers/tracker.controller.ts) - it exists so the optimistic
 * patch shows exactly what the server will store. Keep the two in sync by hand:
 * if they drift, a row displays a value the server never saved until the next
 * refetch quietly removes it.
 */
export function nextMeasurements(
  current: DayTask['measurements'],
  status: CompletionStatus | null,
  measurements?: MeasurementInput[],
): DayTask['measurements'] {
  // Only clearing a day deletes its readings server-side - a failed day keeps
  // whatever was recorded against it.
  if (status === null) return {}
  if (!measurements) return current
  return Object.fromEntries(
    measurements.map((measurement) => [
      measurement.unitId,
      { value: measurement.value, note: measurement.note ?? '' },
    ]),
  )
}

/**
 * The same rule as `nextMeasurements`, but for the day's raw `unitReadings`
 * list rather than one task's own slice of it - what a 'sum' unit's chip
 * totals and its log sheet lists. Mirrors `syncTaskMeasurements` server-side:
 * this task's own row is dropped from every unit it's attached to, then
 * re-added for whatever the new entries cover.
 */
export function nextUnitReadings(
  current: TrackerDay['unitReadings'],
  task: DayTask,
  status: CompletionStatus | null,
  measurements?: MeasurementInput[],
): TrackerDay['unitReadings'] {
  const entries = status === null ? [] : measurements
  if (entries === undefined) return current

  const byUnit = new Map(entries.map((entry) => [entry.unitId, entry]))
  const next = { ...current }

  for (const unit of task.units) {
    const withoutThisTask = (current[unit.id] ?? []).filter(
      (reading) => reading.taskId !== task.id,
    )
    const entry = byUnit.get(unit.id)
    next[unit.id] = entry
      ? [
          ...withoutThisTask,
          {
            id: `optimistic-${task.id}`,
            value: entry.value,
            note: entry.note ?? '',
            taskId: task.id,
            taskTitle: task.title,
          },
        ]
      : withoutThisTask
  }

  return next
}

/**
 * Answering a task on the day screen. Optimistic, because on a phone the
 * round trip is exactly where a tap would feel unresponsive.
 */
export function useSetDayCompletion(date: string) {
  const queryClient = useQueryClient()
  const queryKey = trackerKeys.day(date)

  return useMutation({
    mutationFn: async ({ taskId, status, date: day = date, note, measurements }: DayMutation) => {
      if (status === null) await trackerApi.clear(taskId, day)
      else await trackerApi.set(taskId, day, status, note, measurements)
    },

    onMutate: async ({ taskId, status, date: day = date, note, measurements }) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<TrackerDay>(queryKey)

      queryClient.setQueryData<TrackerDay>(queryKey, (current) => {
        if (!current) return current

        // Answering another day means a carried-over row, which just leaves
        // the due list. Whether the task has a further day stacked behind it
        // is the server's to say, so the refetch below decides that - and
        // nothing on the day actually on screen has changed.
        if (day !== date) {
          return { ...current, due: current.due.filter((entry) => entry.id !== taskId) }
        }

        const task = current.tasks.find((task) => task.id === taskId)
        return {
          ...current,
          tasks: current.tasks.map((task) =>
            task.id === taskId
              ? {
                  ...task,
                  status,
                  note: note ?? '',
                  measurements: nextMeasurements(task.measurements, status, measurements),
                }
              : task,
          ),
          unitReadings: task
            ? nextUnitReadings(current.unitReadings, task, status, measurements)
            : current.unitReadings,
        }
      })

      return { previous }
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
    },

    onSettled: () => {
      // The month grid shows the same records, so refresh both views.
      void queryClient.invalidateQueries({ queryKey: trackerKeys.all })
      // A tick can write or clear a reading, so the tracking page is stale too -
      // both the history lists and the summary figure on each unit card.
      void queryClient.invalidateQueries({ queryKey: measurementKeys.all })
      void queryClient.invalidateQueries({ queryKey: trackingUnitKeys.all })
    },
  })
}

/**
 * Dragging a row on the day screen. Reorders the cache immediately, then
 * ships the new order (task order is global, not per-day).
 */
export function useReorderDayTasks(date: string) {
  const queryClient = useQueryClient()
  const queryKey = trackerKeys.day(date)

  return useMutation({
    mutationFn: (taskIds: string[]) => tasksApi.reorder(taskIds),

    onMutate: async (taskIds: string[]) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<TrackerDay>(queryKey)

      queryClient.setQueryData<TrackerDay>(queryKey, (current) => {
        if (!current) return current
        const byId = new Map(current.tasks.map((task) => [task.id, task]))
        const ordered = taskIds
          .map((id) => byId.get(id))
          .filter((task): task is DayTask => task !== undefined)
        return { ...current, tasks: ordered }
      })

      return { previous }
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
    },

    onSettled: () => {
      // The month grid sorts tasks the same way, so refresh it too.
      void queryClient.invalidateQueries({ queryKey: trackerKeys.all })
    },
  })
}
