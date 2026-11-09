import { useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from 'react'

/**
 * Wherever a mouse or trackpad drives the app, it draws its own scrollbars,
 * the way macOS does: a thin thumb floating over the content's edge, there
 * while it scrolls and gone a moment after. The browser's own takes a strip
 * of the width the moment content overflows, so every page, sheet and
 * filter list that grew or shrank past the screen shoved everything sideways.
 * Touch screens keep their own indicators, which already float.
 */
export const OVERLAY_SCROLLBARS = '(hover: hover) and (pointer: fine)'

/** Shortest the thumb gets, however long the content. */
const MIN_THUMB = 36
/** How long it stays after the last scroll before it fades. */
const LINGER = 1000
/** How close to the edge the pointer has to come to call it up. */
const EDGE = 14

function subscribe(onChange: () => void) {
  const query = window.matchMedia(OVERLAY_SCROLLBARS)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function overlayScrollbars(): boolean {
  return window.matchMedia(OVERLAY_SCROLLBARS).matches
}

/**
 * Without a `scrollerRef` it's the page's. With one, render it as the scroller's
 * sibling inside a positioned frame the scroller fills - the thumb floats
 * over the frame's right edge.
 *
 * Everything after mount is written straight to the DOM: it follows the
 * scroll frame by frame and nothing here may cause a render.
 */
export function OverlayScrollbar({ scrollerRef }: { scrollerRef?: RefObject<HTMLElement | null> }) {
  const enabled = useSyncExternalStore(subscribe, overlayScrollbars)
  const trackRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const track = trackRef.current
    const thumb = thumbRef.current
    const page = !scrollerRef
    const element = scrollerRef ? scrollerRef.current : document.documentElement
    if (!enabled || !track || !thumb || !element) return

    // The browser's own goes (index.css) - before paint, so it never shows.
    element.setAttribute('data-overlay-scroller', '')
    const scroller: Window | HTMLElement = page ? window : element
    // Where the pointer is watched: the frame holds the thumb as well as the
    // scroller, so moving onto the thumb doesn't count as leaving.
    const area: HTMLElement = page ? element : (element.parentElement ?? element)

    function metrics() {
      return {
        top: page ? window.scrollY : element!.scrollTop,
        client: element!.clientHeight,
        scroll: element!.scrollHeight,
      }
    }

    function update() {
      const { top, client, scroll } = metrics()
      const range = scroll - client
      // Sub-pixel layout can leave a pixel of "overflow" that isn't one.
      if (range < 1) {
        delete track!.dataset.scrollable
        return
      }
      track!.dataset.scrollable = ''
      const rail = track!.clientHeight
      const length = Math.min(rail, Math.max(MIN_THUMB, (rail * client) / scroll))
      const offset = (rail - length) * Math.min(1, Math.max(0, top / range))
      thumb!.style.height = `${length}px`
      thumb!.style.transform = `translateY(${offset}px)`
    }

    let linger = 0
    function show() {
      track!.dataset.active = ''
      window.clearTimeout(linger)
      linger = window.setTimeout(() => delete track!.dataset.active, LINGER)
    }

    function handleScroll() {
      update()
      show()
    }

    // Brought up by the pointer nearing the edge, as macOS does - not by a
    // strip that sits over the content and swallows its clicks. Until then
    // only a visible thumb catches the pointer.
    let near = false
    function setNear(next: boolean) {
      if (next === near) return
      near = next
      if (near) {
        update()
        track!.dataset.hover = ''
      } else {
        delete track!.dataset.hover
      }
    }

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerType !== 'mouse') return
      if (page) {
        setNear(element!.clientWidth - event.clientX <= EDGE)
        return
      }
      const rect = element!.getBoundingClientRect()
      setNear(
        event.clientX <= rect.right &&
          rect.right - event.clientX <= EDGE &&
          event.clientY >= rect.top &&
          event.clientY <= rect.bottom,
      )
    }

    function handlePointerLeave() {
      setNear(false)
    }

    // Dragging the thumb: the page follows it 1:1 along the rail.
    let drag: { id: number; y: number; top: number; ratio: number } | null = null

    function handleThumbDown(event: PointerEvent) {
      if (event.button !== 0) return
      // Its own gesture: not a text selection, not a sheet drag, and the
      // field being typed into keeps its focus - as with a native scrollbar.
      event.preventDefault()
      event.stopPropagation()
      const { top, client, scroll } = metrics()
      const free = track!.clientHeight - thumb!.offsetHeight
      drag = { id: event.pointerId, y: event.clientY, top, ratio: free > 0 ? (scroll - client) / free : 0 }
      thumb!.setPointerCapture(event.pointerId)
      track!.dataset.dragging = ''
    }

    function handleThumbMove(event: PointerEvent) {
      if (!drag || event.pointerId !== drag.id) return
      scroller.scrollTo({ top: drag.top + (event.clientY - drag.y) * drag.ratio, behavior: 'instant' })
    }

    function endDrag() {
      if (!drag) return
      drag = null
      delete track!.dataset.dragging
      show()
    }

    function preventDefault(event: Event) {
      event.preventDefault()
    }

    update()
    scroller.addEventListener('scroll', handleScroll, { passive: true })
    area.addEventListener('pointermove', handlePointerMove, { passive: true })
    area.addEventListener('pointerleave', handlePointerLeave)
    thumb.addEventListener('pointerdown', handleThumbDown)
    thumb.addEventListener('mousedown', preventDefault)
    thumb.addEventListener('pointermove', handleThumbMove)
    thumb.addEventListener('pointerup', endDrag)
    thumb.addEventListener('pointercancel', endDrag)
    thumb.addEventListener('lostpointercapture', endDrag)

    return () => {
      window.clearTimeout(linger)
      scroller.removeEventListener('scroll', handleScroll)
      area.removeEventListener('pointermove', handlePointerMove)
      area.removeEventListener('pointerleave', handlePointerLeave)
      thumb.removeEventListener('pointerdown', handleThumbDown)
      thumb.removeEventListener('mousedown', preventDefault)
      thumb.removeEventListener('pointermove', handleThumbMove)
      thumb.removeEventListener('pointerup', endDrag)
      thumb.removeEventListener('pointercancel', endDrag)
      thumb.removeEventListener('lostpointercapture', endDrag)
      element.removeAttribute('data-overlay-scroller')
      for (const key of ['scrollable', 'active', 'hover', 'dragging']) delete track.dataset[key]
    }
  }, [enabled, scrollerRef])

  if (!enabled) return null

  return (
    <div ref={trackRef} className="scrollbar" data-page={scrollerRef ? undefined : ''} aria-hidden="true">
      <div ref={thumbRef} className="scrollbar-thumb" />
    </div>
  )
}
