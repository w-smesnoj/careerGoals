import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { taskNotesApi } from '../api/taskNotes'

export const taskNoteKeys = {
  all: ['taskNotes'] as const,
  day: (date: string) => [...taskNoteKeys.all, 'day', date] as const,
  every: () => [...taskNoteKeys.all, 'every'] as const,
  goal: (goalId: string) => [...taskNoteKeys.all, 'goal', goalId] as const,
}

/** Every task's freeform notes for one day, in one request - grouped by taskId by the caller. */
export function useTaskNotes(date: string) {
  return useQuery({
    queryKey: taskNoteKeys.day(date),
    queryFn: () => taskNotesApi.list(date),
    placeholderData: (previous) => previous,
  })
}

/** Every note under one goal, whichever day it was written on - its journal. */
export function useGoalNotes(goalId: string) {
  return useQuery({
    queryKey: taskNoteKeys.goal(goalId),
    queryFn: () => taskNotesApi.listForGoal(goalId),
    enabled: Boolean(goalId),
  })
}

/** Every note there is, for a screen that rolls them up under their goals. */
export function useAllTaskNotes() {
  return useQuery({
    queryKey: taskNoteKeys.every(),
    queryFn: () => taskNotesApi.listAll(),
  })
}

export function useCreateTaskNote(date: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ taskId, text }: { taskId: string; text: string }) =>
      taskNotesApi.create(taskId, date, text),
    onSuccess: () => {
      // The goals screen rolls the same notes up, so both listings go stale.
      void queryClient.invalidateQueries({ queryKey: taskNoteKeys.all })
    },
  })
}

export function useUpdateTaskNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => taskNotesApi.update(id, text),
    onSuccess: () => {
      // The goals screen rolls the same notes up, so both listings go stale.
      void queryClient.invalidateQueries({ queryKey: taskNoteKeys.all })
    },
  })
}

export function useDeleteTaskNote() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => taskNotesApi.remove(id),
    onSuccess: () => {
      // The goals screen rolls the same notes up, so both listings go stale.
      void queryClient.invalidateQueries({ queryKey: taskNoteKeys.all })
    },
  })
}
