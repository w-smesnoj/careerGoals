import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  trackingUnitsApi,
  type SeriesPoint,
  type TrackingUnit,
  type TrackingUnitInput,
} from '../api/trackingUnits'
import { todayKey } from '../lib/date'

export const trackingUnitKeys = {
  all: ['trackingUnits'] as const,
  list: (date: string) => [...trackingUnitKeys.all, 'list', date] as const,
  series: (unitId: string, from: string | undefined) =>
    [...trackingUnitKeys.all, 'series', unitId, from ?? 'all'] as const,
}

/**
 * Every unit, in its drag order, each carrying its server-computed summary for
 * `date` - the tracking-list mirror of useDay. `date` defaults to today: most
 * callers (a task's unit picker, its log sheet) only want the list of units
 * and never look at `summary`, so they've no reason to pass one.
 */
export function useTrackingUnits(date: string = todayKey()) {
  return useQuery({
    queryKey: trackingUnitKeys.list(date),
    queryFn: () => trackingUnitsApi.list(date),
    placeholderData: (previous) => previous,
  })
}

/**
 * A unit's per-day figures from `from` (inclusive; omitted = all time) to
 * today, for its chart. Keyed under `trackingUnitKeys.all` on purpose: every
 * measurement mutation already invalidates that, so editing a reading anywhere
 * redraws the chart without this hook having to know about it.
 */
export function useUnitSeries(unitId: string, from?: string) {
  return useQuery({
    queryKey: trackingUnitKeys.series(unitId, from),
    queryFn: () => trackingUnitsApi.series(unitId, { from }),
    select: (data) => data.points,
    // Switching range keeps the old line up until the new one lands.
    placeholderData: (previous) => previous,
  })
}

function selectPoints(data: { points: SeriesPoint[] }): SeriesPoint[] {
  return data.points
}

/**
 * Module-level on purpose: a stable `combine` is what lets react-query hand
 * back the same object until a series actually changes - and the charts
 * redraw (and drop the hovered day) whenever their inputs change identity.
 */
function combineSeries(
  results: { data?: SeriesPoint[]; isPending: boolean; error: Error | null }[],
) {
  return {
    series: results.map((result) => result.data),
    isPending: results.some((result) => result.isPending),
    error: results.find((result) => result.error)?.error ?? null,
  }
}

/**
 * Several units' whole histories at once, for the compare page - the same
 * query (and cache entry) each unit's own chart page uses, so hopping between
 * the two never refetches.
 */
export function useUnitSeriesMany(unitIds: string[]) {
  return useQueries({
    queries: unitIds.map((unitId) => ({
      queryKey: trackingUnitKeys.series(unitId, undefined),
      queryFn: () => trackingUnitsApi.series(unitId),
      select: selectPoints,
    })),
    combine: combineSeries,
  })
}

/**
 * Dragging a row on the tracking list. Reorders the cache for the day in view
 * immediately, then ships the new order - the tracking-unit mirror of
 * useReorderDayTasks. Order isn't itself day-scoped, but the summary riding
 * along with each unit is, so the patch only touches the list currently on
 * screen; settling invalidates every day's cached copy, not just this one.
 */
export function useReorderTrackingUnits(date: string) {
  const queryClient = useQueryClient()
  const queryKey = trackingUnitKeys.list(date)

  return useMutation({
    mutationFn: (unitIds: string[]) => trackingUnitsApi.reorder(unitIds),

    onMutate: async (unitIds: string[]) => {
      await queryClient.cancelQueries({ queryKey })
      const previous = queryClient.getQueryData<TrackingUnit[]>(queryKey)

      queryClient.setQueryData<TrackingUnit[]>(queryKey, (current) => {
        if (!current) return current
        const byId = new Map(current.map((unit) => [unit.id, unit]))
        const ordered = unitIds
          .map((id) => byId.get(id))
          .filter((unit): unit is TrackingUnit => unit !== undefined)
        return ordered
      })

      return { previous }
    },

    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous)
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: trackingUnitKeys.all })
    },
  })
}

function useTrackingUnitMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: trackingUnitKeys.all })
      // Deliberately not invalidating measurements: readings are unchanged by
      // any edit here (decimals only affect how they're rendered, from this
      // query), and a unit with entries can't be deleted at all.
    },
  })
}

export function useCreateTrackingUnit() {
  return useTrackingUnitMutation((input: TrackingUnitInput) => trackingUnitsApi.create(input))
}

export function useUpdateTrackingUnit() {
  return useTrackingUnitMutation(({ id, ...input }: Partial<TrackingUnitInput> & { id: string }) =>
    trackingUnitsApi.update(id, input),
  )
}

/** Rejected with a 409 while anything still points at the unit. */
export function useDeleteTrackingUnit() {
  return useTrackingUnitMutation((id: string) => trackingUnitsApi.remove(id))
}
