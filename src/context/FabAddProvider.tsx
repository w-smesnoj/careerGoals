import { useMemo, useRef, type ReactNode } from 'react'
import { FabAddContext, type FabAddValue } from './fabAdd'

/**
 * Lets the floating add button (mounted once, outside the routed pages) do
 * whatever the page in view says "add" means, without either side knowing
 * about the other's internals. The page hands over a handler; the press calls
 * it straight from the click - no render in between.
 */
export function FabAddProvider({ children }: { children: ReactNode }) {
  const handler = useRef<(() => void) | null>(null)

  const value = useMemo<FabAddValue>(
    () => ({
      register: (next) => {
        handler.current = next
        return () => {
          if (handler.current === next) handler.current = null
        }
      },
      trigger: () => handler.current?.(),
    }),
    [],
  )

  return <FabAddContext.Provider value={value}>{children}</FabAddContext.Provider>
}
