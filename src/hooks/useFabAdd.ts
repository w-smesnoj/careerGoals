import { useContext, useEffect } from 'react'
import { FabAddContext, type FabAddValue } from '../context/fabAdd'

function useFabContext(): FabAddValue {
  const value = useContext(FabAddContext)
  if (!value) throw new Error('useFabAdd must be used inside <FabAddProvider>')
  return value
}

/** What the floating add button does while this page is in view. */
export function useFabAction(handler: () => void): void {
  const { register } = useFabContext()
  useEffect(() => register(handler), [register, handler])
}

/** The button's own side: press it. */
export function useFabTrigger(): () => void {
  return useFabContext().trigger
}
