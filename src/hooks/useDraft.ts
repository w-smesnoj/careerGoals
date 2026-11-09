import { useState } from 'react'

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  // Drafts hold plain data - strings, numbers, arrays of them, small objects -
  // so structural equality is a serialisation away.
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * A sheet's working copy of the thing being edited. Seeded once from
 * `initial` (sheets mount only while open), and compared against it field by
 * field, so the sheet knows whether there's anything to lose (its dismiss
 * guard) and Save sends only what actually changed.
 */
export function useDraft<T extends object>(initial: T | (() => T)) {
  const [original] = useState(initial)
  const [draft, setDraft] = useState(original)

  function set(patch: Partial<T>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  const changedKeys = (Object.keys(draft) as (keyof T)[]).filter(
    (key) => !same(draft[key], original[key]),
  )

  return {
    draft,
    original,
    set,
    setDraft,
    dirty: changedKeys.length > 0,
    changedKeys,
    isChanged: (key: keyof T) => changedKeys.includes(key),
  }
}
