import { useEffect, useRef, useState } from 'react'

/**
 * Whether a large title has scrolled off the top of the screen - the moment an
 * iOS nav bar swaps in its small centred title and its material. Hand the ref
 * to the large title's element.
 *
 * Only once it has gone off the *top*: an element below the fold isn't
 * intersecting either, and that is not the compact state. `topInset` (px)
 * moves "the top" down - under a bar that's pinned there, a title counts as
 * gone once it has slid beneath the bar.
 */
export function useCompactBar<T extends HTMLElement>(topInset = 0) {
  const ref = useRef<T>(null)
  const [compact, setCompact] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        setCompact(!entry.isIntersecting && entry.boundingClientRect.top < topInset)
      },
      { rootMargin: `-${topInset}px 0px 0px 0px` },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [topInset])

  return { ref, compact }
}
