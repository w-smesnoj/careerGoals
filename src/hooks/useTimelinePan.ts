import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  default as Timeline,
  TimelineGroupBase,
  TimelineItemBase,
} from 'react-calendar-timeline'

/** A press that travels further than this was a pan, not a click on a tick. */
const DRAG_SLOP = 4

/**
 * Click-drag panning for the timeline canvas, in place of the library's own.
 *
 * Theirs derives every step from a `scrollOffset` prop that only refreshes on
 * the next render, and its rAF queue overwrites rather than accumulates, so all
 * but the last pointer move in a frame is dropped and the canvas trails the
 * cursor at a fraction of its speed. This one measures from the press point.
 *
 * The window moves through the timeline's own `updateScrollCanvas`, never
 * through `visibleTimeStart` props: in controlled mode the library's
 * getDerivedStateFromProps merges the previous state over its own result, which
 * pins `state.items` and leaves every later render re-measuring and re-rendering
 * every item.
 *
 * `start`/`end` are the window to anchor on - the fetched date range - which
 * `defaultTimeStart` alone can't do, being read once in the constructor.
 *
 * `onWindowChange`, if given, fires with every window shown - the initial
 * one plus every pan and wheel-zoom after it - so a caller can persist where
 * the canvas ended up. Pass a stable callback: it's a dependency of the
 * pointer-listener effect below, so a new identity each render would tear
 * down and rewire those listeners for no reason.
 */
export function useTimelinePan<
  Item extends TimelineItemBase<number>,
  Group extends TimelineGroupBase,
>(start: number, end: number, onWindowChange?: (start: number, end: number) => void) {
  const timeline = useRef<Timeline<Item, Group>>(null)
  // The listeners are wired up imperatively, so the wrapper is state rather
  // than a ref: the effect has to re-run once the element exists.
  const [wrap, setWrap] = useState<HTMLDivElement | null>(null)
  const shown = useRef({ start, end })

  const showWindow = useCallback(
    (from: number, to: number) => {
      shown.current = { start: from, end: to }
      timeline.current?.updateScrollCanvas(from, to)
      onWindowChange?.(from, to)
    },
    [onWindowChange],
  )

  useEffect(() => {
    showWindow(start, end)
  }, [showWindow, start, end])

  useEffect(() => {
    if (!wrap) return

    let anchorX = 0
    let anchorStart = 0
    let duration = 0
    let width = 0
    let pointerX = 0
    let frame: number | null = null
    let panning = false
    let dragged = false

    const canvas = () => wrap.querySelector<HTMLElement>('.rct-scroll')

    const apply = () => {
      frame = null
      const from = Math.round(anchorStart - ((pointerX - anchorX) * duration) / width)
      showWindow(from, from + duration)
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return
      const element = canvas()
      if (!element || !(event.target instanceof Node) || !element.contains(event.target)) {
        return
      }

      // Capture phase plus stopPropagation is what keeps the library's own drag
      // from running alongside this one: its listeners sit on .rct-scroll below
      // us, where a React handler couldn't reach them.
      event.stopPropagation()
      panning = true
      dragged = false
      anchorX = pointerX = event.clientX
      anchorStart = shown.current.start
      duration = shown.current.end - shown.current.start
      // Measured once: reading it per frame would force a layout right after
      // the timeline had written to the DOM.
      width = element.clientWidth
      wrap.dataset.panning = 'true'
      window.addEventListener('pointermove', onPointerMove)
      window.addEventListener('pointerup', onPointerUp)
      window.addEventListener('pointercancel', onPointerUp)
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!panning) return
      pointerX = event.clientX
      if (Math.abs(pointerX - anchorX) > DRAG_SLOP) dragged = true
      if (frame === null) frame = requestAnimationFrame(apply)
    }

    const onPointerUp = () => {
      panning = false
      delete wrap.dataset.panning
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }

    // A pan that starts on a tick still ends in a click on it.
    const onClick = (event: MouseEvent) => {
      if (!dragged) return
      dragged = false
      event.stopPropagation()
      event.preventDefault()
    }

    wrap.addEventListener('pointerdown', onPointerDown, { capture: true })
    wrap.addEventListener('click', onClick, { capture: true })

    return () => {
      wrap.removeEventListener('pointerdown', onPointerDown, { capture: true })
      wrap.removeEventListener('click', onClick, { capture: true })
      onPointerUp()
      if (frame !== null) cancelAnimationFrame(frame)
    }
  }, [wrap, showWindow])

  return { timeline, setWrap, showWindow }
}
