import { type RefObject, useCallback } from 'react'
import type { LineSeriesOption } from 'echarts/charts'
import type { TrackingUnit } from '../api/trackingUnits'
import { indexToRange, type Resolution, type Slot, type SlotStat } from '../lib/series'
import {
  type ChartOption,
  type ChartTokens,
  niceExtent,
  quietValueAxis,
  slotXAxis,
  useEChart,
} from '../lib/chartTheme'
import {
  type DaySpan,
  selectionPointer,
  targetLine,
  unitSeries,
  unitTick,
  vacationBands,
} from '../lib/chartSeries'
import type { Pager, Paging } from '../lib/chartGestures'

export interface CompareEntry {
  unit: TrackingUnit
  /** Its fixed identity slot (0-2) - kept while other units come and go. */
  colorIndex: number
  stats: (SlotStat | null)[]
  /** 7-day average per day slot; null when bucketed. */
  trend: (number | null)[] | null
}

const PANEL_HEIGHT = 140
const PANEL_TITLE = 30
const AXIS_ROOM = 26

/** How tall the stacked view needs its box - one panel per unit. */
function stackedHeight(count: number): number {
  return count * (PANEL_HEIGHT + PANEL_TITLE) + AXIS_ROOM
}

/**
 * What the overlay draws for a unit: its trend, not its raw days - three noisy
 * lines over each other are unreadable, three trends are the whole point.
 */
function overlayValues(entry: CompareEntry): (number | null)[] {
  return entry.trend ?? entry.stats.map((stat) => (stat ? stat.avg : null))
}

/**
 * Two or three units over the same period, two ways:
 *
 *  - **stacked**: a panel each, sharing one time axis and one crosshair. Every
 *    panel keeps its own real scale, so kilograms stay kilograms.
 *  - **overlay**: one panel, each unit rescaled to 0-100 of its own low..high
 *    in view, so the shapes line up and you can see them move together. Never
 *    a second y-axis: two scales on one plot invite reading a crossing as
 *    meaningful when it's only where the axes happen to sit.
 *
 * As on a unit's own page, hovering reports the slot through `onSelect` and
 * the page's headline shows the real figures.
 */
export function CompareChart({
  mode,
  entries,
  slots,
  resolution,
  vacations,
  onSelect,
  paging,
  pagerRef,
}: {
  mode: 'stacked' | 'overlay'
  entries: CompareEntry[]
  slots: Slot[]
  resolution: Resolution
  vacations: DaySpan[]
  onSelect: (index: number | null) => void
  paging?: Paging
  pagerRef?: RefObject<Pager | null>
}) {
  const build = useCallback(
    (tokens: ChartTokens): ChartOption => {
      const colorOf = (entry: CompareEntry) => tokens.categorical[entry.colorIndex]
      const base = { animationDuration: 350, textStyle: { fontFamily: tokens.font } }

      if (mode === 'overlay') {
        const series: LineSeriesOption[] = entries.map((entry, index) => ({
          type: 'line',
          name: entry.unit.name,
          data: indexToRange(overlayValues(entry)),
          connectNulls: true,
          showSymbol: slots.length <= 14,
          symbol: 'circle',
          symbolSize: 7,
          lineStyle: { width: 2.5, color: colorOf(entry), cap: 'round', join: 'round' },
          itemStyle: { color: colorOf(entry), borderColor: tokens.bg, borderWidth: 2 },
          emphasis: { disabled: true },
          markArea: index === 0 ? vacationBands(slots, vacations, resolution, tokens) : undefined,
        }))

        return {
          ...base,
          grid: { top: 16, right: 4, bottom: 4, left: 4, containLabel: true },
          xAxis: slotXAxis(tokens, slots),
          yAxis: {
            ...quietValueAxis(tokens, (value) => (value === 0 ? 'low' : value === 100 ? 'high' : ''), {
              min: 0,
              max: 100,
              interval: 50,
            }),
          },
          tooltip: selectionPointer(tokens, false),
          series,
        }
      }

      const count = entries.length
      const grids = entries.map((_, index) => ({
        top: index * (PANEL_HEIGHT + PANEL_TITLE) + PANEL_TITLE,
        height: PANEL_HEIGHT,
        left: 4,
        right: 4,
        containLabel: true,
      }))

      const panels = entries.map((entry, index) => {
        const panel = unitSeries({
          unit: entry.unit,
          stats: entry.stats,
          trend: entry.trend,
          resolution,
          color: colorOf(entry),
          tokens,
          axisIndex: index,
          dense: slots.length > 10,
        })
        panel.series[0].markArea = vacationBands(slots, vacations, resolution, tokens)
        panel.series[0].markLine = targetLine(entry.unit, tokens)
        return panel
      })

      return {
        ...base,
        // Each panel names its unit directly, with its colour as a dot - the
        // light-mode aqua is under 3:1, so identity never rests on colour alone.
        title: entries.map((entry, index) => ({
          text: `{dot|●} ${entry.unit.name}${entry.unit.symbol ? `  {unit|${entry.unit.symbol}}` : ''}`,
          top: grids[index].top - PANEL_TITLE + 4,
          left: 0,
          textStyle: {
            fontSize: 13,
            fontWeight: 600,
            color: tokens.textH,
            rich: {
              dot: { color: colorOf(entry), fontSize: 13 },
              unit: { color: tokens.text, fontSize: 12, fontWeight: 400 },
            },
          },
        })),
        grid: grids,
        xAxis: entries.map((_, index) =>
          slotXAxis(tokens, slots, { gridIndex: index, showLabels: index === count - 1 }),
        ),
        yAxis: entries.map((entry, index) => {
          const { plotted } = panels[index]
          const withTarget = entry.unit.target == null ? plotted : [...plotted, entry.unit.target]
          return {
            ...quietValueAxis(
              tokens,
              unitTick(entry.unit),
              niceExtent(withTarget, { zero: entry.unit.aggregation === 'sum' }),
            ),
            gridIndex: index,
          }
        }),
        axisPointer: { link: [{ xAxisIndex: 'all' }] },
        tooltip: selectionPointer(tokens, resolution !== 'day'),
        series: panels.flatMap((panel) => panel.series),
      }
    },
    [mode, entries, slots, resolution, vacations],
  )

  const { viewportRef, containerRef } = useEChart({ build, onAxis: onSelect, paging, pagerRef })

  return (
    <div ref={viewportRef} className="chart-viewport">
      <div
        ref={containerRef}
        className="unit-chart compare-chart"
        style={mode === 'stacked' ? { height: stackedHeight(entries.length) } : undefined}
        role="img"
        aria-label={`${entries.map((entry) => entry.unit.name).join(', ')} compared`}
      />
    </div>
  )
}
