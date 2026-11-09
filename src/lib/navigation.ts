import { useNavigate } from 'react-router-dom'
import { prefersReducedMotion } from './motion'

/*
 * iOS push navigation on a declarative <BrowserRouter>: a detail page slides
 * in from the right over the list it came from, and slides back out on
 * "‹ Back". Done with the View Transitions API - React Router's own
 * `viewTransition` option only exists for data routers, so the transition
 * here waits for the router to commit the new route itself (see
 * signalRouteCommit, called from a layout effect in App).
 *
 * Only our own push and back buttons animate. Browser back and the iOS edge
 * swipe already animate natively and get no second transition; without the
 * API, or with reduced motion, navigation is simply instant.
 */

/** `zoom-in`/`zoom-out` grow a page out of the thing tapped and shrink it back
 *  - the calendar's month opening out of its column. */
export type NavDirection = 'push' | 'pop' | 'zoom-in' | 'zoom-out'

/** Where a zoom is anchored, in viewport pixels. */
export interface ZoomOrigin {
  x: number
  y: number
}

let resolveCommit: (() => void) | null = null

/** Called once the router has rendered a new location (App's layout effect). */
export function signalRouteCommit(): void {
  resolveCommit?.()
  resolveCommit = null
}

function nextCommit(): Promise<void> {
  return new Promise((resolve) => {
    resolveCommit = resolve
    // Never hold the screen frozen if a commit somehow doesn't come.
    window.setTimeout(resolve, 600)
  })
}

export function transitionNavigate(
  direction: NavDirection,
  go: () => void,
  origin?: ZoomOrigin,
): void {
  if (typeof document.startViewTransition !== 'function' || prefersReducedMotion()) {
    go()
    return
  }
  const root = document.documentElement
  root.dataset.nav = direction
  // Read by the zoom keyframes as their transform-origin; without one a zoom
  // grows from the middle of the screen.
  if (origin) {
    root.style.setProperty('--zoom-x', `${origin.x}px`)
    root.style.setProperty('--zoom-y', `${origin.y}px`)
  }
  const transition = document.startViewTransition(async () => {
    const committed = nextCommit()
    go()
    await committed
  })
  void transition.finished.finally(() => {
    if (root.dataset.nav !== direction) return
    delete root.dataset.nav
    root.style.removeProperty('--zoom-x')
    root.style.removeProperty('--zoom-y')
  })
}

/** Navigate forward with the push slide. */
export function usePush() {
  const navigate = useNavigate()
  return (to: string) => transitionNavigate('push', () => navigate(to))
}

/**
 * "‹ Back": back through history when there's an in-app page to go back to,
 * otherwise (a detail page opened directly) up to `fallback`, the list it
 * belongs to - either way with the pop slide. With `zoomTo`, the page shrinks
 * back into the point it returns, instead of sliding away.
 */
export function useBack(fallback: string, zoomTo?: () => ZoomOrigin | undefined) {
  const navigate = useNavigate()
  return () => {
    const index = (window.history.state as { idx?: number } | null)?.idx ?? 0
    transitionNavigate(
      zoomTo ? 'zoom-out' : 'pop',
      () => {
        if (index > 0) navigate(-1)
        else navigate(fallback, { replace: true })
      },
      zoomTo?.(),
    )
  }
}

/** Scroll positions by history entry, so going back lands where you left. */
const scrollPositions = new Map<string, number>()

export function rememberScroll(key: string, y: number): void {
  scrollPositions.set(key, y)
}

export function recallScroll(key: string): number {
  return scrollPositions.get(key) ?? 0
}
