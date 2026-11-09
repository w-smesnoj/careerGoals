import { apiFetch, type RequestOptions } from '../lib/apiClient'

/**
 * One number, in one unit, on one day. `taskId` is set only when ticking a task
 * produced it - the history list shows hand-entered and task-borne readings
 * together, marking the latter by where they came from.
 */
export interface Measurement {
  id: string
  unitId: string
  value: number
  date: string
  measuredAt: string
  note: string
  taskId?: string
  /** Title of the task that produced this, when one did. List responses only. */
  taskTitle?: string | null
  createdAt: string
  updatedAt: string
}

export interface MeasurementInput {
  unitId: string
  value: number
  /** Defaults to today on the server. Backdating is allowed; the future is not. */
  date?: string
  note?: string
}

interface ListMeasurementsQuery {
  unitId?: string
  from?: string
  to?: string
  limit?: number
}

export const measurementsApi = {
  list: (query: ListMeasurementsQuery = {}) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value))
    }
    const search = params.toString()
    return apiFetch<Measurement[]>(`/measurements${search ? `?${search}` : ''}`)
  },
  create: (input: MeasurementInput) =>
    apiFetch<Measurement>('/measurements', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: { value?: number; note?: string }) =>
    apiFetch<Measurement>(`/measurements/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string, options?: RequestOptions) =>
    apiFetch<void>(`/measurements/${id}`, { method: 'DELETE', ...options }),
}
