import { createContext } from 'react'

export interface FabAddValue {
  /** The page in view says what "add" means there. Returns the unregister. */
  register: (handler: () => void) => () => void
  /** The button was pressed. */
  trigger: () => void
}

/** Split from the provider so this file exports no components - a file that
 *  mixes the two breaks fast refresh. */
export const FabAddContext = createContext<FabAddValue | null>(null)
