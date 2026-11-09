import { useCallback } from 'react'
import type { TrackingUnit } from '../api/trackingUnits'
import type { Fit } from '../lib/series'
import { type ChartOption, type ChartTokens, niceExtent, useEChart, withAlpha } from '../lib/chartTheme'
import { unitTick } from '../lib/chartSeries'

/**
 * One unit against another, a dot per day both were logged, with the
 * least-squares line through them - the honest way to ask "do these move
 * together?". Hovering a dot reports its index through `onSelect`; the page
 * puts the day and both figures in its headline.
 */
export function CorrelationChart({
  xUnit,
  yUnit,
  pairs,
  fit,
  onSelect,
}: {
  xUnit: TrackingUnit
  yUnit: TrackingUnit
  pairs: { date: string; x: number; y: number }[]
  fit: Fit | null
  onSelect: (index: number | null) => void
}) {
  const build = useCallback(
    (tokens: ChartTokens): ChartOption => {
      const xs = pairs.map((pair) => pair.x)
      const ys = pairs.map((pair) => pair.y)
      const xExtent = niceExtent(xs, { zero: xUnit.aggregation === 'sum' })
      const yExtent = niceExtent(ys, { zero: yUnit.aggregation === 'sum' })
      const axisName = (unit: TrackingUnit) => `${unit.name}${unit.symbol ? ` (${unit.symbol})` : ''}`

      const axis = (unit: TrackingUnit) => ({
        type: 'value' as const,
        name: axisName(unit),
        nameTextStyle: { color: tokens.textH, fontSize: 12 },
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: tokens.text, fontSize: 11, formatter: unitTick(unit) },
        splitLine: { lineStyle: { color: tokens.border, type: 'dashed' as const } },
      })

      const fitData =
        fit && xExtent
          ? [
              [xExtent.min, fit.intercept + fit.slope * xExtent.min],
              [xExtent.max, fit.intercept + fit.slope * xExtent.max],
            ]
          : []

      return {
        animationDuration: 350,
        textStyle: { fontFamily: tokens.font },
        grid: { top: 36, right: 16, bottom: 36, left: 8, containLabel: true },
        xAxis: {
          ...axis(xUnit),
          ...xExtent,
          nameLocation: 'middle',
          nameGap: 28,
        },
        yAxis: {
          ...axis(yUnit),
          ...yExtent,
          nameLocation: 'end',
          nameGap: 14,
          nameTextStyle: { color: tokens.textH, fontSize: 12, align: 'left' },
        },
        series: [
          {
            type: 'scatter',
            name: 'Days',
            data: pairs.map((pair) => [pair.x, pair.y]),
            symbolSize: pairs.length > 150 ? 6 : 8,
            itemStyle: {
              color: withAlpha(tokens.series, 0.55),
              borderColor: tokens.bg,
              borderWidth: 1,
            },
            emphasis: { scale: 1.8, itemStyle: { color: tokens.series } },
          },
          {
            type: 'line',
            name: 'Trend',
            data: fitData,
            silent: true,
            showSymbol: false,
            lineStyle: { color: tokens.textH, width: 1.5, type: [6, 4], opacity: 0.8 },
            // A line beyond the axes' clipped range would draw outside the plot.
            clip: true,
            z: 1,
          },
        ],
      }
    },
    [xUnit, yUnit, pairs, fit],
  )

  const { containerRef } = useEChart({
    build,
    onItem: (seriesIndex, dataIndex) => onSelect(seriesIndex === 0 ? dataIndex : null),
  })

  return (
    <div
      ref={containerRef}
      className="unit-chart correlation-chart"
      role="img"
      aria-label={`${xUnit.name} against ${yUnit.name}`}
    />
  )
}
