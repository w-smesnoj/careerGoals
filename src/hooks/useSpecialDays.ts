import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import {
  specialDayCategoriesApi,
  specialDaysApi,
  type SpecialDayCategory,
  type SpecialDayCategoryInput,
  type SpecialDayInput,
} from '../api/specialDays'
import { categoryIndex } from '../lib/specialDays'
import { trackerKeys } from './useTracker'

export const specialDayKeys = {
  all: ['specialDays'] as const,
  list: () => [...specialDayKeys.all, 'list'] as const,
  categories: () => [...specialDayKeys.all, 'categories'] as const,
}

/**
 * Every stored special day, in one request. Like the tracker, the window is a
 * view concern rather than a fetch concern: there are only ever a handful of
 * these, and recurring ones have to be projected client-side anyway.
 */
export function useSpecialDays() {
  return useQuery({
    queryKey: specialDayKeys.list(),
    queryFn: () => specialDaysApi.list(),
  })
}

/** The categories, in filter order. */
export function useSpecialDayCategories() {
  return useQuery({
    queryKey: specialDayKeys.categories(),
    queryFn: () => specialDayCategoriesApi.list(),
  })
}

/** The categories looked up every way the screens need them: by id and by built-in role. */
export function useCategoryIndex() {
  const { data } = useSpecialDayCategories()
  return useMemo(() => categoryIndex(data ?? []), [data])
}

function useSpecialDayMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>,
  /** Writes the result into the cache straight away, ahead of the refetch. */
  place?: (queryClient: QueryClient, result: TResult) => void,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    // The tracker too: a vacation pauses habits, which changes the grid, the
    // day screen and every rate - and saving one withdraws the automatic
    // fails it now covers (see server/src/lib/vacation.ts). The same goes for
    // a category switched to pausing, or deleted along with its days.
    onSuccess: (result) => {
      place?.(queryClient, result)
      void queryClient.invalidateQueries({ queryKey: specialDayKeys.all })
      void queryClient.invalidateQueries({ queryKey: trackerKeys.all })
    },
  })
}

export function useCreateSpecialDay() {
  return useSpecialDayMutation((input: SpecialDayInput) => specialDaysApi.create(input))
}

export function useUpdateSpecialDay() {
  return useSpecialDayMutation(({ id, ...input }: Partial<SpecialDayInput> & { id: string }) =>
    specialDaysApi.update(id, input),
  )
}

export function useDeleteSpecialDay() {
  return useSpecialDayMutation((id: string) => specialDaysApi.remove(id))
}

/** Listed as soon as it's saved, so the form that asked for it can pick it at once. */
export function useCreateSpecialDayCategory() {
  return useSpecialDayMutation(
    (input: SpecialDayCategoryInput) => specialDayCategoriesApi.create(input),
    (queryClient, created) =>
      queryClient.setQueryData<SpecialDayCategory[]>(specialDayKeys.categories(), (current) =>
        current ? [...current, created] : [created],
      ),
  )
}

export function useUpdateSpecialDayCategory() {
  return useSpecialDayMutation(
    ({ id, ...input }: Partial<SpecialDayCategoryInput> & { id: string }) =>
      specialDayCategoriesApi.update(id, input),
  )
}

/** Deletes the category's days with it (the server does both). */
export function useDeleteSpecialDayCategory() {
  return useSpecialDayMutation((id: string) => specialDayCategoriesApi.remove(id))
}
