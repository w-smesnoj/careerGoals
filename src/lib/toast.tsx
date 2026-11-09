import { toast } from 'sonner'
import { ToastCapsule } from '../components/ToastCapsule'
import type { RequestOptions } from './apiClient'

const DURATION = 5000

/** A one-line toast, optionally with one action ("View"). */
export function showToast(message: string, action?: { label: string; onClick: () => void }) {
  return toast.custom(
    (id) => (
      <ToastCapsule
        message={message}
        action={
          action && {
            label: action.label,
            onClick: () => {
              toast.dismiss(id)
              action.onClick()
            },
          }
        }
      />
    ),
    { duration: action ? DURATION : 3000 },
  )
}

interface Pending {
  commit: (keepalive: boolean) => void
}

/** Requests waiting on their toast. Flushed if the page goes away mid-toast. */
const pending = new Set<Pending>()

/**
 * Undo instead of "Are you sure?": the item disappears at once, the real
 * request only goes out when the toast leaves, and Undo cancels it.
 *
 *  - `apply` hides the item from the query cache right away.
 *  - `run` sends the request when the toast times out or is swiped off.
 *  - `undo` puts the item back; it also runs if the request fails, which then
 *    says so in a toast of its own.
 *
 * Closing the tab mid-toast still sends it: `pagehide` flushes whatever is
 * pending with `keepalive`, which lets a request outlive its page.
 */
export function undoable({
  message,
  apply,
  run,
  undo,
  failure = 'That didn’t go through',
}: {
  message: string
  apply: () => void
  run: (options: RequestOptions) => Promise<unknown>
  undo: () => void
  failure?: string
}) {
  apply()
  let settled = false

  const entry: Pending = {
    commit: (keepalive) => {
      if (settled) return
      settled = true
      pending.delete(entry)
      run({ keepalive }).catch((error: unknown) => {
        undo()
        showToast(`${failure}: ${error instanceof Error ? error.message : String(error)}`)
      })
    },
  }
  pending.add(entry)

  return toast.custom(
    (id) => (
      <ToastCapsule
        message={message}
        action={{
          label: 'Undo',
          onClick: () => {
            if (settled) return
            settled = true
            pending.delete(entry)
            undo()
            toast.dismiss(id)
          },
        }}
      />
    ),
    {
      duration: DURATION,
      onAutoClose: () => entry.commit(false),
      onDismiss: () => entry.commit(false),
    },
  )
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const entry of [...pending]) entry.commit(true)
  })
}
