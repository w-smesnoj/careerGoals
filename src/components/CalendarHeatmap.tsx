import { useState } from 'react'
import type { DayHeat } from '../lib/dayHeat'
import { shiftDay, todayKey } from '../lib/date'

const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const cellFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })

/** Monday-first narrow weekday names (2024-01-01 was a Monday). */
const WEEKDAYS = Array.from({ length: 7 }, (_, index) => weekdayFormat.format(new Date(2024, 0, 1 + index)))

function asDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

/** First of each month from `from`'s through `to`'s, as day keys. */
function monthsBetween(from: string, to: string): string[] {
  const months: string[] = []
  let cursor = `${from.slice(0, 7)}-01`
  while (cursor <= to) {
    months.push(cursor)
    const date = asDate(cursor)
    const next = new Date(date.getFullYear(), date.getMonth() + 1, 1)
    cursor = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
  }
  return months
}

/** How many months show before "Show earlier". */
const RECENT_MONTHS = 3

/**
 * A goal's days as a month calendar, coloured by how much of each got done -
 * a single-hue ramp mixed from the goal's own colour, light to full. A day
 * with nothing due is left empty, never painted as a zero.
 *
 * Every judged day is a button ("3 Oct: 2 of 5 done") that opens Today on
 * that date.
 */
export function CalendarHeatmap({
  heat,
  from,
  to,
  onSelectDay,
}: {
  heat: Map<string, DayHeat>
  /** The window: the goal's start through today (or its due date). */
  from: string
  to: string
  onSelectDay: (day: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const today = todayKey()
  const months = monthsBetween(from, to)
  const shown = showAll ? months : months.slice(-RECENT_MONTHS)

  return (
    <div className="heatmap">
      {months.length > shown.length && (
        <button type="button" className="ios-link-button heatmap-earlier" onClick={() => setShowAll(true)}>
          Show {months.length - shown.length} earlier {months.length - shown.length === 1 ? 'month' : 'months'}
        </button>
      )}

      {shown.map((month) => {
        const first = asDate(month)
        const lead = (first.getDay() + 6) % 7
        const length = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
        const days = Array.from({ length }, (_, index) => shiftDay(month, index))
        return (
          <section key={month} className="heatmap-month" aria-label={monthFormat.format(first)}>
            <h3 className="heatmap-month-title">{monthFormat.format(first)}</h3>
            <div className="heatmap-grid">
              {WEEKDAYS.map((label, index) => (
                <span key={index} className="heatmap-weekday" aria-hidden="true">
                  {label}
                </span>
              ))}
              {Array.from({ length: lead }, (_, index) => (
                <span key={`lead-${index}`} aria-hidden="true" />
              ))}
              {days.map((day) => {
                const entry = heat.get(day)
                const number = Number(day.slice(-2))
                const inWindow = day >= from && day <= to
                if (!entry || !inWindow) {
                  return (
                    <span
                      key={day}
                      className="heatmap-cell"
                      data-outside={!inWindow || undefined}
                      data-today={day === today || undefined}
                      aria-hidden="true"
                    >
                      {number}
                    </span>
                  )
                }
                return (
                  <button
                    key={day}
                    type="button"
                    className="heatmap-cell"
                    data-level={entry.level}
                    data-today={day === today || undefined}
                    aria-label={`${cellFormat.format(asDate(day))}: ${entry.done} of ${entry.scheduled} done`}
                    onClick={() => onSelectDay(day)}
                  >
                    {number}
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}

      <div className="heatmap-key" aria-hidden="true">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} className="heatmap-key-cell" data-level={level} />
        ))}
        <span>More</span>
      </div>
    </div>
  )
}
