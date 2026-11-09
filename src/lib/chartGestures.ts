import { animate, type AnimationPlaybackControls } from 'motion'
import type { echarts } from './chartTheme'

/** -1 pages back to an older period, +1 forward to a newer one. */
export type PageDirection = -1 | 1

export interface Paging {
  canPage: (direction: PageDirection) => boolean
  onPage: (direction: PageDirection) => void
}

/** What the page's ‹ › buttons call, so a tap slides exactly the way a swipe does. */
export interface Pager {
  slide: (direction: PageDirection) => void
}

/** Hold this long without moving and a touch becomes a scrub, as in Apple Health. */
const LONG_PRESS_MS = 250
/** Movement before a touch commits to a direction - small enough to feel immediate. */
const SLOP_PX = 10
/** Only the last stretch of a drag says how fast it was going when released. */
const VELOCITY_WINDOW_MS = 100

/**
 * Where a flick would come to rest, the way scrolling decelerates - Apple's
 * projection from "Designing Fluid Interfaces". Deciding from the projected
 * point, not the release point, is what makes a short quick flick still page.
 */
function project(velocity: number, decelerationRate = 0.998): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate)
}

/** Past an edge the content follows less and less - resistance, never a hard stop. */
function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot))
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Touch handling for a period chart, Apple Health's split:
 *
 *  - **swipe sideways** pages through periods. The chart tracks the finger
 *    1:1, rubber-bands where there's nothing newer to show, and on release
 *    the gesture's own velocity decides - via where it would have come to
 *    rest - whether to page or spring back. A chart caught mid-slide is
 *    grabbed where it is, not where it was going.
 *  - **touch and hold** scrubs: the selection follows the finger and the
 *    headline reads it out; lifting clears it.
 *  - **a tap** selects the day / week / month under it until the next touch.
 *  - **a vertical drag** is left alone, so the page still scrolls.
 *
 * Touches are caught on the way down (capture phase) and kept from ECharts,
 * which would otherwise move its pointer on every touch, swipes included.
 * Mouse input never comes through here - a pointer can hover, and keeps
 * ECharts' own behaviour.
 */
export function attachChartGestures({
  viewport,
  content,
  chart,
  getPaging,
  getAxisMeta,
  clearSelection,
  beforePage,
}: {
  /** The stationary frame that clips the sliding chart. */
  viewport: HTMLElement
  /** The chart's own element - what slides. */
  content: HTMLElement
  chart: echarts.ECharts
  getPaging: () => Paging | undefined
  /** How many slots the x-axis has, and a y value inside the first grid. */
  getAxisMeta: () => { count: number; yMid?: number }
  clearSelection: () => void
  /** Lets the chart skip its own grow-in animation for a page that slides in. */
  beforePage: () => void
}): { pager: Pager; dispose: () => void } {
  let x = 0
  let animation: AnimationPlaybackControls | null = null
  // Bumped on every new animation or interruption, so a stopped animation's
  // completion can never fire a page change the user already took back.
  let generation = 0
  let mode: 'idle' | 'pending' | 'scrub' | 'page' | 'scroll' = 'idle'
  let startX = 0
  let startY = 0
  let baseX = 0
  let lastX = 0
  let lastY = 0
  let history: { t: number; x: number }[] = []
  let timer: number | undefined

  function setX(value: number) {
    x = value
    content.style.transform = value === 0 ? '' : `translate3d(${value}px, 0, 0)`
  }

  function stopAnimation() {
    generation++
    animation?.stop()
    animation = null
  }

  function animateX(to: number, velocity: number, duration: number, done?: () => void) {
    stopAnimation()
    const token = generation
    animation = animate(x, to, {
      type: 'spring',
      bounce: 0,
      duration,
      velocity,
      onUpdate: setX,
      onComplete: () => {
        if (token !== generation) return
        animation = null
        done?.()
      },
    })
  }

  /** Points the selection at the slot under `clientX`, snapped to its centre. */
  function selectAt(clientX: number, clientY: number) {
    const { count, yMid } = getAxisMeta()
    if (count === 0) return
    const rect = content.getBoundingClientRect()
    const raw = chart.convertFromPixel({ xAxisIndex: 0 }, clientX - rect.left)
    const index = Math.min(count - 1, Math.max(0, Math.round(Number(raw))))
    // The pointer only answers inside a grid, and a finger can be over the
    // axis labels - so aim at the middle of the first panel's value range.
    const point =
      yMid === undefined
        ? [clientX - rect.left, clientY - rect.top]
        : chart.convertToPixel({ xAxisIndex: 0, yAxisIndex: 0 }, [index, yMid])
    if (!Array.isArray(point)) return
    chart.dispatchAction({ type: 'showTip', x: point[0], y: point[1] })
  }

  function hideSelection() {
    chart.dispatchAction({ type: 'hideTip' })
    clearSelection()
  }

  /** Swipe right (positive x) goes back in time, like turning a page. */
  function directionOf(offset: number): PageDirection {
    return offset > 0 ? -1 : 1
  }

  function resist(raw: number): number {
    if (raw === 0) return 0
    const paging = getPaging()
    if (paging?.canPage(directionOf(raw))) return raw
    return rubberband(raw, viewport.clientWidth)
  }

  function commit(direction: PageDirection, velocity: number) {
    const paging = getPaging()
    if (!paging) return

    if (prefersReducedMotion()) {
      // No slide: a short cross-fade carries the change instead.
      stopAnimation()
      setX(0)
      const token = generation
      animation = animate(1, 0, {
        duration: 0.12,
        onUpdate: (value) => (content.style.opacity = String(value)),
        onComplete: () => {
          if (token !== generation) return
          beforePage()
          paging.onPage(direction)
          animation = animate(0, 1, {
            duration: 0.18,
            onUpdate: (value) => (content.style.opacity = String(value)),
            onComplete: () => (content.style.opacity = ''),
          })
        },
      })
      return
    }

    // Out the way the finger was going, and the next period in from the
    // other side - the path back is the path out.
    const width = viewport.clientWidth
    const out = direction === -1 ? width : -width
    animateX(out, velocity, 0.3, () => {
      beforePage()
      paging.onPage(direction)
      setX(-out)
      animateX(0, 0, 0.4)
    })
  }

  function release() {
    const recent = history.filter((sample) => sample.t >= history[history.length - 1].t - VELOCITY_WINDOW_MS)
    const first = recent[0]
    const last = recent[recent.length - 1]
    const elapsed = last.t - first.t
    const velocity = elapsed > 0 ? ((last.x - first.x) / elapsed) * 1000 : 0

    const projected = x + project(velocity)
    const direction = directionOf(projected)
    const paging = getPaging()
    if (Math.abs(projected) > viewport.clientWidth * 0.35 && paging?.canPage(direction)) {
      commit(direction, velocity)
    } else {
      animateX(0, velocity, 0.35)
    }
  }

  function onTouchStart(event: TouchEvent) {
    event.stopPropagation()
    window.clearTimeout(timer)
    if (event.touches.length > 1) {
      mode = 'scroll'
      return
    }
    const touch = event.touches[0]
    startX = lastX = touch.clientX
    startY = lastY = touch.clientY
    history = [{ t: event.timeStamp, x: touch.clientX }]
    hideSelection()

    if (animation && x !== 0) {
      // Caught mid-slide: carry on from exactly where it is on screen.
      stopAnimation()
      baseX = x
      mode = 'page'
      return
    }

    baseX = x
    mode = 'pending'
    timer = window.setTimeout(() => {
      if (mode !== 'pending') return
      mode = 'scrub'
      navigator.vibrate?.(8)
      selectAt(lastX, lastY)
    }, LONG_PRESS_MS)
  }

  function onTouchMove(event: TouchEvent) {
    event.stopPropagation()
    if (mode === 'idle' || mode === 'scroll') return
    const touch = event.touches[0]
    lastX = touch.clientX
    lastY = touch.clientY

    if (mode === 'pending') {
      const dx = touch.clientX - startX
      const dy = touch.clientY - startY
      if (Math.abs(dx) > SLOP_PX && Math.abs(dx) > Math.abs(dy)) {
        window.clearTimeout(timer)
        mode = 'page'
        // Track from here, so crossing the threshold doesn't make it jump.
        startX = touch.clientX
      } else if (Math.abs(dy) > SLOP_PX) {
        window.clearTimeout(timer)
        mode = 'scroll'
        return
      } else {
        return
      }
    }

    if (event.cancelable) event.preventDefault()

    if (mode === 'scrub') {
      selectAt(touch.clientX, touch.clientY)
      return
    }

    history.push({ t: event.timeStamp, x: touch.clientX })
    if (history.length > 20) history = history.slice(-20)
    setX(resist(baseX + touch.clientX - startX))
  }

  function onTouchEnd(event: TouchEvent) {
    event.stopPropagation()
    window.clearTimeout(timer)
    // Also keeps the browser from replaying the touch as mouse events, which
    // ECharts would read as a hover that never ends.
    if (event.cancelable) event.preventDefault()

    if (mode === 'pending') selectAt(lastX, lastY)
    else if (mode === 'scrub') hideSelection()
    else if (mode === 'page') release()
    mode = 'idle'
  }

  function onTouchCancel(event: TouchEvent) {
    event.stopPropagation()
    window.clearTimeout(timer)
    if (mode === 'scrub') hideSelection()
    if (mode === 'page') animateX(0, 0, 0.35)
    mode = 'idle'
  }

  const capture = { capture: true }
  const activeCapture = { capture: true, passive: false }
  viewport.addEventListener('touchstart', onTouchStart, capture)
  viewport.addEventListener('touchmove', onTouchMove, activeCapture)
  viewport.addEventListener('touchend', onTouchEnd, activeCapture)
  viewport.addEventListener('touchcancel', onTouchCancel, capture)

  return {
    pager: {
      slide(direction) {
        if (!getPaging()?.canPage(direction)) return
        hideSelection()
        commit(direction, 0)
      },
    },
    dispose() {
      window.clearTimeout(timer)
      stopAnimation()
      setX(0)
      content.style.opacity = ''
      viewport.removeEventListener('touchstart', onTouchStart, capture)
      viewport.removeEventListener('touchmove', onTouchMove, activeCapture)
      viewport.removeEventListener('touchend', onTouchEnd, activeCapture)
      viewport.removeEventListener('touchcancel', onTouchCancel, capture)
    },
  }
}
