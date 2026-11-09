import { useContext, type ReactNode } from 'react'
import { SheetContext } from '../context/sheet'
import { SheetCore } from './SheetCore'

export interface SheetAction {
  label: string
  /** Red, for the one that ends or loses something. */
  destructive?: boolean
  disabled?: boolean
  onSelect: () => void
}

function ActionButtons({
  title,
  message,
  actions,
  cancelLabel,
}: {
  title?: string
  message?: ReactNode
  actions: SheetAction[]
  cancelLabel: string
}) {
  const sheet = useContext(SheetContext)

  // Out first, then act: whatever the action opens or closes next never
  // animates over this sheet on its way out.
  async function choose(action: SheetAction) {
    await sheet?.close()
    action.onSelect()
  }

  return (
    <>
      <div className="action-group">
        {(title || message) && (
          <div className="action-header">
            {title && <p className="action-title">{title}</p>}
            {message && <p className="action-message">{message}</p>}
          </div>
        )}
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            className="action-button"
            data-destructive={action.destructive || undefined}
            disabled={action.disabled}
            onClick={() => void choose(action)}
          >
            {action.label}
          </button>
        ))}
      </div>
      <div className="action-group">
        <button
          type="button"
          className="action-button action-cancel"
          // The default the thumb is nearest to, and the safe one.
          autoFocus
          onClick={() => void sheet?.close()}
        >
          {cancelLabel}
        </button>
      </div>
    </>
  )
}

/**
 * An iOS action sheet: an optional title and message over a group of
 * actions - destructive ones in red - and a separate Cancel below. The same
 * primitive as every other sheet, so it rises, drags and dismisses alike.
 * Used for confirmations and for "Discard changes?".
 *
 * `actions` may be empty, which leaves an alert-like sheet whose only button
 * is the cancel one (say, "OK" under a refusal's reason).
 */
export function ActionSheet({
  label,
  title,
  message,
  actions,
  cancelLabel = 'Cancel',
  onClose,
}: {
  label?: string
  title?: string
  message?: ReactNode
  actions: SheetAction[]
  cancelLabel?: string
  onClose: () => void
}) {
  return (
    <SheetCore label={label ?? title ?? 'Actions'} variant="action" onClose={onClose}>
      <ActionButtons title={title} message={message} actions={actions} cancelLabel={cancelLabel} />
    </SheetCore>
  )
}
