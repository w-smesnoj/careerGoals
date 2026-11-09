import { useMemo, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import type { SpecialDay, SpecialDayCategory, SpecialDayOccurrence } from '../api/specialDays'
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons'
import { LargeTitle, NavBarButton } from '../components/LargeTitle'
import { MonthGrid } from '../components/MonthGrid'
import { SpecialDayGlyph } from '../components/specialDayGlyphs'
import { SpecialDaySheet } from '../components/SpecialDaySheet'
import { SpecialDaysDialog } from '../components/SpecialDaysDialog'
import { useDayCompletion } from '../hooks/useDayCompletion'
import { usePrefs } from '../hooks/usePrefs'
import { useSpecialDayOccurrences } from '../hooks/useSpecialDayOccurrences'
import { useCategoryIndex, useSpecialDays } from '../hooks/useSpecialDays'
import { dayCount, dayStart, formatDayShort, isoWeek, todayKey } from '../lib/date'
import { heatTotals } from '../lib/dayHeat'
import { workingDays } from '../lib/holidays'
import { fade, springSnappy } from '../lib/motion'
import { buildMonth, indexOfKey, monthAt, monthKeyAt, MONTH_COUNT } from '../lib/plannerMonths'
import { returnOrigin, setReturnMonth } from '../lib/plannerReturn'
import { expandStored, occurrencesByDay, specialLabel } from '../lib/specialDays'

/** How far the next month's content comes in from. */
const STEP_SHIFT = 24

const monthName = new Intl.DateTimeFormat(undefined, { month: 'long' })
/** "Mon 25" - a list row's trailing date. */
const rowDate = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric' })

interface MonthFigures {
  working: number
  off: number
  /** Working days from today on, in the current month only. */
  left: number | null
}

/**
 * The month's working days and days off. Counted from what's really there -
 * every day in a day-off category (vacations, sick days) and the Bundesland's
 * holidays - whatever the legend hides: a hidden vacation is still not a
 * working day.
 */
function monthFigures(
  from: string,
  to: string,
  today: string,
  stored: SpecialDay[],
  categories: ReadonlyMap<string, SpecialDayCategory>,
  bundesland: string,
): MonthFigures {
  const timeOff = expandStored(stored, from, to, categories).filter((day) => day.band)
  const isOff = occurrencesByDay(timeOff, from, to)
  const working = workingDays(from, to, bundesland).filter((day) => !isOff.has(day))
  return {
    working: working.length,
    off: dayCount(from, to) - working.length,
    left: today >= from && today <= to ? working.filter((day) => day >= today).length : null,
  }
}

/** `/calendar/:month` - one month of the calendar, in focus. */
export function MonthPage() {
  const { month = '' } = useParams()
  const index = indexOfKey(month)
  if (index === null) return <Navigate to="/calendar" replace />
  return <MonthView index={index} />
}

/**
 * A month zoomed out of the calendar's strip: its days as a calendar card,
 * how many of them are working days, and everything special in it as a list.
 * With the strip's Completion layer on, its days fill by how much of each
 * got done and the month's rate gets a card of its own.
 * "‹ 2026" zooms back into the strip, onto this month's column.
 */
function MonthView({ index }: { index: number }) {
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const today = todayKey()
  const { bundesland } = usePrefs()
  const { data: stored } = useSpecialDays()
  const { byId: categoriesById } = useCategoryIndex()
  // 0 until the month first changes: the page opens in place, with no entrance.
  const [direction, setDirection] = useState<-1 | 0 | 1>(0)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [managing, setManaging] = useState(false)

  const { year, month } = monthAt(index)
  const key = monthKeyAt(index)
  const from = `${key}-01`
  const to = `${key}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`

  const occurrences = useSpecialDayOccurrences(from, to)
  const byDay = useMemo(() => occurrencesByDay(occurrences, from, to), [occurrences, from, to])
  const figures = useMemo(
    () => monthFigures(from, to, today, stored ?? [], categoriesById, bundesland),
    [from, to, today, stored, categoriesById, bundesland],
  )
  // No switch here, so nothing to draw back out: off is simply absent.
  const { heat, shown } = useDayCompletion(from, to)
  const completion = shown ? heat : null
  const totals = useMemo(
    () => completion && heatTotals(completion, buildMonth(index).days.map((day) => day.key)),
    [completion, index],
  )

  // Replaces rather than pushes: "‹ 2026" goes back to the strip, not
  // through every month stepped past - and the strip comes back on this one.
  function stepMonth(delta: -1 | 1) {
    const next = index + delta
    if (next < 0 || next >= MONTH_COUNT) return
    setDirection(delta)
    setReturnMonth(next)
    navigate(`/calendar/${monthKeyAt(next)}`, { replace: true })
  }

  const bodyInitial =
    direction === 0
      ? false
      : reduceMotion
        ? { opacity: 0 }
        : { x: direction * STEP_SHIFT, opacity: 0 }

  return (
    <div className="ios-page month-view">
      <LargeTitle
        title={monthName.format(new Date(year, month, 1))}
        eyebrow={`${year} · KW ${isoWeek(from)}–${isoWeek(to)}`}
        back={{ label: String(year), to: '/calendar', zoomTo: returnOrigin }}
        actions={
          <>
            <NavBarButton label="Previous month" onClick={() => stepMonth(-1)}>
              <ChevronLeftIcon />
            </NavBarButton>
            <NavBarButton label="Next month" onClick={() => stepMonth(1)}>
              <ChevronRightIcon />
            </NavBarButton>
          </>
        }
      />

      {/* Keyed by month: the next one replaces this at once and only
          animates in - nothing waits on an exit. */}
      <motion.div
        key={index}
        className="month-view-body"
        initial={bodyInitial}
        animate={{ x: 0, opacity: 1 }}
        transition={reduceMotion ? fade : springSnappy}
      >
        <MonthGrid
          year={year}
          month={month}
          byDay={byDay}
          completion={completion}
          today={today}
          onSelectDay={setSelectedDay}
        />

        <section className="figure-card" aria-label="At a glance">
          <div className="figure">
            <span className="figure-value">{figures.working}</span>
            <span className="figure-caption">Working days</span>
            {figures.left !== null && <span className="figure-note">{figures.left} left</span>}
          </div>
          <div className="figure">
            <span className="figure-value">{figures.off}</span>
            <span className="figure-caption">Days off</span>
          </div>
        </section>

        {totals && (
          <section className="ios-section">
            <h2 className="ios-section-title">Completion</h2>
            <div className="figure-card">
              <div className="figure">
                <span className="figure-value" data-tone="accent">
                  {totals.rate}%
                </span>
                <span className="figure-caption">Completion</span>
                <span className="figure-note">
                  {totals.done} of {totals.scheduled} done{to >= today && ' so far'}
                </span>
              </div>
              <div className="figure">
                <span className="figure-value">{totals.fullDays}</span>
                <span className="figure-caption">Full days</span>
                <span className="figure-note">
                  of {totals.days} with tasks
                </span>
              </div>
            </div>
          </section>
        )}

        <section className="ios-section">
          <h2 className="ios-section-title">Special Days</h2>
          {occurrences.length === 0 ? (
            <p className="month-view-empty">Nothing special this month.</p>
          ) : (
            <ul className="ios-list">
              {occurrences.map((occurrence) => (
                <MonthEventRow key={occurrence.id} event={occurrence} from={from} today={today} />
              ))}
            </ul>
          )}
          <button type="button" className="ios-link-button" onClick={() => setManaging(true)}>
            Edit Special Days
          </button>
        </section>
      </motion.div>

      {selectedDay && (
        <SpecialDaySheet
          day={selectedDay}
          today={today}
          events={byDay.get(selectedDay) ?? []}
          onEdit={() => setManaging(true)}
          onClose={() => setSelectedDay(null)}
        />
      )}
      {/* Stacks over the day sheet when opened from it. */}
      {managing && <SpecialDaysDialog onClose={() => setManaging(false)} />}
    </div>
  )
}

/** One special day of the month. Past ones step back, as on the strip. */
function MonthEventRow({
  event,
  from,
  today,
}: {
  event: SpecialDayOccurrence
  from: string
  today: string
}) {
  const details = [event.category.name]
  if (event.startDate !== event.endDate) {
    details.push(`${formatDayShort(event.startDate)} – ${formatDayShort(event.endDate)}`)
  }
  // Time off says so by being time off; a holiday's day off is worth spelling out.
  if (event.workFree && !event.band) details.push('Work-free')
  if (event.note) details.push(event.note)
  // A vacation that began last month is dated by its first day in this one.
  const shownOn = event.startDate < from ? from : event.startDate

  return (
    <li className="ios-row ios-row-static" data-past={event.endDate < today || undefined}>
      <span className="ios-icon-tile" data-hue={event.category.color}>
        <SpecialDayGlyph icon={event.category.icon} />
      </span>
      <span className="ios-row-text">
        <span className="ios-row-title">{specialLabel(event)}</span>
        <span className="ios-row-subtitle">{details.join(' · ')}</span>
      </span>
      <span className="ios-row-detail">{rowDate.format(new Date(dayStart(shownOn)))}</span>
    </li>
  )
}
