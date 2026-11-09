import { type RefObject, useEffect, useRef, useState } from 'react'
import * as echarts from 'echarts/core'
import { BarChart, LineChart, ScatterChart } from 'echarts/charts'
import type { BarSeriesOption, LineSeriesOption, ScatterSeriesOption } from 'echarts/charts'
import {
  AxisPointerComponent,
  GridComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
} from 'echarts/components'
import type {
  AxisPointerComponentOption,
  GridComponentOption,
  MarkAreaComponentOption,
  MarkLineComponentOption,
  TitleComponentOption,
  TooltipComponentOption,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { type Pager, type Paging, attachChartGestures } from './chartGestures'

// Only the pieces actually drawn - the full echarts bundle is several times this.
echarts.use([
  LineChart,
  BarChart,
  ScatterChart,
  GridComponent,
  TooltipComponent,
  AxisPointerComponent,
  MarkLineComponent,
  MarkAreaComponent,
  TitleComponent,
  CanvasRenderer,
])

export type ChartOption = echarts.ComposeOption<
  | LineSeriesOption
  | BarSeriesOption
  | ScatterSeriesOption
  | GridComponentOption
  | TooltipComponentOption
  | AxisPointerComponentOption
  | MarkLineComponentOption
  | MarkAreaComponentOption
  | TitleComponentOption
>

export { echarts }

const DARK_QUERY = '(prefers-color-scheme: dark)'

/**
 * Whether the OS is in dark mode. The chart paints onto a canvas, so CSS
 * variables can't reach it on their own - flipping this is what makes it
 * re-read them.
 */
export function useDarkMode(): boolean {
  const [dark, setDark] = useState(() => window.matchMedia(DARK_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(DARK_QUERY)
    const onChange = () => setDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return dark
}

/** The app's own tokens from index.css, so a chart wears the same theme as the page. */
export function readTokens() {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string) => style.getPropertyValue(name).trim()
  return {
    series: token('--chart-series'),
    /** Fixed identity slots for the compare page - validated as a set, never cycled. */
    categorical: [token('--chart-1'), token('--chart-2'), token('--chart-3')],
    text: token('--text'),
    textH: token('--text-h'),
    border: token('--border'),
    bg: token('--bg'),
    vacation: token('--time-off'),
    font: token('--sans'),
  }
}

export type ChartTokens = ReturnType<typeof readTokens>

/** `#rrggbb` at an opacity - for washes, faint dots and the selection band. */
export function withAlpha(hex: string, alpha: number): string {
  const value = parseInt(hex.slice(1), 16)
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`
}

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)
}

/** 1, 2, 2.5 or 5 times a power of ten - the steps an axis can be read in. */
function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / power
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10
  return nice * power
}

/**
 * A y-range on round numbers that holds every value (and the target, if the
 * caller passes it in). Set explicitly rather than left to ECharts: the range
 * capsules are stacked on an invisible base, and an auto-scaled axis would
 * take that base into account and squash the capsules flat.
 *
 * `zero` anchors a total at 0 - a day's steps charted from 6,000 up would
 * make a quiet day look like nothing - while a body weight floats free.
 */
export function niceExtent(
  values: number[],
  { zero = false }: { zero?: boolean } = {},
): { min: number; max: number; interval: number } | undefined {
  if (values.length === 0) return undefined
  let low = Math.min(...values)
  let high = Math.max(...values)
  if (zero) {
    low = Math.min(0, low)
    if (high <= low) high = low + 1
  } else {
    const pad = high > low ? (high - low) * 0.08 : Math.abs(high) * 0.02 || 1
    low -= pad
    high += pad
  }
  const interval = niceStep((high - low) / 3)
  return {
    min: Math.floor(low / interval) * interval,
    max: Math.ceil(high / interval) * interval,
    interval,
  }
}

/** The quiet axis every chart here shares: no line, no ticks, small muted labels. */
export function quietValueAxis(
  tokens: ChartTokens,
  format: (value: number) => string,
  extent?: { min: number; max: number; interval: number },
) {
  return {
    type: 'value' as const,
    position: 'right' as const,
    ...(extent ?? { splitNumber: 3 }),
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: tokens.text, fontSize: 11, formatter: format },
    splitLine: { lineStyle: { color: tokens.border, type: 'dashed' as const } },
  }
}

/**
 * The x-axis of every period chart: one category per slot, labelled only
 * where the slot asked for a label, so a month reads "1 8 15 22 29" rather
 * than thirty crammed numbers.
 */
export function slotXAxis(
  tokens: ChartTokens,
  slots: { key: string; axisLabel: string }[],
  { showLabels = true, gridIndex = 0 }: { showLabels?: boolean; gridIndex?: number } = {},
) {
  return {
    type: 'category' as const,
    gridIndex,
    data: slots.map((slot) => slot.key),
    axisLine: { lineStyle: { color: tokens.border } },
    axisTick: { show: false },
    axisLabel: {
      show: showLabels,
      interval: 0,
      color: tokens.text,
      fontSize: 11,
      formatter: (_value: string, index: number) => slots[index]?.axisLabel ?? '',
    },
    splitLine: { show: false },
  }
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** The x-axis length and a y value inside the first grid, for aiming a touch scrub. */
function axisMeta(option: ChartOption): { count: number; yMid?: number } {
  const xAxis = (Array.isArray(option.xAxis) ? option.xAxis[0] : option.xAxis) as
    | { data?: unknown[] }
    | undefined
  const yAxis = (Array.isArray(option.yAxis) ? option.yAxis[0] : option.yAxis) as
    | { min?: unknown; max?: unknown }
    | undefined
  const count = Array.isArray(xAxis?.data) ? xAxis.data.length : 0
  const yMid =
    typeof yAxis?.min === 'number' && typeof yAxis?.max === 'number'
      ? (yAxis.min + yAxis.max) / 2
      : undefined
  return { count, yMid }
}

/**
 * Owns one ECharts instance for the lifetime of the component: created on
 * mount, resized with its box, fed `build(tokens)` whenever that changes or
 * the colour scheme flips, disposed on unmount.
 *
 * `onAxis` reports the selected x-axis index (null once it's let go) - the
 * page shows the selected figure in its headline rather than a floating
 * tooltip, the way Apple Health does. `onItem` reports a hovered point's
 * dataIndex for charts without an axis pointer (the scatter).
 *
 * Given `paging`, touch input is taken over by attachChartGestures - swipe
 * to page, hold to scrub - and `pagerRef` is handed the same slide for the
 * page's ‹ › buttons. Without it, ECharts handles touch itself.
 */
export function useEChart({
  build,
  onAxis,
  onItem,
  paging,
  pagerRef,
}: {
  build: (tokens: ChartTokens) => ChartOption
  onAxis?: (index: number | null) => void
  onItem?: (seriesIndex: number, dataIndex: number | null) => void
  paging?: Paging
  pagerRef?: RefObject<Pager | null>
}) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)
  const handlers = useRef({ onAxis, onItem, paging })
  const meta = useRef<{ count: number; yMid?: number }>({ count: 0 })
  const skipAnimation = useRef(false)
  const gestures = useRef(Boolean(paging))
  const dark = useDarkMode()

  useEffect(() => {
    handlers.current = { onAxis, onItem, paging }
  })

  useEffect(() => {
    const container = containerRef.current
    const viewport = viewportRef.current
    if (!container) return
    const chart = echarts.init(container)
    chartRef.current = chart
    const observer = new ResizeObserver(() => chart.resize())
    observer.observe(container)

    let lastIndex: number | null = null
    const report = (index: number | null) => {
      if (index === lastIndex) return
      lastIndex = index
      handlers.current.onAxis?.(index)
    }

    chart.on('updateAxisPointer', (event) => {
      const axes = (event as { axesInfo?: { axisDim: string; value: number }[] }).axesInfo ?? []
      const x = axes.find((axis) => axis.axisDim === 'x')
      report(x ? Number(x.value) : null)
    })
    chart.on('mouseover', (event) => {
      handlers.current.onItem?.(event.seriesIndex ?? 0, event.dataIndex)
    })
    chart.on('mouseout', (event) => {
      handlers.current.onItem?.(event.seriesIndex ?? 0, null)
    })
    chart.getZr().on('globalout', () => {
      report(null)
      handlers.current.onItem?.(0, null)
    })

    const touch =
      gestures.current && viewport
        ? attachChartGestures({
            viewport,
            content: container,
            chart,
            getPaging: () => handlers.current.paging,
            getAxisMeta: () => meta.current,
            clearSelection: () => report(null),
            beforePage: () => {
              skipAnimation.current = true
            },
          })
        : null
    if (touch && pagerRef) pagerRef.current = touch.pager

    return () => {
      touch?.dispose()
      if (pagerRef) pagerRef.current = null
      observer.disconnect()
      chart.dispose()
      chartRef.current = null
    }
  }, [pagerRef])

  useEffect(() => {
    // `dark` isn't read here, but the tokens it switches are.
    void dark
    const option = build(readTokens())
    meta.current = axisMeta(option)
    // A period that slid in is already moving - growing its bars on top of
    // that is motion for its own sake. Reduced motion skips it everywhere.
    if (skipAnimation.current || window.matchMedia(REDUCED_MOTION_QUERY).matches) {
      option.animation = false
    }
    skipAnimation.current = false
    chartRef.current?.setOption(option, { notMerge: true })
  }, [build, dark])

  return { viewportRef, containerRef }
}
