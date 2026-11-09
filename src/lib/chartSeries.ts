import type { BarSeriesOption, LineSeriesOption, ScatterSeriesOption } from 'echarts/charts'
import type { MarkAreaComponentOption, MarkLineComponentOption } from 'echarts/components'
import type { TrackingUnit } from '../api/trackingUnits'
import type { Resolution, Slot, SlotStat } from './series'
import { formatMeasurement } from './units'
import { type ChartTokens, withAlpha } from './chartTheme'

/**
 * The ECharts pieces a unit's period is drawn with - shared by its own chart
 * page and the compare page's stacked panels, so a weight looks the same in
 * both.
 */

export interface DaySpan {
  start: string
  end: string
  /** What the band is labelled - its special-day category. */
  name: string
}

type UnitSeries = LineSeriesOption | BarSeriesOption | ScatterSeriesOption

/**
 * Time off (vacations, sick days) as shaded bands, mapped from days onto
 * whichever slots they touch.
 * Only drawn day- and week-by-week: a two-week trip shading a whole month
 * would claim the month was a vacation.
 */
export function vacationBands(
  slots: Slot[],
  spans: DaySpan[],
  resolution: Resolution,
  tokens: ChartTokens,
): MarkAreaComponentOption | undefined {
  if (resolution === 'month') return undefined
  const data: [{ xAxis: string; name?: string }, { xAxis: string }][] = []
  for (const span of spans) {
    const first = slots.find((slot) => slot.end >= span.start)
    const last = [...slots].reverse().find((slot) => slot.start <= span.end)
    if (!first || !last || first.start > last.start) continue
    data.push([{ xAxis: first.key, name: span.name }, { xAxis: last.key }])
  }
  if (data.length === 0) return undefined
  return {
    silent: true,
    itemStyle: { color: withAlpha(tokens.vacation, 0.1) },
    label: { position: 'insideTop', color: tokens.text, fontSize: 10, distance: 2 },
    data,
  }
}

/** A dashed rule at the unit's target, labelled so it isn't mistaken for data. */
export function targetLine(
  unit: TrackingUnit,
  tokens: ChartTokens,
): MarkLineComponentOption | undefined {
  if (unit.target == null) return undefined
  const target = unit.target
  return {
    silent: true,
    symbol: 'none',
    lineStyle: { color: tokens.textH, type: [4, 4], width: 1, opacity: 0.7 },
    label: {
      position: 'insideStartTop',
      color: tokens.text,
      fontSize: 11,
      formatter: () => `Target ${formatMeasurement(target, unit)}`,
    },
    data: [{ yAxis: target }],
  }
}

/**
 * One unit's marks for a period, the way Apple Health draws them:
 *
 *  - a reading (weight) day by day is faint dots for what the scale said and a
 *    bold 7-day average through them - the dots are noise, the line is the trend;
 *  - a reading week or month at a time is a capsule from that stretch's low to
 *    its high, with a dot at its average;
 *  - a total (steps, coffees) is a rounded bar - the day's total, or the average
 *    day across a week or month, so a long range is ~30 bars, never 365 hairlines.
 *
 * Also returns every value it plots, so the caller can fit a y-range around them.
 * Shared by the unit page and the compare page's stacked panels.
 */
export function unitSeries({
  unit,
  stats,
  trend,
  projection = null,
  resolution,
  color,
  tokens,
  axisIndex = 0,
  dense,
}: {
  unit: TrackingUnit
  stats: (SlotStat | null)[]
  trend: (number | null)[] | null
  /** Where the 7-day average is heading, drawn dotted on from today. */
  projection?: (number | null)[] | null
  resolution: Resolution
  color: string
  tokens: ChartTokens
  axisIndex?: number
  /** Many slots across - smaller dots. */
  dense: boolean
}): { series: UnitSeries[]; plotted: number[] } {
  const axes = { xAxisIndex: axisIndex, yAxisIndex: axisIndex }

  if (unit.aggregation === 'sum') {
    // A day slot's avg is that day's total; a bucket's is its average day.
    const values = stats.map((stat) => (stat ? stat.avg : null))
    return {
      plotted: values.filter((value): value is number => value !== null),
      series: [
        {
          type: 'bar',
          name: unit.name,
          ...axes,
          data: values,
          barCategoryGap: '30%',
          barMaxWidth: 28,
          itemStyle: { color, borderRadius: [4, 4, 0, 0] },
          emphasis: { itemStyle: { color, opacity: 0.85 } },
        },
      ],
    }
  }

  if (resolution === 'day') {
    const readings = stats.flatMap((stat, index) => (stat ? [[index, stat.avg]] : []))
    const line = trend ?? []
    const series: UnitSeries[] = [
      {
        type: 'scatter',
        name: `${unit.name} readings`,
        ...axes,
        data: readings,
        symbolSize: dense ? 6 : 9,
        itemStyle: { color: withAlpha(color, 0.4) },
        emphasis: { scale: 1.6, itemStyle: { color } },
        z: 2,
      },
      {
        type: 'line',
        name: `${unit.name} 7-day average`,
        ...axes,
        data: line,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { width: 3, color, cap: 'round', join: 'round' },
        itemStyle: { color },
        emphasis: { disabled: true },
        z: 3,
      },
    ]
    if (projection) {
      series.push({
        type: 'line',
        name: `${unit.name} projected`,
        ...axes,
        data: projection,
        showSymbol: false,
        silent: true,
        // Round dots, so it can't be read as the dashed target rule.
        lineStyle: { width: 3, color: withAlpha(color, 0.6), type: [1, 7], cap: 'round' },
        emphasis: { disabled: true },
        z: 3,
      })
    }
    return {
      plotted: [
        ...readings.map(([, value]) => value),
        ...line.filter((value): value is number => value !== null),
        ...(projection ?? []).filter((value): value is number => value !== null),
      ],
      series,
    }
  }

  // Range capsules: an invisible bar up to each low, the visible one from low
  // to high stacked on it, and the average as a dot on top.
  const stack = `range-${axisIndex}`
  return {
    plotted: stats.flatMap((stat) => (stat ? [stat.min, stat.max] : [])),
    series: [
      {
        type: 'bar',
        ...axes,
        stack,
        data: stats.map((stat) => (stat ? stat.min : null)),
        itemStyle: { color: 'transparent' },
        emphasis: { disabled: true },
        silent: true,
        barCategoryGap: '40%',
        barMaxWidth: 14,
      },
      {
        type: 'bar',
        name: `${unit.name} range`,
        ...axes,
        stack,
        data: stats.map((stat) => (stat ? stat.max - stat.min : null)),
        barMaxWidth: 14,
        // At least a dot's height, so a stretch with a single reading still shows.
        barMinHeight: 4,
        itemStyle: { color: withAlpha(color, 0.35), borderRadius: 7 },
        emphasis: { itemStyle: { color: withAlpha(color, 0.5) } },
      },
      {
        type: 'scatter',
        name: `${unit.name} average`,
        ...axes,
        data: stats.flatMap((stat, index) => (stat ? [[index, stat.avg]] : [])),
        symbolSize: 8,
        itemStyle: { color, borderColor: tokens.bg, borderWidth: 2 },
        emphasis: { scale: 1.4 },
        z: 3,
      },
    ],
  }
}

/** Axis ticks at the unit's precision, compacted so 20,000 steps reads "20K". */
export function unitTick(unit: TrackingUnit) {
  const format = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: unit.decimals,
    notation: 'compact',
  })
  return (value: number) => format.format(value)
}

/** Hover drives the page's headline, not a floating tooltip - this is just the pointer. */
export function selectionPointer(tokens: ChartTokens, shadow: boolean) {
  return {
    trigger: 'axis' as const,
    showContent: false,
    axisPointer: {
      type: shadow ? ('shadow' as const) : ('line' as const),
      lineStyle: { color: tokens.text, width: 1 },
      shadowStyle: { color: withAlpha(tokens.text, 0.1) },
    },
  }
}
