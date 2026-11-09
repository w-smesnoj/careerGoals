import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCompactBar } from '../hooks/useCompactBar'
import { dayCount, formatDayLong, shiftDay, todayKey } from '../lib/date'

const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const dateFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function asDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

/**
 * The large title names the day the way you'd say it - Today, Yesterday,
 * Tomorrow, else its weekday - and the line above it carries the date, plus
 * how far away it is when the title alone doesn't say.
 */
function describe(date: string): { title: string; eyebrow: string } {
  const today = todayKey()
  const offset = date >= today ? dayCount(today, date) - 1 : -(dayCount(date, today) - 1)
  if (offset === 0) return { title: 'Today', eyebrow: formatDayLong(date) }
  if (offset === -1) return { title: 'Yesterday', eyebrow: formatDayLong(date) }
  if (offset === 1) return { title: 'Tomorrow', eyebrow: formatDayLong(date) }
  const distance = offset < 0 ? `${-offset} days ago` : `in ${offset} days`
  return {
    title: weekdayFormat.format(asDate(date)),
    eyebrow: `${dateFormat.format(asDate(date))} · ${distance}`,
  }
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} />
    </svg>
  )
}

/**
 * The day header Today, Tracking and Goals browse a day with, in the iOS
 * large-title style: the day as a big left-aligned title, its date in small
 * caps above, and the controls grouped at the trailing edge. Away from today
 * a "Today" button appears - the way back is always one tap.
 *
 * The title slides in from the side the day came from - the previous day
 * from the left, the next from the right - so stepping through days reads
 * as moving along a line rather than the text just changing.
 *
 * Once the large title scrolls off (hooks/useCompactBar), a compact
 * translucent bar fades in at the top with the same title and arrows, so the day in view and the way to
 * change it are never more than a glance away.
 *
 * Capped at today by default: nothing on those screens has a reading for a day
 * that hasn't happened yet. Goals and Today opt out with `allowFuture`.
 */
export function DayNav({
  date,
  onChange,
  allowFuture = false,
}: {
  date: string
  onChange: (date: string) => void
  allowFuture?: boolean
}) {
  const isToday = date === todayKey()
  const canGoForward = allowFuture || !isToday
  const { title, eyebrow } = describe(date)
  const [direction, setDirection] = useState<1 | -1>(1)
  const reduceMotion = useReducedMotion()

  const { ref: largeRef, compact } = useCompactBar<HTMLDivElement>()

  function go(next: string) {
    setDirection(next > date ? 1 : -1)
    onChange(next)
  }

  const shift = reduceMotion ? 0 : 18
  const titleMotion = {
    initial: (dir: 1 | -1) => ({ x: dir * shift, opacity: 0 }),
    animate: { x: 0, opacity: 1 },
    exit: (dir: 1 | -1) => ({ x: -dir * shift, opacity: 0 }),
  }
  const titleTransition = { type: 'spring', bounce: 0, duration: 0.32 } as const

  const steppers = (
    <>
      <button
        type="button"
        className="day-nav-step"
        onClick={() => go(shiftDay(date, -1))}
        aria-label="Previous day"
      >
        <Chevron direction="left" />
      </button>
      <button
        type="button"
        className="day-nav-step"
        onClick={() => go(shiftDay(date, 1))}
        aria-label="Next day"
        disabled={!canGoForward}
      >
        <Chevron direction="right" />
      </button>
    </>
  )

  return (
    <div className="day-nav">
      <div className="day-nav-large" ref={largeRef}>
        <div className="day-nav-heading">
          <span className="day-nav-eyebrow">{eyebrow}</span>
          <AnimatePresence initial={false} custom={direction} mode="popLayout">
            <motion.h1
              key={date}
              className="day-nav-title"
              custom={direction}
              variants={titleMotion}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={titleTransition}
            >
              {title}
            </motion.h1>
          </AnimatePresence>
        </div>

        <div className="day-nav-controls">
          {!isToday && (
            <button type="button" className="day-nav-today" onClick={() => go(todayKey())}>
              Today
            </button>
          )}
          {steppers}
        </div>
      </div>

      {/* Portalled out of the page: the page recedes under a sheet by being
          scaled, and a fixed bar inside a transformed element would scroll
          away with it instead of staying on the screen. */}
      {createPortal(
      <div className="day-nav-bar" data-visible={compact || undefined} aria-hidden={!compact}>
        <div className="day-nav-bar-inner">
          <button
            type="button"
            className="day-nav-step"
            onClick={() => go(shiftDay(date, -1))}
            aria-label="Previous day"
            tabIndex={compact ? 0 : -1}
          >
            <Chevron direction="left" />
          </button>
          <span className="day-nav-bar-title">{title}</span>
          <button
            type="button"
            className="day-nav-step"
            onClick={() => go(shiftDay(date, 1))}
            aria-label="Next day"
            disabled={!canGoForward}
            tabIndex={compact ? 0 : -1}
          >
            <Chevron direction="right" />
          </button>
        </div>
      </div>,
        document.body,
      )}
    </div>
  )
}
