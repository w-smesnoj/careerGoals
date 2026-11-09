import type { CSSProperties, MouseEvent, PointerEvent, Ref } from 'react'
import { Link } from 'react-router-dom'
import type { SpecialDayOccurrence } from '../api/specialDays'
import { formatDayLong, isWeekend, weekdayShort } from '../lib/date'
import { completionLabel, heatTotals, type DayHeat } from '../lib/dayHeat'
import { buildMonth, MONTH_COUNT, type PlannerDay, type PlannerMonth } from '../lib/plannerMonths'
import { byLabelOrder, describeDay } from '../lib/specialDays'

/** A run of month indices, inclusive - the part of the strip that's rendered. */
export interface MonthRange {
  first: number
  last: number
}

// Built once: a formatter per column per render would be dozens of them.
const longName = new Intl.DateTimeFormat(undefined, { month: 'long' })
const shortName = new Intl.DateTimeFormat(undefined, { month: 'short' })
const fullLabel = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

const NO_EVENTS: SpecialDayOccurrence[] = []

/**
 * How long a finger rests on a month before it lights up - UIScrollView's
 * delay before its content sees a touch. A pan is under way well before
 * then, so panning across the strip never lights anything.
 */
const PRESS_DELAY = 150

/**
 * Lights a month while it's pressed: a mouse at once, a finger only once
 * it has held still past PRESS_DELAY. The pan that takes the finger over
 * ends it with a pointercancel, as a lift does with a pointerup. Set on the
 * element directly - re-rendering the strip for it would cost a frame just
 * as a pan starts.
 */
function pressMonth(event: PointerEvent<HTMLElement>) {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return
  const column = event.currentTarget
  const light = () => {
    column.dataset.pressed = 'true'
  }
  let timer: number | undefined
  if (event.pointerType === 'mouse') light()
  else timer = window.setTimeout(light, PRESS_DELAY)
  const release = () => {
    window.clearTimeout(timer)
    delete column.dataset.pressed
    window.removeEventListener('pointerup', release)
    window.removeEventListener('pointercancel', release)
  }
  window.addEventListener('pointerup', release)
  window.addEventListener('pointercancel', release)
}

/**
 * Every month in reach as one strip, laid out like a wall planner: months as
 * columns, days 1-31 as rows, so a date sits on the same line in every
 * month. Only `rendered` is in the DOM; each month sits on its own track
 * of the strip's grid, so months coming and going never move the rest.
 *
 * Presentation only: what's on each day comes in as `byDay`, already
 * filtered by the special-days preferences, and how each day so far went as
 * `completion`. That one can be there with the layer off: the bars stay in
 * the DOM, hidden, so the page can draw them in and out (see App.css).
 * A month column is one link - tapping anywhere in it opens that month.
 */
export function MonthStrip({
  ref,
  rendered,
  byDay,
  completion,
  showCompletion,
  today,
  onOpenMonth,
}: {
  ref?: Ref<HTMLDivElement>
  rendered: MonthRange
  byDay: Map<string, SpecialDayOccurrence[]>
  completion: Map<string, DayHeat> | null
  showCompletion: boolean
  today: string
  onOpenMonth: (index: number, column: HTMLElement) => void
}) {
  const indices = Array.from(
    { length: rendered.last - rendered.first + 1 },
    (_, offset) => rendered.first + offset,
  )

  return (
    <div
      ref={ref}
      className="planner-strip"
      style={{ gridTemplateColumns: `repeat(${MONTH_COUNT}, var(--planner-col))` }}
    >
      {indices.map((index) => (
        <MonthColumn
          key={index}
          month={buildMonth(index)}
          byDay={byDay}
          completion={completion}
          showCompletion={showCompletion}
          today={today}
          onOpen={onOpenMonth}
        />
      ))}
    </div>
  )
}

function MonthColumn({
  month,
  byDay,
  completion,
  showCompletion,
  today,
  onOpen,
}: {
  month: PlannerMonth
  byDay: Map<string, SpecialDayOccurrence[]>
  completion: Map<string, DayHeat> | null
  showCompletion: boolean
  today: string
  onOpen: (index: number, column: HTMLElement) => void
}) {
  const first = new Date(month.year, month.month, 1)
  const label = fullLabel.format(first)
  const count = new Set(
    month.days.flatMap((day) => (byDay.get(day.key) ?? NO_EVENTS).map((event) => event.id)),
  ).size
  const totals =
    showCompletion && completion ? heatTotals(completion, month.days.map((day) => day.key)) : null
  const description = [
    label,
    count > 0 && `${count} special ${count === 1 ? 'day' : 'days'}`,
    totals && `${totals.rate}% done`,
  ]
    .filter(Boolean)
    .join(', ')

  // A real link, so a modified click still opens the month in a new tab; a
  // plain one zooms into it in place.
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onOpen(month.index, event.currentTarget)
  }

  return (
    <Link
      to={`/calendar/${month.key}`}
      className="planner-month"
      style={{ gridColumn: month.index + 1 }}
      aria-label={description}
      data-current={month.key === today.slice(0, 7) || undefined}
      data-past={month.days[month.days.length - 1].key < today || undefined}
      onPointerDown={pressMonth}
      onClick={handleClick}
    >
      <h2 className="planner-month-name">
        <span className="planner-month-label">
          <span className="planner-month-long">{longName.format(first)}</span>
          <span className="planner-month-short">{shortName.format(first)}</span>
          {/* Where one year turns into the next. */}
          {month.month === 0 && <span className="planner-month-year">{month.year}</span>}
        </span>
        {/* The month so far, with the Completion layer on. */}
        {totals && <span className="planner-month-rate">{totals.rate}%</span>}
      </h2>
      {month.days.map((day) => (
        <PlannerCell
          key={day.key}
          day={day}
          events={byDay.get(day.key) ?? NO_EVENTS}
          heat={completion?.get(day.key)}
          showCompletion={showCompletion}
          today={today}
        />
      ))}
    </Link>
  )
}

/** A cell's tooltip: its special days, how it went, or both. */
function cellTitle(day: string, events: SpecialDayOccurrence[], heat: DayHeat | undefined): string | undefined {
  const special = events.length > 0 ? describeDay(day, events) : null
  if (!heat) return special ?? undefined
  return special ? `${special} · ${completionLabel(heat)}` : `${formatDayLong(day)}: ${completionLabel(heat)}`
}

function PlannerCell({
  day,
  events,
  heat,
  showCompletion,
  today,
}: {
  day: PlannerDay
  events: SpecialDayOccurrence[]
  /** How the day went, once something was due. */
  heat: DayHeat | undefined
  showCompletion: boolean
  today: string
}) {
  const sorted = events.length > 1 ? [...events].sort(byLabelOrder) : events
  const off =
    isWeekend(day.weekday) ||
    events.some((event) => event.source === 'holidays' && event.workFree)
  // Time off - a vacation, sick days - tints the day in its category's hue.
  // Where two overlap, the one named first wins.
  const band = sorted.find((event) => event.band)
  // A band is named where it starts, and again at the top of each month it
  // runs on into - otherwise a column would show a band with no name.
  const labelled = sorted.filter(
    (event) => !event.band || event.startDate === day.key || day.date === 1,
  )
  const label = labelled[0]
  const more = labelled.length - 1
  const isToday = day.key === today

  return (
    <div
      className="planner-day"
      data-day={day.key}
      data-off={off || undefined}
      data-band={band ? true : undefined}
      data-hue={band?.category.color}
      data-today={isToday || undefined}
      data-past={day.key < today || undefined}
      aria-current={isToday ? 'date' : undefined}
      // The whole list, where a cell only has room for one name.
      title={cellTitle(day.key, events, showCompletion ? heat : undefined)}
    >
      {/* Behind the row: a track for what was due, filled by how much got
          done. Shown and hidden by the page, never mounted for it. */}
      {heat && (
        <span
          className="completion-bar"
          style={{ '--rate': heat.done / heat.scheduled, '--order': day.date } as CSSProperties}
          aria-hidden="true"
        >
          <span className="completion-bar-fill" />
        </span>
      )}
      <span className="planner-num">{day.date}</span>
      <span className="planner-wd">{weekdayShort(day.weekday)}</span>
      {label && (
        <span className="planner-label" data-hue={label.category.color}>
          {label.title}
          {label.age !== null && <span className="planner-age">{label.age}</span>}
        </span>
      )}
      {more > 0 && <span className="planner-more">+{more}</span>}
      {day.week !== null && <span className="planner-week">{day.week}</span>}
    </div>
  )
}
