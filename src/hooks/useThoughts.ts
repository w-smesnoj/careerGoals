import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { thoughtsApi, type ThoughtInput } from '../api/thoughts'

export const thoughtKeys = {
  all: ['thoughts'] as const,
  list: (search: string) => [...thoughtKeys.all, 'list', search] as const,
}

/** Pinned first, then newest. An empty `search` is the whole list. */
export function useThoughts(search = '') {
  return useQuery({
    queryKey: thoughtKeys.list(search),
    queryFn: () => thoughtsApi.list(search || undefined),
    // Keeps the previous results on screen while a new search resolves, so the
    // list doesn't blank out between keystrokes.
    placeholderData: (previous) => previous,
  })
}

/** Every tag in use, most used first - suggestions and the filter strip. */
export function useThoughtTags(): string[] {
  const { data } = useThoughts()
  const counts = new Map<string, number>()
  for (const thought of data ?? []) {
    for (const tag of thought.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag)
}

function useThoughtMutation<TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: thoughtKeys.all })
    },
  })
}

export function useCreateThought() {
  return useThoughtMutation((input: ThoughtInput) => thoughtsApi.create(input))
}

export function useUpdateThought() {
  return useThoughtMutation(({ id, ...input }: Partial<ThoughtInput> & { id: string }) =>
    thoughtsApi.update(id, input),
  )
}

export function useDeleteThought() {
  return useThoughtMutation((id: string) => thoughtsApi.remove(id))
}
