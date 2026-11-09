import { type CSSProperties, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { LargeTitle } from '../components/LargeTitle'
import type { SeriesPoint, TrackingUnit } from '../api/trackingUnits'
import { useTrackingUnits, useUnitSeriesMany } from '../hooks/useTrackingUnits'
import { useSpecialDayOccurrences } from '../hooks/useSpecialDayOccurrences'
import { CompareChart, type CompareEntry } from '../components/CompareChart'
import { CorrelationChart } from '../components/CorrelationChart'
import { PeriodPager, PeriodPicker, Segmented } from '../components/ChartControls'
import { formatMeasurement } from '../lib/units'
import type { PageDirection, Pager, Paging } from '../lib/chartGestures'
import { shiftDay } from '../lib/date'
import {
  type Period,
  alignDays,
  buildSlots,
  earliestDay,
  fitLine,
  periodBounds,
  pointsIn,
  resolutionFor,
  rollingMean,
  slotStats,
  strengthLabel,
  summarisePeriod,
} from '../lib/series'

/**
 * Three is the most the categorical palette keeps apart for every pair at
 * once (and for colour-blind eyes) - past that, lines start being confused.
 */
const MAX_UNITS = 3

type Mode = 'stacked' | 'overlay' | 'scatter'
const MODES: Mode[] = ['stacked', 'overlay', 'scatter']

const LAGS = [
  { id: '0', label: 'Same day' },
  { id: '1', label: '+1 day' },
  { id: '2', label: '+2 days' },
  { id: '7', label: '+7 days' },
]

const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return dayFormat.format(new Date(year, month - 1, date))
}

/**
 * `?units=a,,c` - positions, not just a list. A unit's position is its colour,
 * so taking the middle one away leaves a gap rather than shifting the third
 * one into its colour: colour follows the unit, never its rank.
 */
function parsePositions(param: string | null): (string | null)[] {
  if (!param) return []
  return param
    .split(',')
    .slice(0, MAX_UNITS)
    .map((id) => id || null)
}

function serialisePositions(positions: (string | null)[]): string {
  const trimmed = [...positions]
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === null) trimmed.pop()
  return trimmed.map((id) => id ?? '').join(',')
}

function chipStyle(colorIndex: number): CSSProperties {
  return { '--chip-color': `var(--chart-${colorIndex + 1})` } as CSSProperties
}

interface ChosenUnit {
  unit: TrackingUnit
  colorIndex: number
  points: SeriesPoint[]
}

interface Readout {
  key: string
  name: string
  colorIndex: number
  value: string
  note?: string
}

/**
 * Two or three tracking units over one period, to see whether they move
 * together: stacked panels on a shared time axis, the same trends overlaid on
 * one relative scale, or - with exactly two - one against the other as a
 * scatter with its correlation, optionally lagged ("coffees today vs weight
 * tomorrow").
 *
 * Which units are chosen and how they're shown live in the URL, so a view
 * survives a reload and the unit page can link straight in with its own unit
 * already picked.
 */
export function ComparePage() {
  const [params, setParams] = useSearchParams()
  const unitsParam = params.get('units')
  const modeParam = params.get('mode')
  const [period, setPeriod] = useState<Period>('month')
  const [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [lag, setLag] = useState('0')
  const [swapped, setSwapped] = useState(false)

  const { data: units, isPending: unitsPending } = useTrackingUnits()
  const positions = useMemo(() => parsePositions(unitsParam), [unitsParam])

  const picked = useMemo(
    () =>
      positions.flatMap((id, colorIndex) => {
        const unit = id ? units?.find((candidate) => candidate.id === id) : undefined
        return unit ? [{ unit, colorIndex }] : []
      }),
    [positions, units],
  )
  const ids = useMemo(() => picked.map(({ unit }) => unit.id), [picked])
  const { series, isPending, error } = useUnitSeriesMany(ids)

  const chosen: ChosenUnit[] = useMemo(
    () => picked.map((entry, index) => ({ ...entry, points: series[index] ?? [] })),
    [picked, series],
  )

  const resolution = resolutionFor(period)
  const earliest = earliestDay(series)
  const bounds = useMemo(() => periodBounds(period, offset, earliest), [period, offset, earliest])
  const slots = useMemo(() => buildSlots(bounds, resolution, period), [bounds, resolution, period])

  const entries: (CompareEntry & ChosenUnit)[] = useMemo(
    () =>
      chosen.map((entry) => ({
        ...entry,
        stats: slotStats(entry.points, slots),
        // Every unit gets a trend day by day - the overlay draws trends, even for totals.
        trend: resolution === 'day' ? rollingMean(entry.points, slots) : null,
      })),
    [chosen, slots, resolution],
  )

  const mode: Mode =
    modeParam === 'overlay' || (modeParam === 'scatter' && entries.length === 2)
      ? modeParam
      : 'stacked'

  // The scatter: A on a day in the period against B `lag` days later. B is
  // read from its whole history, so a lag can reach past the period's end.
  const [xEntry, yEntry] = swapped ? [entries[1], entries[0]] : [entries[0], entries[1]]
  const lagDays = Number(lag)
  const pairs = useMemo(
    () =>
      mode === 'scatter' && xEntry && yEntry
        ? alignDays(pointsIn(xEntry.points, bounds), yEntry.points, lagDays)
        : [],
    [mode, xEntry, yEntry, bounds, lagDays],
  )
  const fit = useMemo(() => fitLine(pairs), [pairs])

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

  function updateParams(change: (next: URLSearchParams) => void) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        change(next)
        return next
      },
      { replace: true },
    )
    setSelected(null)
  }

  const chosenCount = positions.filter(Boolean).length

  function toggle(unitId: string) {
    const next = [...positions]
    const at = next.indexOf(unitId)
    if (at >= 0) {
      next[at] = null
    } else {
      const free = next.indexOf(null)
      if (free >= 0) next[free] = unitId
      else if (next.length < MAX_UNITS) next.push(unitId)
      else return
    }
    setSwapped(false)
    updateParams((search) => {
      const value = serialisePositions(next)
      if (value) search.set('units', value)
      else search.delete('units')
    })
  }

  function chooseMode(next: Mode) {
    updateParams((search) => {
      if (next === 'stacked') search.delete('mode')
      else search.set('mode', next)
    })
  }

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
    canPage: (direction) => (direction === -1 ? period !== 'all' : offset > 0),
    onPage: (direction) => page(offset - direction),
  }

  function step(direction: PageDirection) {
    if (pagerRef.current) pagerRef.current.slide(direction)
    else if (paging.canPage(direction)) page(offset - direction)
  }

  // What the headline says - per unit, at rest the period's figure, while
  // hovering the hovered slot's (or, on the scatter, the hovered day's).
  let title = bounds.label
  let readouts: Readout[]

  const restingReadout = (entry: CompareEntry & ChosenUnit): Readout => {
    const summary = summarisePeriod(entry.unit, pointsIn(entry.points, bounds), bounds)
    return {
      key: entry.unit.id,
      name: entry.unit.name,
      colorIndex: entry.colorIndex,
      value: summary ? formatMeasurement(summary.headline, entry.unit) : '–',
      note: summary?.headlineLabel.toLowerCase(),
    }
  }

  if (mode === 'scatter' && xEntry && yEntry) {
    const pair = selected === null ? undefined : pairs[selected]
    if (pair) {
      const yDay = shiftDay(pair.date, lagDays)
      title = formatDay(pair.date)
      readouts = [
        {
          key: xEntry.unit.id,
          name: xEntry.unit.name,
          colorIndex: xEntry.colorIndex,
          value: formatMeasurement(pair.x, xEntry.unit),
        },
        {
          key: yEntry.unit.id,
          name: yEntry.unit.name,
          colorIndex: yEntry.colorIndex,
          value: formatMeasurement(pair.y, yEntry.unit),
          note: lagDays > 0 ? formatDay(yDay) : undefined,
        },
      ]
    } else {
      readouts = [xEntry, yEntry].map(restingReadout)
    }
  } else {
    const slot = selected === null ? undefined : slots[selected]
    if (slot) {
      title = slot.title
      readouts = entries.map((entry) => {
        const index = selected as number
        const stat = entry.stats[index]
        const overlayValue = mode === 'overlay' && entry.trend ? entry.trend[index] : null
        const base = { key: entry.unit.id, name: entry.unit.name, colorIndex: entry.colorIndex }
        if (overlayValue != null) {
          return {
            ...base,
            value: formatMeasurement(overlayValue, entry.unit),
            note: stat ? `7-day avg · that day ${formatMeasurement(stat.avg, entry.unit)}` : '7-day avg',
          }
        }
        if (!stat) return { ...base, value: '–', note: 'no data' }
        if (resolution === 'day') return { ...base, value: formatMeasurement(stat.avg, entry.unit) }
        return entry.unit.aggregation === 'sum'
          ? { ...base, value: formatMeasurement(stat.avg, entry.unit), note: 'a day on average' }
          : {
              ...base,
              value: formatMeasurement(stat.avg, entry.unit),
              note: `${formatMeasurement(stat.min, entry.unit)}–${formatMeasurement(stat.max, entry.unit)}`,
            }
      })
    } else {
      readouts = entries.map(restingReadout)
    }
  }

  return (
    <div className="ios-page unit-chart-page compare-page">
      <LargeTitle title="Compare" back={{ label: 'Tracking', to: '/tracking' }} />

      {unitsPending && <p className="muted">Loading…</p>}

      {units && (
        <div className="compare-chips" role="group" aria-label="Units to compare">
          {units
            .filter((unit) => unit.summary.entryCount > 0)
            .map((unit) => {
              const colorIndex = positions.indexOf(unit.id)
              const on = colorIndex >= 0
              return (
                <button
                  key={unit.id}
                  type="button"
                  className="compare-chip"
                  aria-pressed={on}
                  disabled={!on && chosenCount >= MAX_UNITS}
                  style={on ? chipStyle(colorIndex) : undefined}
                  onClick={() => toggle(unit.id)}
                >
                  {on && <span className="compare-dot" aria-hidden="true" />}
                  {unit.name}
                </button>
              )
            })}
        </div>
      )}

      {units && entries.length < 2 && (
        <p className="muted compare-hint">
          {entries.length === 0
            ? `Pick two or three things to see whether they move together.`
            : `Pick one or two more to compare ${entries[0].unit.name} with.`}
        </p>
      )}

      {entries.length > 0 && (
        <>
          <PeriodPicker value={period} onChange={choosePeriod} />

          <Segmented
            label="View"
            value={mode}
            onChange={chooseMode}
            options={MODES.map((id) => ({
              id,
              label: id === 'stacked' ? 'Stacked' : id === 'overlay' ? 'Overlay' : 'Scatter',
              disabled: id === 'scatter' && entries.length !== 2,
              title: id === 'scatter' && entries.length !== 2 ? 'Pick exactly two units' : undefined,
            }))}
          />

          {error && <p className="error">Could not load readings: {error.message}</p>}

          <section className="chart-card">
            <div className="chart-headline">
              <div className="chart-headline-text" aria-live="polite">
                <span className="chart-headline-sub">{title}</span>
                <ul className="compare-readout">
                  {readouts.map((readout) => (
                    <li key={readout.key} style={chipStyle(readout.colorIndex)}>
                      <span className="compare-dot" aria-hidden="true" />
                      <span className="compare-readout-name">{readout.name}</span>
                      <span className="compare-readout-value">{readout.value}</span>
                      {readout.note && <span className="compare-readout-note">{readout.note}</span>}
                    </li>
                  ))}
                </ul>
              </div>
              <PeriodPager period={period} canStep={paging.canPage} onStep={step} />
            </div>

            {isPending ? (
              <p className="muted">Loading readings…</p>
            ) : mode === 'scatter' && xEntry && yEntry ? (
              <CorrelationChart
                xUnit={xEntry.unit}
                yUnit={yEntry.unit}
                pairs={pairs}
                fit={fit}
                onSelect={setSelected}
              />
            ) : (
              <CompareChart
                mode={mode === 'overlay' ? 'overlay' : 'stacked'}
                entries={entries}
                slots={slots}
                resolution={resolution}
                vacations={vacations}
                onSelect={setSelected}
                paging={paging}
                pagerRef={pagerRef}
              />
            )}

            {mode !== 'scatter' && (
              <p className="chart-gesture-hint">Swipe for other periods · hold to read a day</p>
            )}

            {mode === 'overlay' && (
              <p className="chart-caption">
                Each line is scaled to its own low–high in this period, so compare their shapes, not
                their heights.{' '}
                {resolution === 'day'
                  ? 'Lines are 7-day averages.'
                  : resolution === 'week'
                    ? 'Points are weekly averages.'
                    : 'Points are monthly averages.'}
              </p>
            )}
          </section>

          {mode === 'scatter' && xEntry && yEntry && (
            <section className="highlight-card correlation-card">
              <div className="correlation-controls">
                <span className="muted">{yEntry.unit.name} measured</span>
                <Segmented
                  label="Lag"
                  value={lag}
                  onChange={(next) => {
                    setLag(next)
                    setSelected(null)
                  }}
                  options={LAGS}
                />
                <button
                  type="button"
                  className="link-button"
                  onClick={() => {
                    setSwapped((value) => !value)
                    setSelected(null)
                  }}
                >
                  Swap axes
                </button>
              </div>

              {fit ? (
                <>
                  <p className="correlation-r">
                    <span className="correlation-r-value">r = {fit.r.toFixed(2).replace('-', '−')}</span>
                    <span>{strengthLabel(fit.r)}</span>
                  </p>
                  <p className="highlight-sentence">
                    {Math.abs(fit.r) < 0.1
                      ? `Over ${fit.n} days, ${xEntry.unit.name} and ${yEntry.unit.name} don’t move together.`
                      : `Over ${fit.n} days, when ${xEntry.unit.name} was higher, ${yEntry.unit.name}${
                          lagDays > 0 ? ` ${lagDays === 1 ? 'the next day' : `${lagDays} days later`}` : ''
                        } tended to be ${fit.r > 0 ? 'higher' : 'lower'}.`}
                  </p>
                </>
              ) : (
                <p className="muted">
                  Not enough days with both logged in this period to say anything yet.
                </p>
              )}
              <p className="chart-caption">
                Each dot is a day both were logged
                {lagDays > 0 ? `, with ${yEntry.unit.name} taken ${lagDays} ${lagDays === 1 ? 'day' : 'days'} later` : ''}
                . Moving together isn’t proof that one causes the other.
              </p>
            </section>
          )}
        </>
      )}
    </div>
  )
}
