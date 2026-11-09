import { Fragment, useMemo, type CSSProperties } from 'react'
import type { SpecialDayOccurrence } from '../api/specialDays'
import { completionLabel, type DayHeat } from '../lib/dayHeat'
import {
  isoWeek,
  isWeekend,
  monthGrid,
  WEEK_START,
  weekdayShort,
  weeksOf,
  type CalendarCell,
} from '../lib/date'
import { byLabelOrder, describeDay } from '../lib/specialDays'

/** Two-letter weekday headers in week order, Monday first. */
const HEADERS = Array.from({ length: 7 }, (_, index) => weekdayShort((WEEK_START + index) % 7))

/** More dots than this stop being countable at a glance. */
const MAX_DOTS = 3

const NO_EVENTS: SpecialDayOccurrence[] = []

/**
 * One month as a calendar card: Monday-first weeks with their KW, days off
 * grey, time off tinted in its category's hue, today's number on the accent,
 * and a dot per category under a number. The same colours the strip uses, so the two read as
 * one calendar at two distances. With the completion layer on (`completion`
 * is null when it's off), each day so far fills from the bottom by how much
 * of it got done - the strip's bars, stood up.
 */
export function MonthGrid({
  year,
  month,
  byDay,
  completion,
  today,
  onSelectDay,
}: {
  year: number
  month: number
  byDay: Map<string, SpecialDayOccurrence[]>
  completion: Map<string, DayHeat> | null
  today: string
  onSelectDay: (day: string) => void
}) {
  const weeks = useMemo(() => weeksOf(monthGrid(new Date(year, month, 1))), [year, month])

  return (
    <section className="month-view-grid" aria-label="Days">
      <span className="month-view-head month-view-kw" aria-hidden="true">
        KW
      </span>
      {HEADERS.map((label, index) => (
        <span key={index} className="month-view-head" aria-hidden="true">
          {label}
        </span>
      ))}

      {weeks.map((week) => (
        <Fragment key={week[0].key}>
          <span className="month-view-kw">{isoWeek(week[0].key)}</span>
          {week.map((cell, column) =>
            cell.inMonth ? (
              <MonthDay
                key={cell.key}
                cell={cell}
                weekday={(WEEK_START + column) % 7}
                events={byDay.get(cell.key) ?? NO_EVENTS}
                heat={completion?.get(cell.key)}
                today={today}
                onSelect={onSelectDay}
              />
            ) : (
              <span key={cell.key} aria-hidden="true" />
            ),
          )}
        </Fragment>
      ))}
    </section>
  )
}

function MonthDay({
  cell,
  weekday,
  events,
  heat,
  today,
  onSelect,
}: {
  cell: CalendarCell
  weekday: number
  events: SpecialDayOccurrence[]
  heat: DayHeat | undefined
  today: string
  onSelect: (day: string) => void
}) {
  const off =
    isWeekend(weekday) || events.some((event) => event.source === 'holidays' && event.workFree)
  const sorted = [...events].sort(byLabelOrder)
  const band = sorted.find((event) => event.band)
  // Time off is its tint, not a dot. One dot per category, however many days
  // of it fall here.
  const dots = [
    ...new Map(
      sorted.filter((event) => !event.band).map((event) => [event.category.id, event.category]),
    ).values(),
  ].slice(0, MAX_DOTS)
  const isToday = cell.key === today

  const label = heat ? completionLabel(heat) : null
  const shared = {
    className: 'month-view-day',
    'data-off': off || undefined,
    'data-band': band ? true : undefined,
    'data-hue': band?.category.color,
    'data-today': isToday || undefined,
    'data-past': cell.key < today || undefined,
    'aria-current': isToday ? ('date' as const) : undefined,
  }
  const content = (
    <>
      {heat && (
        <span
          className="completion-fill"
          style={{ '--rate': heat.done / heat.scheduled, '--order': cell.date } as CSSProperties}
          aria-hidden="true"
        >
          <span className="completion-fill-level" />
        </span>
      )}
      <span className="month-view-num">{cell.date}</span>
      <span className="month-view-dots" aria-hidden="true">
        {dots.map((category) => (
          <span key={category.id} className="month-view-dot" data-hue={category.color} />
        ))}
      </span>
    </>
  )

  // Nothing to open on an empty day, so it isn't a control.
  if (events.length === 0) {
    return (
      <div {...shared} title={label ?? undefined}>
        {content}
        {label && <span className="visually-hidden">{label}</span>}
      </div>
    )
  }

  const description = label ? `${describeDay(cell.key, events)} · ${label}` : describeDay(cell.key, events)
  return (
    <button
      type="button"
      {...shared}
      aria-label={description}
      title={description}
      onClick={() => onSelect(cell.key)}
    >
      {content}
    </button>
  )
}
