import { useMemo } from 'react'
import { useTracker } from '../hooks/useTracker'
import { usePrefs } from '../hooks/usePrefs'
import {
  dayStart,
  formatDayLong,
  isoWeek,
  monthGrid,
  todayKey,
  WEEK_START,
  weeksOf,
} from '../lib/date'
import { dayHeatMap, type DayHeat } from '../lib/dayHeat'

/** Narrow weekday headers in week order. Built once - a formatter per render is waste. */
const WEEKDAY_HEADERS = Array.from({ length: 7 }, (_, index) =>
  // 2024-01-07 was a Sunday, so `7 + weekday` lines up with `getDay()`.
  new Date(2024, 0, 7 + ((WEEK_START + index) % 7)).toLocaleDateString(undefined, {
    weekday: 'narrow',
  }),
)

/** What a cell says when you hover it - the colour on its own tells you nothing exact. */
function cellLabel(day: string, heat: DayHeat | undefined): string {
  const date = formatDayLong(day)
  return heat ? `${date} - ${heat.done} of ${heat.scheduled} done` : `${date} - nothing due`
}

/**
 * The sidebar month, tinted like a commit-history heatmap: the more of a day's
 * scheduled tasks were ticked, the brighter it sits. Day numbers stay hidden
 * until the calendar is hovered, leaving the KW column and weekday row as the
 * only text at rest.
 */
export function DateCalendar() {
  const today = new Date()
  const todayId = todayKey()

  const { data } = useTracker()
  const { isVisible, isGoalStatusVisible } = usePrefs()

  // Keyed on the day so the grid is one stable array to fold over, rather than
  // a fresh one every render. `dayStart` keeps it on the local calendar day -
  // `new Date('2026-09-16')` would parse as UTC midnight.
  const weeks = useMemo(() => weeksOf(monthGrid(new Date(dayStart(todayId)))), [todayId])

  // Only the days on screen, folded out of the range query the sidebar filters
  // already share - no request of its own, and a tick anywhere recolours it.
  const heat = useMemo(
    () =>
      dayHeatMap(
        data?.goals ?? [],
        weeks.flatMap((week) => week.map((cell) => cell.key)),
        { isVisible, isGoalStatusVisible },
        todayId,
      ),
    [data, weeks, isVisible, isGoalStatusVisible, todayId],
  )

  return (
    <section className="calendar" aria-label="This month">
      <header className="calendar-head">
        <span className="calendar-month">
          {today.toLocaleDateString(undefined, { month: 'long' })}
        </span>
      </header>

      <div className="calendar-grid" role="grid">
        <div className="calendar-week" role="row">
          <span className="calendar-weekday calendar-kw-head" role="columnheader">
            KW
          </span>
          {WEEKDAY_HEADERS.map((label, index) => (
            <span key={index} className="calendar-weekday" role="columnheader">
              {label}
            </span>
          ))}
        </div>

        {weeks.map((week) => (
          <div key={week[0].key} className="calendar-week" role="row">
            <span className="calendar-kw" role="rowheader">
              {isoWeek(week[0].key)}
            </span>
            {week.map((cell) => {
              const cellHeat = heat.get(cell.key)
              const label = cellLabel(cell.key, cellHeat)
              return (
                <span
                  key={cell.key}
                  role="gridcell"
                  className="calendar-day"
                  data-outside={cell.inMonth ? undefined : ''}
                  data-today={cell.key === todayId ? '' : undefined}
                  data-heat={cellHeat?.level}
                  aria-current={cell.key === todayId ? 'date' : undefined}
                  aria-label={label}
                  title={label}
                >
                  <span className="calendar-day-num">{cell.date}</span>
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
