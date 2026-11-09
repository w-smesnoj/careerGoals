import { apiFetch } from '../lib/apiClient'

/** A freeform thought jotted against one task on one day. */
export interface TaskNote {
  id: string
  taskId: string
  date: string
  text: string
  createdAt: string
  updatedAt: string
}

export const taskNotesApi = {
  /** Every note for every task on one day - the caller groups by taskId. */
  list: (date: string) => apiFetch<TaskNote[]>(`/tracker/notes?date=${date}`),
  /** Every note under one goal, whatever day it was written on. */
  listForGoal: (goalId: string) => apiFetch<TaskNote[]>(`/tracker/notes?goalId=${goalId}`),
  /** The lot, for a screen that rolls notes up across goals. */
  listAll: () => apiFetch<TaskNote[]>('/tracker/notes'),
  create: (taskId: string, date: string, text: string) =>
    apiFetch<TaskNote>('/tracker/notes', {
      method: 'POST',
      body: JSON.stringify({ taskId, date, text }),
    }),
  update: (id: string, text: string) =>
    apiFetch<TaskNote>(`/tracker/notes/${id}`, { method: 'PATCH', body: JSON.stringify({ text }) }),
  remove: (id: string) => apiFetch<void>(`/tracker/notes/${id}`, { method: 'DELETE' }),
}
