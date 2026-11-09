import { useEffect, useState } from 'react'

/**
 * How much of the bottom of the layout viewport the on-screen keyboard is
 * covering, in px - 0 when it's down, and always 0 on a desktop.
 *
 * iOS doesn't shrink the layout viewport for its keyboard; only the visual
 * viewport shrinks, so anything pinned to the bottom ends up under the keys.
 * This is the gap between the two, for whatever has to stay above them (a
 * sheet's panel). Android with `interactive-widget=resizes-content` resizes
 * the layout instead, and this
 * stays 0 there - which is also right.
 */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return

    function measure() {
      if (!viewport) return
      const covered = window.innerHeight - (viewport.height + viewport.offsetTop)
      // A few px of rounding is not a keyboard.
      setInset(covered > 40 ? Math.round(covered) : 0)
    }

    measure()
    viewport.addEventListener('resize', measure)
    viewport.addEventListener('scroll', measure)
    return () => {
      viewport.removeEventListener('resize', measure)
      viewport.removeEventListener('scroll', measure)
    }
  }, [])

  return inset
}
