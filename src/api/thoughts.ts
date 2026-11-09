import { apiFetch, type RequestOptions } from '../lib/apiClient'

/**
 * What a thought became once it was turned into action. `id` is the task's or
 * goal's - which may since have been deleted, so a reader checks before linking.
 */
export interface ThoughtOutcome {
  kind: 'task' | 'goal'
  id: string
  title: string
  at: string
}

/**
 * A think-tank entry: a thought that belongs to no goal, task or day. Separate
 * from TaskNote by design - the point is somewhere to put a thought before it
 * has anywhere to belong.
 */
export interface Thought {
  id: string
  title: string
  text: string
  tags: string[]
  pinned: boolean
  /** Null until it's been turned into a task or a goal. Absent on old thoughts. */
  outcome?: ThoughtOutcome | null
  createdAt: string
  updatedAt: string
}

export interface ThoughtInput {
  title?: string
  text: string
  tags?: string[]
  pinned?: boolean
  outcome?: ThoughtOutcome | null
}

export const thoughtsApi = {
  /** `search` matches title, body or tag as a substring, case-insensitively. */
  list: (search?: string) =>
    apiFetch<Thought[]>(`/thoughts${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  create: (input: ThoughtInput) =>
    apiFetch<Thought>('/thoughts', { method: 'POST', body: JSON.stringify(input) }),
  update: (id: string, input: Partial<ThoughtInput>) =>
    apiFetch<Thought>(`/thoughts/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  remove: (id: string, options?: RequestOptions) =>
    apiFetch<void>(`/thoughts/${id}`, { method: 'DELETE', ...options }),
}
