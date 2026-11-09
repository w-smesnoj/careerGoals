import { useContext, useEffect } from 'react'
import { SheetContext, type SheetApi } from '../context/sheet'

/** The sheet this component sits in - to close it, or to mark it dirty. */
export function useSheet(): SheetApi {
  const value = useContext(SheetContext)
  if (!value) throw new Error('useSheet must be used inside a <Sheet>')
  return value
}

/**
 * Tells the enclosing sheet whether it holds unsaved changes. While it does,
 * swiping it away, tapping the scrim or pressing Escape asks "Discard
 * Changes?" instead of throwing the edit away.
 */
export function useSheetDirty(dirty: boolean): void {
  const sheet = useSheet()
  useEffect(() => {
    sheet.setDirty(dirty)
  }, [sheet, dirty])
}
