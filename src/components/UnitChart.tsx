import { type RefObject, useCallback } from 'react'
import type { TrackingUnit } from '../api/trackingUnits'
import type { Resolution, Slot, SlotStat } from '../lib/series'
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

/**
 * One unit's period as a chart. There's no floating tooltip: hovering (or, on
 * a phone, holding) reports the slot index through `onSelect`, and the page
 * shows it in the headline.
 */
export function UnitChart({
  unit,
  slots,
  stats,
  trend,
  projection,
  resolution,
  vacations,
  onSelect,
  paging,
  pagerRef,
}: {
  unit: TrackingUnit
  slots: Slot[]
  stats: (SlotStat | null)[]
  /** 7-day average per day slot; null when bucketed. */
  trend: (number | null)[] | null
  /** Where that average is heading from today; null when there's no call to make. */
  projection: (number | null)[] | null
  resolution: Resolution
  vacations: DaySpan[]
  onSelect: (index: number | null) => void
  /** Swipe to page between periods; the ‹ › buttons slide through `pagerRef`. */
  paging?: Paging
  pagerRef?: RefObject<Pager | null>
}) {
  const build = useCallback(
    (tokens: ChartTokens): ChartOption => {
      const isSum = unit.aggregation === 'sum'
      const { series, plotted } = unitSeries({
        unit,
        stats,
        trend,
        projection,
        resolution,
        color: tokens.series,
        tokens,
        dense: slots.length > 10,
      })
      series[0].markArea = vacationBands(slots, vacations, resolution, tokens)
      series[0].markLine = targetLine(unit, tokens)
      const extent = niceExtent(unit.target == null ? plotted : [...plotted, unit.target], {
        zero: isSum,
      })

      return {
        animationDuration: 350,
        textStyle: { fontFamily: tokens.font },
        grid: { top: 20, right: 4, bottom: 4, left: 4, containLabel: true },
        xAxis: slotXAxis(tokens, slots),
        yAxis: quietValueAxis(tokens, unitTick(unit), extent),
        tooltip: selectionPointer(tokens, isSum || resolution !== 'day'),
        series,
      }
    },
    [unit, slots, stats, trend, projection, resolution, vacations],
  )

  const { viewportRef, containerRef } = useEChart({ build, onAxis: onSelect, paging, pagerRef })

  return (
    <div ref={viewportRef} className="chart-viewport">
      <div ref={containerRef} className="unit-chart" role="img" aria-label={`${unit.name} chart`} />
    </div>
  )
}
