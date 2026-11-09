import type { SeriesPoint, UnitAggregation } from '../api/trackingUnits'
import { dayCount, shiftDay } from '../lib/date'

const WIDTH = 128
const HEIGHT = 40
const PAD = 5

/** A bar with 4px-rounded top corners standing on the baseline. */
function barPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(4, width / 2, height)
  const bottom = y + height
  return [
    `M${x},${bottom}`,
    `V${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    `H${x + width - r}`,
    `Q${x + width},${y} ${x + width},${y + r}`,
    `V${bottom}`,
    'Z',
  ].join(' ')
}

/**
 * The trend on a Health-style card, ending on the day in view. A stat tile's
 * sparkline: the history in a de-emphasised grey, and only the day in view in
 * the accent - the one value the card's figure is about.
 *
 *  - A unit whose latest reading counts (weight) is 30 days of 2px line, the
 *    day in view an 8px dot ringed in the card's colour. A stretch of more
 *    than a week with nothing logged breaks the line.
 *  - A unit that adds up (coffees) is 14 days of bars, at most 24px wide with
 *    rounded tops and 2px gaps.
 *  - A target, if set, is a dashed rule.
 *
 * Unlogged days are gaps, never zeros - the same rule as lib/series.
 */
export function Sparkline({
  points,
  endDay,
  aggregation,
  target,
  label,
}: {
  /** The unit's whole series, oldest first. */
  points: SeriesPoint[]
  endDay: string
  aggregation: UnitAggregation
  target?: number | null
  label: string
}) {
  const span = aggregation === 'sum' ? 14 : 30
  const startDay = shiftDay(endDay, -(span - 1))
  const inWindow = points.filter((point) => point.date >= startDay && point.date <= endDay)
  if (inWindow.length === 0) return <span className="sparkline sparkline-empty" aria-hidden="true" />

  const values = inWindow.map((point) => point.value)
  if (target != null) values.push(target)
  // Bars stand on zero; a line is scaled to its own range, with a little air.
  let min = aggregation === 'sum' ? 0 : Math.min(...values)
  let max = Math.max(...values)
  if (max === min) {
    max += 1
    if (aggregation !== 'sum') min -= 1
  }
  const y = (value: number) => PAD + (1 - (value - min) / (max - min)) * (HEIGHT - PAD * 2)
  const slot = (WIDTH - PAD * 2) / span
  const indexOf = (day: string) => dayCount(startDay, day) - 1
  const today = inWindow.find((point) => point.date === endDay)

  const targetLine =
    target != null ? (
      <line
        className="sparkline-target"
        x1={0}
        x2={WIDTH}
        y1={y(target)}
        y2={y(target)}
      />
    ) : null

  if (aggregation === 'sum') {
    const width = Math.min(24, slot - 2)
    return (
      <svg className="sparkline" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} role="img" aria-label={label}>
        {targetLine}
        {inWindow.map((point) => {
          const x = PAD + indexOf(point.date) * slot + (slot - width) / 2
          const top = y(point.value)
          const height = Math.max(HEIGHT - PAD - top, point.value > 0 ? 2 : 0)
          return (
            <path
              key={point.date}
              className="sparkline-bar"
              data-current={point.date === endDay || undefined}
              d={barPath(x, HEIGHT - PAD - height, width, height)}
            />
          )
        })}
      </svg>
    )
  }

  const x = (day: string) => PAD + indexOf(day) * slot + slot / 2
  const segments: string[] = []
  let current = ''
  let previous: string | null = null
  for (const point of inWindow) {
    const gap = previous ? dayCount(previous, point.date) - 1 : 0
    if (previous && gap > 7) {
      segments.push(current)
      current = ''
    }
    current += `${current ? 'L' : 'M'}${x(point.date).toFixed(1)},${y(point.value).toFixed(1)} `
    previous = point.date
  }
  segments.push(current)

  return (
    <svg className="sparkline" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width={WIDTH} height={HEIGHT} role="img" aria-label={label}>
      {targetLine}
      {segments.map((d, index) =>
        d.includes('L') ? (
          <path key={index} className="sparkline-line" d={d} />
        ) : (
          // A lone reading between gaps is still worth a mark.
          <circle key={index} className="sparkline-point" cx={d.split(/[M,\s]/)[1]} cy={d.split(/[M,\s]/)[2]} r={1.5} />
        ),
      )}
      {today && <circle className="sparkline-dot" cx={x(today.date)} cy={y(today.value)} r={4} />}
    </svg>
  )
}
