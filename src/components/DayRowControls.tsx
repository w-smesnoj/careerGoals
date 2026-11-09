import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { DraggableSyntheticListeners } from '@dnd-kit/core'
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from 'motion/react'
import { project } from '../lib/motion'
import { CheckIcon, CrossIcon } from './icons'

/** How far (px) a row must travel - or be thrown - to commit its swipe action. */
const SWIPE_THRESHOLD = 88
/** The row follows the finger 1:1 this far, then resists - a soft edge, not a wall. */
const SWIPE_TRAVEL = 150

/** What a swipe reveals and does: the colour underneath, its glyph and label. */
export interface SwipeAction {
  label: string
  icon: ReactNode
  /** tint = the accent (done); destructive = red; the rest are system colours. */
  tone: 'tint' | 'destructive' | 'orange' | 'blue' | 'gray'
  onCommit: () => void
}

type Side = 'leading' | 'trailing' | null

/**
 * A row that can be swiped like a Mail row. Swiping right reveals the
 * `leading` action on the left, swiping left the `trailing` one on the right;
 * either side may be absent.
 *
 *  - It tracks the finger 1:1, then rubber-bands past SWIPE_TRAVEL.
 *  - Crossing the threshold "arms" the action: the icon steps up and a light
 *    haptic ticks (where the device has one) - the detent you feel in iOS.
 *  - On release the projected resting point decides (Apple's projection at
 *    the snappier 0.99 rate a short row wants), and the row springs home
 *    critically damped, carrying the finger's velocity into the return.
 *  - Grabbing it again mid-return picks it up where it is.
 *  - A swipe never ends as a click on whatever the finger lifted over.
 *
 * The same row is also picked up for reordering by pressing and holding it
 * (the list's drag-and-drop, whose listeners arrive as `contentProps`). The
 * two can't both have it: a sideways move before the hold completes is a
 * swipe, and once the row has been lifted any swipe already under way is
 * cancelled and the row settles back in line.
 */
export function SwipeRow({
  enabled,
  lifted = false,
  leading,
  trailing,
  contentProps,
  className = 'day-item-content',
  children,
}: {
  enabled: boolean
  /** Picked up for reordering. */
  lifted?: boolean
  leading?: SwipeAction
  trailing?: SwipeAction
  contentProps?: DraggableSyntheticListeners
  /** The sliding layer's class - it wears the row's card. */
  className?: string
  children: ReactNode
}) {
  const x = useMotionValue(0)
  const controls = useDragControls()
  const [armed, setArmed] = useState<Side>(null)
  const armedRef = useRef<Side>(null)
  const swiped = useRef(false)

  const trailingOpacity = useTransform(x, (value) => (value < 0 ? 1 : 0))
  const leadingOpacity = useTransform(x, (value) => (value > 0 ? 1 : 0))
  // The icon grows toward the finger as the action gets closer - the
  // in-between frames point at the outcome.
  const trailingScale = useTransform(x, [0, -SWIPE_THRESHOLD], [0.5, 1])
  const leadingScale = useTransform(x, [0, SWIPE_THRESHOLD], [0.5, 1])

  useEffect(() => {
    if (!lifted) return
    controls.cancel()
    animate(x, 0, { type: 'spring', bounce: 0, duration: 0.25 })
  }, [lifted, controls, x])

  useMotionValueEvent(x, 'change', (value) => {
    const next: Side =
      trailing && value <= -SWIPE_THRESHOLD ? 'trailing' : leading && value >= SWIPE_THRESHOLD ? 'leading' : null
    if (next === armedRef.current) return
    armedRef.current = next
    setArmed(next)
    if (next) navigator.vibrate?.(8)
  })

  if (!enabled || (!leading && !trailing)) {
    return (
      <div className={className} {...contentProps}>
        {children}
      </div>
    )
  }

  function handlePointerDown(event: ReactPointerEvent) {
    swiped.current = false
    // A link inside the row (a limit's detail) navigates; it's never the start of a swipe.
    if ((event.target as Element).closest('a:not([data-swipe-through])')) return
    controls.start(event)
  }

  function handleDragEnd(_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) {
    const projected = info.offset.x + project(info.velocity.x, 0.99)
    if (trailing && projected <= -SWIPE_THRESHOLD) trailing.onCommit()
    else if (leading && projected >= SWIPE_THRESHOLD) leading.onCommit()
  }

  function handleClickCapture(event: ReactMouseEvent) {
    if (!swiped.current) return
    swiped.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return (
    <>
      {trailing && (
        <motion.div
          className="swipe-action"
          data-side="trailing"
          data-tone={trailing.tone}
          data-armed={armed === 'trailing' || undefined}
          style={{ opacity: trailingOpacity }}
          aria-hidden="true"
        >
          <motion.span className="swipe-action-label" style={{ scale: trailingScale }}>
            {trailing.icon}
            {trailing.label}
          </motion.span>
        </motion.div>
      )}
      {leading && (
        <motion.div
          className="swipe-action"
          data-side="leading"
          data-tone={leading.tone}
          data-armed={armed === 'leading' || undefined}
          style={{ opacity: leadingOpacity }}
          aria-hidden="true"
        >
          <motion.span className="swipe-action-label" style={{ scale: leadingScale }}>
            {leading.icon}
            {leading.label}
          </motion.span>
        </motion.div>
      )}

      <motion.div
        {...contentProps}
        className={className}
        style={{ x }}
        drag="x"
        dragListener={false}
        dragControls={controls}
        dragConstraints={{ left: trailing ? -SWIPE_TRAVEL : 0, right: leading ? SWIPE_TRAVEL : 0 }}
        dragElastic={0.25}
        dragSnapToOrigin
        // Stiffness 500 with damping 45 is a damping ratio of ~1: home
        // without overshoot, at the speed the finger let go.
        dragTransition={{ bounceStiffness: 500, bounceDamping: 45 }}
        onPointerDown={handlePointerDown}
        onDragStart={() => {
          swiped.current = true
        }}
        onDragEnd={handleDragEnd}
        onClickCapture={handleClickCapture}
      >
        {children}
      </motion.div>
    </>
  )
}

/**
 * The leading mark of a day row: empty while open, filled with a check once
 * done, red with a cross once failed. One control, one place - tapping it
 * does the obvious next thing for whatever state it's in.
 *
 * Its shape says what kind of task it is, as it does in the timeline grid
 * (UncheckedBoxIcon / UncheckedRadioIcon): a recurring task is a box, ticked
 * day after day; a once task is a circle, answered one time - so a list of
 * habits and to-dos sorts itself at a glance, due date or not.
 */
export function TaskCheck({
  state,
  paused = false,
  once = false,
  label,
  onClick,
}: {
  state: 'open' | 'done' | 'failed'
  paused?: boolean
  once?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className="task-check"
      data-state={state}
      data-paused={paused || undefined}
      data-once={once || undefined}
      aria-label={label}
      onClick={onClick}
    >
      <span className="task-check-mark">
        {state === 'done' && <CheckIcon />}
        {state === 'failed' && <CrossIcon />}
      </span>
    </button>
  )
}

/**
 * A limit task's leading mark: a small gauge of how much of the budget is
 * used (or the target reached), in the slot the circle takes on other rows.
 * Read-only - the bar under the title is what links to the numbers.
 */
export function LimitGauge({ fraction, bad }: { fraction: number; bad: boolean }) {
  const size = 22
  const stroke = 3
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const length = Math.max(0, Math.min(1, fraction)) * circumference
  return (
    <span className="limit-gauge" data-bad={bad || undefined} aria-hidden="true">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle className="limit-gauge-track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} />
        {length > 0 && (
          <circle
            className="limit-gauge-fill"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            strokeDasharray={`${length} ${circumference}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
    </span>
  )
}

/**
 * The day at a glance as an Activity-style ring: done in the accent, failed
 * in red picking up where done stops, the rest as track. Springs to each new
 * count, so ticking a task off visibly closes the ring a little.
 */
export function DayRing({
  done,
  failed,
  total,
}: {
  done: number
  failed: number
  total: number
}) {
  const size = 64
  const stroke = 9
  const radius = (size - stroke) / 2
  const centre = size / 2
  const doneFraction = total > 0 ? done / total : 0
  const failedFraction = total > 0 ? failed / total : 0
  const reduceMotion = useReducedMotion()
  const transition = reduceMotion
    ? { duration: 0 }
    : ({ type: 'spring', bounce: 0, duration: 0.7 } as const)

  return (
    <svg className="day-ring" viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
      <circle className="day-ring-track" cx={centre} cy={centre} r={radius} strokeWidth={stroke} />
      <g transform={`rotate(-90 ${centre} ${centre})`}>
        <motion.circle
          className="day-ring-failed"
          cx={centre}
          cy={centre}
          r={radius}
          strokeWidth={stroke}
          initial={false}
          animate={{
            pathLength: failedFraction,
            pathOffset: doneFraction,
            // A zero-length arc with round caps would still draw a dot.
            opacity: failedFraction > 0 ? 1 : 0,
          }}
          transition={transition}
        />
        <motion.circle
          className="day-ring-done"
          cx={centre}
          cy={centre}
          r={radius}
          strokeWidth={stroke}
          initial={false}
          animate={{ pathLength: doneFraction, opacity: doneFraction > 0 ? 1 : 0 }}
          transition={transition}
        />
      </g>
    </svg>
  )
}
