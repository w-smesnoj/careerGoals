import { apiFetch } from '../lib/apiClient'

export const unitAggregations = ['latest', 'sum'] as const
export type UnitAggregation = (typeof unitAggregations)[number]

/**
 * The one figure a unit's row shows, plus how much history sits behind it.
 * Scoped to whichever day the tracking list is browsing.
 */
export interface UnitSummary {
  /** All-time - lets a "0" on this day read differently from "never recorded". */
  entryCount: number
  /**
   * The reading recorded on the requested day, if any. `id` is what lets
   * tapping the figure on the tracking list edit that exact reading.
   */
  dayLatest: { id: string; value: number } | null
  /** That day's readings added up - what a 'sum' unit shows instead of `dayLatest`. */
  dayTotal: number
}

/**
 * A thing the user measures. Metadata only: every number lives in a
 * Measurement, whether it was typed by hand or captured by ticking a task.
 */
export interface TrackingUnit {
  id: string
  name: string
  symbol: string
  decimals: number
  /** 'latest' shows the day's reading (weight); 'sum' shows the day's total (coffees). */
  aggregation: UnitAggregation
  /**
   * Where the user wants this number to end up - drawn as a
   * dashed rule on its chart. Absent on units made before it existed.
   */
  target?: number | null
  /** Computed server-side, so a card never has to fetch its own history. */
  summary: UnitSummary
  /** Manual drag order on the tracking list. */
  order: number
  createdAt: string
  updatedAt: string
}

export interface TrackingUnitInput {
  name: string
  symbol?: string
  decimals?: number
  aggregation?: UnitAggregation
  /** null clears it. */
  target?: number | null
}

/**
 * One day's figure for a unit's chart - the day's total for a 'sum' unit, its
 * last reading for a 'latest' one. `count` is how many readings sit behind it.
 */
export interface SeriesPoint {
  date: string
  value: number
  count: number
}

export const trackingUnitsApi = {
  /** `date` scopes each unit's `summary` - defaults to today on the server. */
  list: (date?: string) =>
    apiFetch<TrackingUnit[]>(`/tracking-units${date ? `?date=${date}` : ''}`),
  create: (input: TrackingUnitInput) =>
    apiFetch<TrackingUnit>('/tracking-units', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: Partial<TrackingUnitInput>) =>
    apiFetch<TrackingUnit>(`/tracking-units/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  /** 409 while any task or entry still points at it - nothing is cascaded. */
  remove: (id: string) => apiFetch<void>(`/tracking-units/${id}`, { method: 'DELETE' }),
  /** Oldest first; days with nothing recorded are absent. Both bounds inclusive. */
  series: (id: string, range: { from?: string; to?: string } = {}) => {
    const params = new URLSearchParams()
    if (range.from) params.set('from', range.from)
    if (range.to) params.set('to', range.to)
    const search = params.toString()
    return apiFetch<{ points: SeriesPoint[] }>(
      `/tracking-units/${id}/series${search ? `?${search}` : ''}`,
    )
  },
  reorder: (unitIds: string[]) =>
    apiFetch<void>('/tracking-units/reorder', { method: 'PUT', body: JSON.stringify({ unitIds }) }),
}
