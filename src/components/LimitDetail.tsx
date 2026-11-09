import { Link } from 'react-router-dom'
import type { DayTaskLimit } from '../api/tracker'
import { limitLogUnit, limitNumber, limitStatus, limitVerdict } from '../lib/taskLabels'

/**
 * A limit task's verdict as the few words a row has room for - "3 left",
 * "2 over", "reached" - plus the full sentence for screen readers. Links to
 * the unit's page, which is where the numbers behind it are logged.
 */
export function LimitDetail({ limit }: { limit: DayTaskLimit }) {
  const { unit, direction, target, used, final, period, measure } = limit
  const atLeast = direction === 'atLeast'
  const { bad } = limitVerdict(limit)
  const symbol = unit.symbol ? ` ${unit.symbol}` : ''
  const scope =
    measure === 'average'
      ? final
        ? 'daily average that week'
        : 'daily average this week'
      : final
        ? period === 'day'
          ? 'day total'
          : 'week total'
        : period === 'day'
          ? 'today'
          : 'this week'
  const status = limitStatus(limit)

  return (
    <Link
      to={`/tracking/${limitLogUnit(limit).id}`}
      className="day-item-detail"
      data-bad={bad || undefined}
      aria-label={`${unit.name}: ${limitNumber(used, unit.decimals)} of ${atLeast ? 'at least ' : ''}${limitNumber(target, unit.decimals)}${symbol} ${scope}, ${status}`}
    >
      {status}
    </Link>
  )
}
