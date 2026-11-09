import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from 'motion/react'
import { VelocityTracker, rubberband, springFlick, springSnappy } from '../lib/motion'
import { FloatingAddButton } from './FloatingAddButton'
import {
  CalendarIcon,
  GoalIcon,
  MenuIcon,
  OverviewIcon,
  ThinkTankIcon,
  TodayIcon,
  TrackingIcon,
} from './icons'

interface Tab {
  to: string
  label: string
  icon: ReactNode
}

const TABS: Tab[] = [
  { to: '/', label: 'Today', icon: <TodayIcon /> },
  { to: '/goals', label: 'Goals', icon: <GoalIcon /> },
  { to: '/overview', label: 'Overview', icon: <OverviewIcon /> },
  { to: '/calendar', label: 'Calendar', icon: <CalendarIcon /> },
  { to: '/think-tank', label: 'Think tank', icon: <ThinkTankIcon /> },
  { to: '/tracking', label: 'Tracking', icon: <TrackingIcon /> },
]

/* Overview's timeline is a desktop screen, so a phone's bar leaves it out.
   The route still works there; the bar just doesn't offer it. */
const PHONE = '(max-width: 40rem)'
const PHONE_TABS = TABS.filter((tab) => tab.to !== '/overview')

const readPhone = () => window.matchMedia(PHONE).matches

function subscribePhone(onChange: () => void): () => void {
  const query = window.matchMedia(PHONE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** How far (px) a finger moves before a press becomes a scrub along the bar. */
const SCRUB_SLOP = 10
/** Lift the finger this far (px) above the bar and letting go selects nothing. */
const CANCEL_DISTANCE = 56

/** The tab a path lives under - a goal's page is still Goals. -1 off the map. */
function tabOf(tabs: Tab[], pathname: string): number {
  if (pathname === '/') return 0
  return tabs.findIndex((tab, index) => index > 0 && (pathname === tab.to || pathname.startsWith(`${tab.to}/`)))
}

interface Press {
  pointerId: number
  /** The first tab's left edge and every tab's width, read once on the press. */
  originX: number
  cell: number
  barTop: number
  startX: number
  /** Where the lens was sent on the press, in tabs. */
  startPos: number
  scrubbing: boolean
  away: boolean
  tracker: VelocityTracker
}

/**
 * The tab bar, as iOS 26 draws it: a capsule of glass floating over the page,
 * with the filters and the add button as glass circles either side (Mail's
 * toolbar). The selected tab sits in a lens - one shared element that slides
 * from tab to tab on a spring, so a second tap mid-slide redirects it from
 * where it is.
 *
 * On touch the lens is also a handle: it jumps to the tab under the finger
 * the moment it lands and lifts, follows the finger 1:1 along the bar (soft
 * at either end), and letting go opens the tab it's over. Drag well above the
 * bar and letting go cancels. A tap on the tab already open goes back to its
 * top, the way iOS does. Mouse and keyboard get plain links.
 */
export function AppNav({ onOpenSidebar }: { onOpenSidebar: () => void }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const tabs = useSyncExternalStore(subscribePhone, readPhone) ? PHONE_TABS : TABS
  const last = tabs.length - 1
  const clampTab = (value: number) => Math.min(last, Math.max(0, Math.round(value)))
  const active = tabOf(tabs, pathname)

  // The lens's position in tabs (0 = the first), and how lifted it is (0-1).
  const pos = useMotionValue(Math.max(0, active))
  const lift = useMotionValue(0)
  const lensX = useTransform(pos, (value) => `${value * 100}%`)
  const lensScale = useTransform(lift, [0, 1], [1, 1.14])

  const [pressing, setPressing] = useState(false)
  const [hot, setHot] = useState<number | null>(null)

  const press = useRef<Press | null>(null)
  const lensTarget = useRef(Math.max(0, active))
  const lensAnimation = useRef<AnimationPlaybackControls | null>(null)
  // A touch the bar handled itself must not also arrive as a link's click.
  const swallowClickUntil = useRef(0)

  function slideLens(to: number, velocity = 0) {
    lensTarget.current = to
    lensAnimation.current?.stop()
    if (reduceMotion) {
      pos.set(to)
      return
    }
    // A finger that let go mid-throw carries its speed in, with a touch of overshoot.
    const transition = Math.abs(velocity) > 4 ? springFlick : springSnappy
    lensAnimation.current = animate(pos, to, { ...transition, velocity })
  }

  function setLift(to: number) {
    if (reduceMotion) return
    animate(lift, to, springSnappy)
  }

  // Wherever the route goes - a tab tapped, a link inside a page, back - the
  // lens follows, unless a finger is holding it.
  const followRoute = useEffectEvent((to: number) => {
    if (press.current || to < 0 || to === lensTarget.current) return
    slideLens(to)
  })
  useEffect(() => followRoute(active), [active])

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse' || !event.isPrimary || event.button !== 0) return
    const tabs = event.currentTarget.querySelectorAll('a')
    const first = tabs[0].getBoundingClientRect()
    const cell = first.width
    const index = clampTab(Math.floor((event.clientX - first.left) / cell))
    const tracker = new VelocityTracker()
    tracker.reset(event.clientX, event.timeStamp)

    event.currentTarget.setPointerCapture(event.pointerId)
    press.current = {
      pointerId: event.pointerId,
      originX: first.left,
      cell,
      barTop: event.currentTarget.getBoundingClientRect().top,
      startX: event.clientX,
      startPos: index,
      scrubbing: false,
      away: false,
      tracker,
    }
    // Answer on the press, not the release: the lens is already there.
    slideLens(index)
    setLift(1)
    setPressing(true)
    setHot(index)
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const current = press.current
    if (!current || current.pointerId !== event.pointerId) return
    current.tracker.add(event.clientX, event.timeStamp)

    const away = event.clientY < current.barTop - CANCEL_DISTANCE
    if (away !== current.away) {
      current.away = away
      setLift(away ? 0 : 1)
      setHot(away ? null : clampTab(pos.get()))
    }

    const dx = event.clientX - current.startX
    if (!current.scrubbing) {
      if (Math.abs(dx) < SCRUB_SLOP) return
      current.scrubbing = true
      lensAnimation.current?.stop()
    }

    // 1:1 from where the lens was picked up, minus the slop so it doesn't jump.
    const raw = current.startPos + (dx - Math.sign(dx) * SCRUB_SLOP) / current.cell
    let next = raw
    if (raw < 0) next = rubberband(raw * current.cell, current.cell) / current.cell
    else if (raw > last) next = last + rubberband((raw - last) * current.cell, current.cell) / current.cell
    pos.set(next)

    if (current.away) return
    const over = clampTab(next)
    if (over !== hot) {
      setHot(over)
      // A detent as the lens settles over the next tab.
      navigator.vibrate?.(8)
    }
  }

  function finish(event: ReactPointerEvent<HTMLDivElement>, commit: boolean) {
    const current = press.current
    if (!current || current.pointerId !== event.pointerId) return
    press.current = null
    swallowClickUntil.current = performance.now() + 600
    setPressing(false)
    setHot(null)
    setLift(0)

    const home = Math.max(0, active)
    if (!commit || current.away) {
      slideLens(home, current.tracker.velocity(event.timeStamp) / current.cell)
      return
    }

    const target = current.scrubbing ? clampTab(pos.get()) : current.startPos
    const velocity = current.scrubbing ? current.tracker.velocity(event.timeStamp) / current.cell : 0
    slideLens(target, velocity)

    const tab = tabs[target]
    if (pathname !== tab.to) navigate(tab.to)
    else if (!current.scrubbing) {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' })
    }
  }

  function handleClickCapture(event: ReactMouseEvent) {
    if (performance.now() < swallowClickUntil.current) event.preventDefault()
  }

  return (
    <nav className="app-nav" aria-label="Tabs">
      {/* Only on show where the sidebar itself isn't - see App.css. */}
      <button
        type="button"
        className="app-nav-menu app-nav-glass"
        aria-label="Open filters"
        onClick={onOpenSidebar}
      >
        <MenuIcon />
      </button>

      <div
        className="app-nav-tabs app-nav-glass"
        style={{ '--tab-count': tabs.length } as CSSProperties}
        data-pressing={pressing || undefined}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => finish(event, true)}
        onPointerCancel={(event) => finish(event, false)}
        onClickCapture={handleClickCapture}
        onContextMenu={(event) => {
          if (pressing) event.preventDefault()
        }}
      >
        <motion.span
          className="app-nav-lens"
          aria-hidden="true"
          data-hidden={(active < 0 && !pressing) || undefined}
          style={{ x: lensX, scale: lensScale }}
        />
        {tabs.map((tab, index) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            className="app-nav-tab"
            title={tab.label}
            aria-label={tab.label}
            draggable={false}
            data-hot={hot === index || undefined}
          >
            {tab.icon}
          </NavLink>
        ))}
      </div>

      <FloatingAddButton />
    </nav>
  )
}
