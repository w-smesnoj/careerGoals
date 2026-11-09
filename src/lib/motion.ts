/**
 * The app's springs, in Apple's two parameters: `bounce` (how much it
 * overshoots - 0 is critically damped) and `duration` (roughly Apple's
 * "response"). UI motion has no bounce: a sheet that rises because a button
 * was tapped has no momentum to carry past its rest. Bounce only follows a
 * flick, where the finger gave it some.
 */
export const spring = { type: 'spring', bounce: 0, duration: 0.4 } as const

/** Small things - a segment thumb, a row settling back. */
export const springSnappy = { type: 'spring', bounce: 0, duration: 0.3 } as const

/** After a throw: a little overshoot, because the gesture carried momentum. */
export const springFlick = { type: 'spring', bounce: 0.15, duration: 0.4 } as const

/** What reduced motion gets instead of travel: a short cross-fade. */
export const fade = { duration: 0.2, ease: 'easeOut' } as const

/**
 * Where a flick comes to rest - Apple's projection from "Designing Fluid
 * Interfaces": velocity in px/s, the deceleration rate scroll views use
 * (0.998) by default, 0.99 for something short and snappy like a row.
 */
export function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/**
 * Past a boundary the element follows less and less the further it's pulled -
 * real things slow before they stop. `dimension` is the size of the thing
 * being dragged, so the resistance scales with it.
 */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}

/** Whether the user asked for less motion - for code outside React. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * The last few pointer samples, for the release velocity a spring is handed.
 * Only the last ~100ms count: a finger that stopped before letting go has
 * no velocity, however fast it moved earlier.
 */
export class VelocityTracker {
  private samples: { t: number; v: number }[] = []

  reset(value: number, time: number): void {
    this.samples = [{ t: time, v: value }]
  }

  add(value: number, time: number): void {
    this.samples.push({ t: time, v: value })
    if (this.samples.length > 6) this.samples.shift()
  }

  /** px per second. */
  velocity(now: number): number {
    const recent = this.samples.filter((sample) => now - sample.t < 100)
    if (recent.length < 2) return 0
    const first = recent[0]
    const last = recent[recent.length - 1]
    const dt = last.t - first.t
    return dt > 0 ? ((last.v - first.v) / dt) * 1000 : 0
  }
}
