import type { QueryClient } from '@tanstack/react-query'
import type { Goal } from '../api/goals'
import type { Measurement } from '../api/measurements'
import type { Thought } from '../api/thoughts'
import type { TrackerDay, TrackerRange } from '../api/tracker'
import { goalKeys } from '../hooks/useGoals'
import { measurementKeys } from '../hooks/useMeasurements'
import { thoughtKeys } from '../hooks/useThoughts'
import { trackerKeys } from '../hooks/useTracker'

/*
 * What an undo toast's `apply` does: take the item out of every cached list it
 * appears in, at once, before any request has gone out. Undo doesn't put a
 * snapshot back - other edits may have landed in the meantime - it refetches,
 * which brings the item back exactly as the server still has it.
 */

function isRange(data: unknown): data is TrackerRange {
  return typeof data === 'object' && data !== null && 'goals' in data && 'days' in data
}

function isDay(data: unknown): data is TrackerDay {
  return typeof data === 'object' && data !== null && 'tasks' in data && 'due' in data
}

/** A task leaves the day screens and the goal grid. */
export function hideTask(queryClient: QueryClient, taskId: string): void {
  queryClient.setQueriesData({ queryKey: trackerKeys.all }, (data: unknown) => {
    if (isRange(data)) {
      return {
        ...data,
        goals: data.goals.map((goal) => ({
          ...goal,
          tasks: goal.tasks.filter((task) => task.id !== taskId),
        })),
      }
    }
    if (isDay(data)) {
      return {
        ...data,
        tasks: data.tasks.filter((task) => task.id !== taskId),
        due: data.due.filter((task) => task.id !== taskId),
        upcoming: data.upcoming.filter((task) => task.id !== taskId),
      }
    }
    return data
  })
}

/** A goal - archived - leaves every list of goals, and its tasks the day screens. */
export function hideGoal(queryClient: QueryClient, goalId: string): void {
  queryClient.setQueriesData({ queryKey: goalKeys.all }, (data: unknown) =>
    Array.isArray(data) ? (data as Goal[]).filter((goal) => goal.id !== goalId) : data,
  )
  queryClient.setQueriesData({ queryKey: trackerKeys.all }, (data: unknown) => {
    if (isRange(data)) return { ...data, goals: data.goals.filter((goal) => goal.id !== goalId) }
    if (isDay(data)) {
      return {
        ...data,
        tasks: data.tasks.filter((task) => task.goalId !== goalId),
        due: data.due.filter((task) => task.goalId !== goalId),
        upcoming: data.upcoming.filter((task) => task.goalId !== goalId),
      }
    }
    return data
  })
}

export function hideThought(queryClient: QueryClient, thoughtId: string): void {
  queryClient.setQueriesData({ queryKey: thoughtKeys.all }, (data: unknown) =>
    Array.isArray(data) ? (data as Thought[]).filter((thought) => thought.id !== thoughtId) : data,
  )
}

export function hideMeasurement(queryClient: QueryClient, measurementId: string): void {
  queryClient.setQueriesData({ queryKey: measurementKeys.all }, (data: unknown) =>
    Array.isArray(data)
      ? (data as Measurement[]).filter((measurement) => measurement.id !== measurementId)
      : data,
  )
}

/** Undo, and the end of a request either way: whatever the server now says. */
export function refetchEverything(queryClient: QueryClient): void {
  void queryClient.invalidateQueries()
}
