import { useId } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { PERIODS, type Period } from '../lib/series'
import type { PageDirection } from '../lib/chartGestures'

/**
 * Critically damped - it settles without overshoot. A tap on a segment has no
 * momentum behind it, so a bounce would be decoration, not physics.
 */
const THUMB_SPRING = { type: 'spring', bounce: 0, duration: 0.3 } as const

/**
 * An iOS-style segmented control. The selected segment's raised thumb is one
 * shared element that slides to whichever segment is chosen next - a spring,
 * so tapping again mid-slide redirects it from where it is rather than
 * jumping.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { id: T; label: string; name?: string; disabled?: boolean; title?: string }[]
  onChange: (value: T) => void
}) {
  const thumbId = useId()
  const reduceMotion = useReducedMotion()

  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => {
        const selected = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            aria-label={option.name}
            disabled={option.disabled}
            title={option.title ?? option.name}
            onClick={() => onChange(option.id)}
          >
            {selected && (
              <motion.span
                layoutId={thumbId}
                className="segmented-thumb"
                transition={reduceMotion ? { duration: 0 } : THUMB_SPRING}
              />
            )}
            <span className="segmented-label">{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}

/** Apple Health's W · M · 6M · Y · All strip, shared by a unit's page and the compare page. */
export function PeriodPicker({
  value,
  onChange,
}: {
  value: Period
  onChange: (period: Period) => void
}) {
  return (
    <Segmented
      label="Period"
      value={value}
      onChange={onChange}
      options={PERIODS.map((option) => ({ id: option.id, label: option.label, name: option.name }))}
    />
  )
}

/**
 * ‹ › beside the headline: step through calendar periods, as far as the
 * page's `canStep` allows - the swipe asks the same question. "All" has
 * nothing to page through.
 */
export function PeriodPager({
  period,
  canStep,
  onStep,
}: {
  period: Period
  canStep: (direction: PageDirection) => boolean
  onStep: (direction: PageDirection) => void
}) {
  if (period === 'all') return null
  return (
    <div className="period-pager">
      <button
        type="button"
        className="icon-btn"
        aria-label="Previous period"
        disabled={!canStep(-1)}
        onClick={() => onStep(-1)}
      >
        ‹
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Next period"
        disabled={!canStep(1)}
        onClick={() => onStep(1)}
      >
        ›
      </button>
    </div>
  )
}
