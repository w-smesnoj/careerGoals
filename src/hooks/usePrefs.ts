import { useContext } from 'react'
import { PrefsContext, type PrefsValue } from '../context/prefs'

/** The app-wide category filter and timeline sort order. */
export function usePrefs(): PrefsValue {
  const value = useContext(PrefsContext)
  if (!value) throw new Error('usePrefs must be used inside <PrefsProvider>')
  return value
}
