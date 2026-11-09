import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { measurementsApi, type MeasurementInput } from '../api/measurements'
import { trackingUnitKeys } from './useTrackingUnits'
import { trackerKeys } from './useTracker'

export const measurementKeys = {
  all: ['measurements'] as const,
  list: (unitId: string, limit?: number) =>
    [...measurementKeys.all, 'list', unitId, limit ?? 'default'] as const,
  day: (unitId: string, date: string) => [...measurementKeys.all, 'day', unitId, date] as const,
}

/**
 * One unit's history, newest first: the newest 30 by default, up to 366 with
 * `limit` (the unit page's "Show all"). Only fetched where it's shown -
 * opening the tracking page must not pull every reading ever taken.
 */
export function useMeasurements(
  unitId: string,
  options: { enabled?: boolean; limit?: number } = {},
) {
  return useQuery({
    queryKey: measurementKeys.list(unitId, options.limit),
    queryFn: () => measurementsApi.list({ unitId, limit: options.limit }),
    enabled: options.enabled ?? true,
    placeholderData: (previous) => previous,
  })
}

/**
 * Everything logged for one unit on one day, asked for by that day - so a day
 * buried behind the newest 30 readings is found as surely as today.
 */
export function useDayReadings(unitId: string, date: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: measurementKeys.day(unitId, date),
    queryFn: () => measurementsApi.list({ unitId, from: date, to: date, limit: 366 }),
    enabled: (options.enabled ?? true) && Boolean(unitId && date),
    placeholderData: (previous) => previous,
  })
}

function useMeasurementMutation<TVariables>(
  mutationFn: (variables: TVariables) => Promise<unknown>,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: measurementKeys.all })
      // Every unit row shows a figure derived from these rows.
      void queryClient.invalidateQueries({ queryKey: trackingUnitKeys.all })
      // getDay reads measurements straight out of the collection, so the day
      // screen's chips - and the values the log sheet prefills when a task is
      // re-ticked - go stale otherwise. A stale prefill doesn't just look
      // wrong: re-ticking writes it back over the edit.
      void queryClient.invalidateQueries({ queryKey: trackerKeys.all })
    },
  })
}

export function useCreateMeasurement() {
  return useMeasurementMutation((input: MeasurementInput) => measurementsApi.create(input))
}

export function useUpdateMeasurement() {
  return useMeasurementMutation(({ id, ...input }: { id: string; value?: number; note?: string }) =>
    measurementsApi.update(id, input),
  )
}

export function useDeleteMeasurement() {
  return useMeasurementMutation((id: string) => measurementsApi.remove(id))
}
