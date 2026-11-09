import { createContext } from 'react'

export interface SheetApi {
  /** Animates the sheet out, then calls its `onClose`. Resolves once it's gone,
   *  so "save, close, then go to the new page" runs one step at a time. */
  close: () => Promise<void>
  /** Unsaved changes: a swipe, a scrim tap or Escape then asks first. */
  setDirty: (dirty: boolean) => void
  /** Leave as if dismissed by hand - honours the dirty guard. */
  requestDismiss: () => void
}

/** Split from the components so this file exports no components - a file that
 *  mixes the two breaks fast refresh. */
export const SheetContext = createContext<SheetApi | null>(null)
