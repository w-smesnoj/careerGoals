const API_BASE_URL = import.meta.env.VITE_API_URL ?? '/api'

export interface ApiIssue {
  path: string
  message: string
}

export class ApiError extends Error {
  status: number
  issues?: ApiIssue[]

  constructor(status: number, message: string, issues?: ApiIssue[]) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.issues = issues
  }
}

/**
 * What a caller may add to a request. `keepalive` lets a write outlive the page:
 * an undo toast's pending delete is flushed with it when the tab is closed
 * mid-toast (see lib/toast.tsx).
 */
export interface RequestOptions {
  keepalive?: boolean
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ApiError(
      response.status,
      body.message ?? `Request failed with status ${response.status}`,
      body.issues,
    )
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}
