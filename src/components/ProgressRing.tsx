import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'

/**
 * A Fitness-style ring in the goal's colour: done fills from the top, failed
 * picks up in red where done stops, and the rest is track - a light step of
 * the goal's own colour rather than grey, the way a meter's empty part reads
 * as "more of this to come". Wrap it (or an ancestor) in `data-goal-color`.
 *
 * Springs to each new count, so ticking a task visibly closes it a little.
 */
export function ProgressRing({
  done,
  failed = 0,
  total,
  size = 30,
  stroke = 4,
  children,
  label,
}: {
  done: number
  failed?: number
  total: number
  size?: number
  stroke?: number
  /** In the middle - a big ring's percentage. */
  children?: ReactNode
  /** For assistive tech; the ring is decorative without one. */
  label?: string
}) {
  const radius = (size - stroke) / 2
  const centre = size / 2
  const doneFraction = total > 0 ? Math.min(done / total, 1) : 0
  const failedFraction = total > 0 ? Math.min(failed / total, 1 - doneFraction) : 0
  const reduceMotion = useReducedMotion()
  const transition = reduceMotion ? { duration: 0 } : ({ type: 'spring', bounce: 0, duration: 0.7 } as const)

  return (
    <span
      className="progress-ring"
      style={{ width: size, height: size }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
        <circle className="progress-ring-track" cx={centre} cy={centre} r={radius} strokeWidth={stroke} />
        <g transform={`rotate(-90 ${centre} ${centre})`}>
          <motion.circle
            className="progress-ring-failed"
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
            className="progress-ring-done"
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
      {children && <span className="progress-ring-centre">{children}</span>}
    </span>
  )
}
