import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useBack, usePush, type ZoomOrigin } from '../lib/navigation'
import { ChevronLeftIcon } from './icons'

/**
 * A link to a detail page that pushes it with the iOS slide. A real <a>, so a
 * modified click (new tab) still does what it says. `onPrefetch` runs on
 * pointer-down - the page's data is usually there before the finger lifts.
 */
export function PushLink({
  to,
  className,
  children,
  onPrefetch,
  ariaLabel,
}: {
  to: string
  className?: string
  children: ReactNode
  onPrefetch?: () => void
  ariaLabel?: string
}) {
  const push = usePush()

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    push(to)
  }

  return (
    <Link
      to={to}
      className={className}
      aria-label={ariaLabel}
      onPointerDown={onPrefetch}
      onClick={handleClick}
    >
      {children}
    </Link>
  )
}

/** "‹ Goals" - a nav bar's way back, with the pop slide (or the zoom out, given
 *  where to shrink back to). */
export function BackButton({
  label,
  to,
  zoomTo,
}: {
  label: string
  to: string
  zoomTo?: () => ZoomOrigin | undefined
}) {
  const back = useBack(to, zoomTo)
  return (
    <button type="button" className="nav-bar-back" onClick={back}>
      <ChevronLeftIcon />
      <span className="nav-bar-back-label">{label}</span>
    </button>
  )
}
