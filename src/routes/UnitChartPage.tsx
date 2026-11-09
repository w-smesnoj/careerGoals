import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { TaskLimit } from '../api/tasks'
import type { SeriesPoint, TrackingUnit } from '../api/trackingUnits'
import { measurementsApi, type Measurement } from '../api/measurements'
import { useTrackingUnits, useUnitSeries } from '../hooks/useTrackingUnits'
import { useMeasurements } from '../hooks/useMeasurements'
import { useTracker } from '../hooks/useTracker'
import { useSpecialDayOccurrences } from '../hooks/useSpecialDayOccurrences'
import { UnitChart } from '../components/UnitChart'
import { PeriodPager, PeriodPicker } from '../components/ChartControls'
import { LargeTitle, NavBarButton } from '../components/LargeTitle'
import { PushLink } from '../components/PushLink'
import { ReadingSheet } from '../components/ReadingSheet'
import { UnitSheet } from '../components/UnitSheet'
import { SwipeRow } from '../components/DayRowControls'
import { ChevronRightIcon, PlusIcon } from '../components/icons'
import { formatFigure, formatMeasurement } from '../lib/units'
import { formatDayLong, formatDayShort, shiftDay, todayKey } from '../lib/date'
import { limitSummary } from '../lib/taskLabels'
import { deleteAction } from '../lib/swipeActions'
import { hideMeasurement, refetchEverything } from '../lib/optimistic'
import { undoable } from '../lib/toast'
import type { PageDirection, Pager, Paging } from '../lib/chartGestures'
import {
  type Bounds,
  type Period,
  type PeriodSummary,
  type Resolution,
  type Slot,
  type SlotStat,
  buildSlots,
  periodBounds,
  pointsIn,
  projectedValues,
  resolutionFor,
  rollingMean,
  slotStats,
  summarisePeriod,
  trendProjection,
} from '../lib/series'

interface Headline {
  label: string
  value: number | null
  /** The line under the number: the period, or the hovered slot and its detail. */
  sub: string
}

/**
 * What the big number above the chart says. At rest it's the period's
 * headline figure; while a day / week / month is hovered it's that slot's own
 * figure, so reading a value never needs a tooltip covering the chart.
 */
function headlineFor(
  unit: TrackingUnit,
  resolution: Resolution,
  summary: PeriodSummary | null,
  bounds: Bounds,
  slot: Slot | undefined,
  stat: SlotStat | null | undefined,
  trendValue: number | null | undefined,
  /** The projected 7-day average: the hovered day's, or at rest the period's last day's. */
  projected: number | null | undefined,
): Headline {
  const isSum = unit.aggregation === 'sum'
  const format = (value: number) => formatMeasurement(value, unit)

  if (!slot) {
    if (summary) return { label: summary.headlineLabel, value: summary.headline, sub: bounds.label }
    // A period still to come has nothing to sum up, only where it ends up.
    if (projected != null) {
      return {
        label: `Projected for ${formatDayShort(bounds.to)}`,
        value: projected,
        sub: `${bounds.label} · 7-day avg if the trend holds`,
      }
    }
    return { label: 'No data', value: null, sub: bounds.label }
  }

  if (!stat) {
    // A day still to come: no average of its own yet, only where it's heading.
    if (trendValue == null && projected != null) {
      return { label: 'Projected', value: projected, sub: `${slot.title} · 7-day avg if the trend holds` }
    }
    const sub = trendValue != null ? `${slot.title} · 7-day avg ${format(trendValue)}` : slot.title
    return { label: 'No data', value: null, sub }
  }

  if (resolution === 'day') {
    if (isSum) {
      const entries = stat.entries > 1 ? ` · ${stat.entries} entries` : ''
      return { label: 'Total', value: stat.total, sub: `${slot.title}${entries}` }
    }
    const trend = trendValue != null ? ` · 7-day avg ${format(trendValue)}` : ''
    return { label: 'Reading', value: stat.avg, sub: `${slot.title}${trend}` }
  }

  const days = `${stat.days} ${stat.days === 1 ? 'day' : 'days'} logged`
  return isSum
    ? { label: 'Daily average', value: stat.avg, sub: `${slot.title} · total ${format(stat.total)} · ${days}` }
    : {
        label: 'Average',
        value: stat.avg,
        sub: `${slot.title} · ${format(stat.min)}–${format(stat.max)}`,
      }
}

const THIS_PERIOD: Record<Exclude<Period, 'all'>, string> = {
  week: 'this week',
  month: 'this month',
  '6m': 'over the last 6 months',
  year: 'this year',
}

const LAST_PERIOD: Record<Exclude<Period, 'all'>, string> = {
  week: 'last week',
  month: 'last month',
  '6m': 'the 6 months before',
  year: 'last year',
}

/**
 * How far ahead the chart pages while there's a projection to show: half a
 * year, past which a two-week slope says nothing.
 */
const AHEAD: Partial<Record<Period, number>> = { week: 26, month: 6 }

function periodPhrase(period: Exclude<Period, 'all'>, offset: number, bounds: Bounds): string {
  if (offset === 0) return THIS_PERIOD[period]
  if (offset === 1) return LAST_PERIOD[period]
  return `in ${bounds.label}`
}

/**
 * This period against the one before - Apple Health's "Highlights" card: one
 * sentence saying which way it went, and two bars to see by how much.
 */
function HighlightCard({
  unit,
  period,
  offset,
  bounds,
  previousBounds,
  current,
  previous,
}: {
  unit: TrackingUnit
  period: Exclude<Period, 'all'>
  offset: number
  bounds: Bounds
  previousBounds: Bounds
  current: PeriodSummary
  previous: PeriodSummary
}) {
  const format = (value: number) => formatMeasurement(value, unit)
  const now = periodPhrase(period, offset, bounds)
  const before = periodPhrase(period, offset + 1, previousBounds)
  const difference = current.headline - previous.headline
  const same = Math.abs(difference) < 10 ** -unit.decimals / 2

  const sentence =
    unit.aggregation === 'sum'
      ? same
        ? `You averaged ${format(current.headline)} a day ${now}, the same as ${before}.`
        : `You averaged ${format(current.headline)} a day ${now}, ${difference > 0 ? 'up' : 'down'} from ${format(previous.headline)} ${before}.`
      : same
        ? `Your average ${now} was ${format(current.headline)}, unchanged from ${before}.`
        : `Your average ${now} was ${format(current.headline)}, ${difference > 0 ? 'up' : 'down'} ${format(Math.abs(difference))} from ${before}.`

  const largest = Math.max(Math.abs(current.headline), Math.abs(previous.headline)) || 1
  const rows = [
    { key: 'now', label: bounds.label, value: current.headline, current: true },
    { key: 'before', label: previousBounds.label, value: previous.headline, current: false },
  ]

  return (
    <section className="highlight-card">
      <h2 className="highlight-title">{unit.name}</h2>
      <p className="highlight-sentence">{sentence}</p>
      <div className="highlight-bars">
        {rows.map((row) => (
          <div key={row.key} className="highlight-row" data-current={row.current || undefined}>
            <span className="highlight-value">{format(row.value)}</span>
            <span className="highlight-track">
              <span
                className="highlight-fill"
                style={{ width: `${(Math.abs(row.value) / largest) * 100}%` }}
              />
            </span>
            <span className="highlight-label muted">{row.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

/**
 * How much of a limit's current period is used: today's total, or Monday on -
 * or, for a weekly average, the mean of the days logged since Monday.
 */
function periodUsage(points: SeriesPoint[], limit: Pick<TaskLimit, 'period' | 'measure'>): number {
  const today = todayKey()
  if (limit.period === 'day') return points.find((point) => point.date === today)?.value ?? 0
  const [year, month, date] = today.split('-').map(Number)
  const monday = shiftDay(today, -((new Date(year, month - 1, date).getDay() + 6) % 7))
  const week = points.filter((point) => point.date >= monday && point.date <= today)
  const total = week.reduce((sum, point) => sum + point.value, 0)
  if (limit.measure === 'average') return week.length > 0 ? total / week.length : 0
  return total
}

/** One reading in the list: tap to edit it, swipe left to delete it (with an undo). */
function ReadingRow({
  unit,
  reading,
  onOpen,
  onDelete,
}: {
  unit: TrackingUnit
  reading: Measurement
  onOpen: () => void
  onDelete: () => void
}) {
  const source = [
    reading.taskTitle && `from “${reading.taskTitle}”`,
    reading.note,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className="ios-row">
      <SwipeRow enabled trailing={deleteAction(onDelete)} className="swipe-content">
        <button type="button" className="ios-row-link" onClick={onOpen}>
          <span className="ios-row-text">
            <span className="ios-row-title tabular">{formatMeasurement(reading.value, unit)}</span>
            {source && <span className="ios-row-subtitle">{source}</span>}
          </span>
          <span className="ios-row-detail tabular">{timeFormat.format(new Date(reading.measuredAt))}</span>
        </button>
      </SwipeRow>
    </li>
  )
}

/**
 * One tracking unit's page: its chart a calendar period at a time, the
 * readings behind it (each a tap from its sheet), what uses it, and a way to
 * compare it with others. + logs a reading for today; Edit opens the unit.
 *
 * The whole history is fetched once and sliced here, so switching period or
 * paging back costs no request.
 */
export function UnitChartPage() {
  const { unitId = '' } = useParams()
  const [period, setPeriod] = useState<Period>('month')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [editing, setEditing] = useState(false)
  const [reading, setReading] = useState<Measurement | 'new' | null>(null)
  const [showAll, setShowAll] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: readings } = useMeasurements(unitId, { limit: showAll ? 366 : undefined })
  const { data: tracker } = useTracker()

  const { data: units, isPending: unitsPending } = useTrackingUnits()
  const { data: points, isPending, isError, error } = useUnitSeries(unitId)
  const unit = units?.find((candidate) => candidate.id === unitId)

  const resolution = resolutionFor(period)
  const earliest = points?.[0]?.date
  const bounds = useMemo(() => periodBounds(period, offset, earliest), [period, offset, earliest])
  const slots = useMemo(() => buildSlots(bounds, resolution, period), [bounds, resolution, period])
  const stats = useMemo(() => slotStats(points ?? [], slots), [points, slots])
  const isLatest = unit?.aggregation === 'latest'
  const trend = useMemo(
    () => (resolution === 'day' && isLatest ? rollingMean(points ?? [], slots) : null),
    [resolution, isLatest, points, slots],
  )
  // Worked out once from the history, then laid over whichever period is on screen.
  const projection = useMemo(
    () => (isLatest ? trendProjection(points ?? []) : null),
    [isLatest, points],
  )
  const projected = useMemo(
    () => (trend && projection ? projectedValues(projection, slots) : null),
    [trend, projection, slots],
  )

  const occurrences = useSpecialDayOccurrences(bounds.from, bounds.to)
  const vacations = useMemo(
    () =>
      occurrences
        .filter((occurrence) => occurrence.band)
        .map((occurrence) => ({
          start: occurrence.startDate,
          end: occurrence.endDate,
          name: occurrence.category.name,
        })),
    [occurrences],
  )

  function choosePeriod(next: Period) {
    setPeriod(next)
    setOffset(0)
    setSelected(null)
  }

  function page(next: number) {
    setOffset(next)
    setSelected(null)
  }

  // Swiping the chart and tapping ‹ › are one motion: the buttons ask the
  // chart to slide, and the chart calls back here once the old period is out.
  const pagerRef = useRef<Pager | null>(null)
  const paging: Paging = {
    canPage: (direction) =>
      direction === -1
        ? period !== 'all'
        : offset > 0 || (projection !== null && offset > -(AHEAD[period] ?? 0)),
    onPage: (direction) => page(offset - direction),
  }

  function step(direction: PageDirection) {
    if (pagerRef.current) pagerRef.current.slide(direction)
    else if (paging.canPage(direction)) page(offset - direction)
  }

  if (unitsPending) {
    return (
      <div className="ios-page unit-chart-page">
        <LargeTitle title="" back={{ label: 'Tracking', to: '/tracking' }} />
        <p className="today-empty">Loading…</p>
      </div>
    )
  }

  if (!unit) {
    return (
      <div className="ios-page unit-chart-page">
        <LargeTitle title="Not found" back={{ label: 'Tracking', to: '/tracking' }} />
        <p className="today-empty">This tracking unit doesn’t exist any more.</p>
      </div>
    )
  }

  // What uses this unit: tasks that ask for it when ticked, and limits judged on it.
  const users = (tracker?.goals ?? []).flatMap((goal) =>
    goal.tasks
      .filter((task) => task.unitIds.includes(unit.id) || task.limit?.unitId === unit.id)
      .map((task) => ({ task, goal })),
  )

  // Readings grouped by day, newest day first.
  const byDay: { date: string; items: Measurement[] }[] = []
  for (const item of readings ?? []) {
    const last = byDay.at(-1)
    if (last && last.date === item.date) last.items.push(item)
    else byDay.push({ date: item.date, items: [item] })
  }

  function removeReading(target: Measurement, owner: TrackingUnit) {
    undoable({
      message: `Deleted ${formatMeasurement(target.value, owner)} from ${formatDayLong(target.date)}`,
      apply: () => hideMeasurement(queryClient, target.id),
      run: (options) => measurementsApi.remove(target.id, options).finally(() => refetchEverything(queryClient)),
      undo: () => refetchEverything(queryClient),
      failure: 'Couldn’t delete it',
    })
  }

  const eyebrow = [
    unit.symbol,
    unit.aggregation === 'sum' ? 'Day’s total' : 'Latest reading',
    unit.target != null ? `target ${formatMeasurement(unit.target, unit)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const summary = summarisePeriod(unit, pointsIn(points ?? [], bounds), bounds)
  const previousBounds = period === 'all' ? null : periodBounds(period, offset + 1)
  const previousSummary = previousBounds
    ? summarisePeriod(unit, pointsIn(points ?? [], previousBounds), previousBounds)
    : null

  const slot = selected === null ? undefined : slots[selected]
  const headline = headlineFor(
    unit,
    resolution,
    summary,
    bounds,
    slot,
    slot ? stats[selected as number] : undefined,
    slot && trend ? trend[selected as number] : undefined,
    projected ? (slot ? projected[selected as number] : projected.at(-1)) : undefined,
  )
  const ahead = bounds.from > todayKey()

  // "−0.3 kg/week" - a day's slope is too small to read.
  const perWeek = projection ? projection.perDay * 7 : 0
  const weekly = `${perWeek > 0 ? '+' : perWeek < 0 ? '−' : '±'}${formatMeasurement(Math.abs(perWeek), unit)}/week`

  const logged = slots
    .map((candidate, index) => ({ slot: candidate, stat: stats[index] }))
    .filter((row): row is { slot: Slot; stat: SlotStat } => row.stat !== null)
    .reverse()

  return (
    <div className="ios-page unit-chart-page">
      <LargeTitle
        title={unit.name}
        eyebrow={eyebrow}
        back={{ label: 'Tracking', to: '/tracking' }}
        actions={
          <>
            <NavBarButton label="Add Data" onClick={() => setReading('new')}>
              <PlusIcon />
            </NavBarButton>
            <NavBarButton onClick={() => setEditing(true)}>Edit</NavBarButton>
          </>
        }
      />

      <PeriodPicker value={period} onChange={choosePeriod} />

      {isPending && <p className="today-empty">Loading readings…</p>}
      {isError && <p className="error">Could not load readings: {error.message}</p>}
      {points && points.length === 0 && (
        <p className="today-empty">No readings yet. Tap + to add the first.</p>
      )}

      {points && points.length > 0 && (
        <>
          <section className="chart-card">
            <div className="chart-headline">
              <div className="chart-headline-text" aria-live="polite">
                <span className="chart-headline-label">{headline.label}</span>
                <span className="chart-headline-value">
                  {headline.value === null ? '–' : formatFigure(headline.value, unit.decimals)}
                  {headline.value !== null && unit.symbol && (
                    <span className="chart-headline-symbol"> {unit.symbol}</span>
                  )}
                </span>
                <span className="chart-headline-sub">{headline.sub}</span>
              </div>
              <PeriodPager period={period} canStep={paging.canPage} onStep={step} />
            </div>

            <UnitChart
              unit={unit}
              slots={slots}
              stats={stats}
              trend={trend}
              projection={projected}
              resolution={resolution}
              vacations={vacations}
              onSelect={setSelected}
              paging={paging}
              pagerRef={pagerRef}
            />

            <p className="chart-gesture-hint">Swipe for other periods · hold to read a value</p>

            {(trend || vacations.length > 0 || unit.target != null) && (
              <ul className="chart-key">
                {trend && !ahead && (
                  <>
                    <li>
                      <span className="chart-key-dot" /> Daily reading
                    </li>
                    <li>
                      <span className="chart-key-line" /> 7-day average
                    </li>
                  </>
                )}
                {projected && (
                  <li>
                    <span className="chart-key-projection" /> Projected · {weekly}
                  </li>
                )}
                {unit.target != null && (
                  <li>
                    <span className="chart-key-dash" /> Target {formatMeasurement(unit.target, unit)}
                  </li>
                )}
                {vacations.length > 0 && resolution !== 'month' && (
                  <li>
                    <span className="chart-key-band" /> Time off
                  </li>
                )}
              </ul>
            )}
          </section>

          {period !== 'all' && previousBounds && summary && previousSummary && (
            <HighlightCard
              unit={unit}
              period={period}
              offset={offset}
              bounds={bounds}
              previousBounds={previousBounds}
              current={summary}
              previous={previousSummary}
            />
          )}

          {summary && (
            <dl className="stat-tiles">
              {summary.stats.map((stat) => (
                <div key={stat.label} className="stat-tile">
                  <dt>{stat.label}</dt>
                  <dd>{stat.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {logged.length > 0 && (
            <details className="unit-chart-table">
              <summary>Show as table</summary>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{resolution === 'day' ? 'Day' : resolution === 'week' ? 'Week' : 'Month'}</th>
                    <th scope="col">
                      {resolution === 'day'
                        ? unit.aggregation === 'sum'
                          ? 'Total'
                          : 'Reading'
                        : unit.aggregation === 'sum'
                          ? 'Daily avg'
                          : 'Average'}
                    </th>
                    {resolution !== 'day' && (
                      <th scope="col">{unit.aggregation === 'sum' ? 'Total' : 'Range'}</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {logged.map(({ slot: row, stat }) => (
                    <tr key={row.key}>
                      <td>{row.title}</td>
                      <td>{formatMeasurement(stat.avg, unit)}</td>
                      {resolution !== 'day' && (
                        <td>
                          {unit.aggregation === 'sum'
                            ? formatMeasurement(stat.total, unit)
                            : `${formatMeasurement(stat.min, unit)} – ${formatMeasurement(stat.max, unit)}`}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}

      {byDay.length > 0 && (
        <section className="ios-section">
          <h2 className="ios-section-title">Readings</h2>
          {byDay.map((group) => (
            <div key={group.date} className="ios-section-group">
              <h3 className="ios-group-header">{formatDayLong(group.date)}</h3>
              <ul className="ios-list">
                {group.items.map((item) => (
                  <ReadingRow
                    key={item.id}
                    unit={unit}
                    reading={item}
                    onOpen={() => setReading(item)}
                    onDelete={() => removeReading(item, unit)}
                  />
                ))}
              </ul>
            </div>
          ))}
          {!showAll && (readings?.length ?? 0) >= 30 && (
            <button type="button" className="ios-link-button" onClick={() => setShowAll(true)}>
              Show all
            </button>
          )}
        </section>
      )}

      {users.length > 0 && (
        <section className="ios-section">
          <h2 className="ios-section-title">Used by</h2>
          <ul className="ios-list">
            {users.map(({ task, goal }) => (
              <li key={task.id} className="ios-row">
                <PushLink to={`/goals/${goal.id}`} className="ios-row-link">
                  <span className="ios-row-text">
                    <span className="ios-row-title">{task.title}</span>
                    <span className="ios-row-subtitle">
                      {task.limit?.unitId === unit.id
                        ? `${limitSummary({ ...task.limit, unit })} · ${formatMeasurement(
                            periodUsage(points ?? [], task.limit),
                            unit,
                          )} ${task.limit.measure === 'average' ? 'avg this week' : task.limit.period === 'day' ? 'today' : 'this week'}`
                        : `Asked for when ticked · ${goal.title}`}
                    </span>
                  </span>
                  <span className="ios-chevron" aria-hidden="true">
                    <ChevronRightIcon />
                  </span>
                </PushLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ios-section">
        <ul className="ios-list">
          <li className="ios-row">
            <PushLink to={`/tracking/compare?units=${unit.id}`} className="ios-row-link">
              <span className="ios-row-text">
                <span className="ios-row-title">Compare with other units</span>
              </span>
              <span className="ios-chevron" aria-hidden="true">
                <ChevronRightIcon />
              </span>
            </PushLink>
          </li>
        </ul>
      </section>

      {editing && (
        <UnitSheet
          unit={unit}
          onClose={() => setEditing(false)}
          onDeleted={() => navigate('/tracking', { replace: true })}
        />
      )}

      {reading && (
        <ReadingSheet
          key={reading === 'new' ? 'new' : reading.id}
          unit={unit}
          date={reading === 'new' ? todayKey() : reading.date}
          reading={reading === 'new' ? undefined : reading}
          onClose={() => setReading(null)}
        />
      )}
    </div>
  )
}
