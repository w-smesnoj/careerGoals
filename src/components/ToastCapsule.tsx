/**
 * What every toast looks like: one line on a thick material capsule, with at
 * most one action - Undo, or View. Rendered headless through Sonner's
 * toast.custom (lib/toast.tsx), which keeps the stacking, timing and swipe.
 */
export function ToastCapsule({
  message,
  action,
}: {
  message: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="toast-capsule" role="status">
      <span className="toast-message">{message}</span>
      {action && (
        <button type="button" className="toast-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}
