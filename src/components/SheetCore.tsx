import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { animate, useMotionValue, useReducedMotion, type AnimationPlaybackControls } from 'motion/react'
import { useKeyboardInset } from '../hooks/useKeyboardInset'
import { VelocityTracker, project, rubberband, spring, springFlick } from '../lib/motion'
import { setRecedeProgress, sheetClosed, sheetOpened } from '../lib/sheetStack'
import { SheetContext, type SheetApi } from '../context/sheet'

export type SheetSize = 'auto' | 'large'

interface DragState {
  pointerId: number
  startX: number
  startY: number
  origin: number
  active: boolean
  /** The scrolling body the drag began in - it only becomes a sheet drag
   *  while that body sits at its top and the finger goes down. */
  scroller: HTMLElement | null
  tracker: VelocityTracker
  /** Takes this drag's window listeners off again. */
  detach: () => void
}

/** Movement (px) before a press commits to being a drag - taps stay taps. */
const DRAG_SLOP = 8

/**
 * The one bottom sheet, as a native modal <dialog> - focus trapping, Escape
 * and an inert page come with it. The dialog itself is a transparent
 * full-viewport layer; a scrim and a panel inside it do the drawing, so the
 * panel can be moved frame by frame and leave as it came.
 *
 *  - It rises on a critically damped spring and leaves the same way, then
 *    calls `onClose` - so a caller that mounts it with `{open && <X />}` and
 *    unmounts in `onClose` gets the exit for free.
 *  - It follows a downward drag 1:1 from its grabber or header, or from its
 *    body once that's scrolled to the top, rubber-banding when pulled up.
 *  - On release Apple's momentum projection decides: a flick is enough.
 *    Going back home carries the finger's velocity.
 *  - It can be grabbed at any point of its rise.
 *  - The first sheet up recedes the page behind it (lib/sheetStack).
 *
 * Everything that moves is written straight to the DOM from a motion value -
 * nothing here re-renders per frame.
 */
export function SheetCore({
  label,
  onClose,
  size = 'auto',
  variant = 'sheet',
  onBlockedDismiss,
  apiRef,
  children,
}: {
  /** Names the dialog for assistive tech. */
  label: string
  /** Called once the sheet has finished leaving. Unmount it here. */
  onClose: () => void
  size?: SheetSize
  /** 'action' is the iOS action sheet: floating groups, no grabber. */
  variant?: 'sheet' | 'action'
  /** A dismiss was refused because the sheet is dirty - ask the user. */
  onBlockedDismiss?: () => void
  /** For a parent that needs to close it from outside. */
  apiRef?: RefObject<SheetApi | null>
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const reduceMotion = useReducedMotion() ?? false
  const keyboard = useKeyboardInset()

  // How far below its resting place the panel is, in px; and for reduced
  // motion, which swaps travel for a fade, its opacity.
  const y = useMotionValue(0)
  const opacity = useMotionValue(1)

  const height = useRef(0)
  const isRoot = useRef(false)
  const dirty = useRef(false)
  const closing = useRef<Promise<void> | null>(null)
  const animation = useRef<AnimationPlaybackControls | null>(null)
  const drag = useRef<DragState | null>(null)
  const suppressClick = useRef(false)
  const reduceRef = useRef(reduceMotion)

  // The latest callbacks, for handlers that outlive the render they came from.
  const onCloseRef = useRef(onClose)
  const onBlockedRef = useRef(onBlockedDismiss)
  useLayoutEffect(() => {
    onCloseRef.current = onClose
    onBlockedRef.current = onBlockedDismiss
    reduceRef.current = reduceMotion
  })

  function paint() {
    const panel = panelRef.current
    const scrim = scrimRef.current
    if (!panel || !scrim) return
    const offset = y.get()
    panel.style.transform = `translate3d(0, ${offset}px, 0)`
    panel.style.opacity = String(opacity.get())
    const h = height.current || 1
    const progress = reduceRef.current ? opacity.get() : Math.max(0, Math.min(1, 1 - offset / h))
    scrim.style.opacity = String(progress)
    if (isRoot.current) setRecedeProgress(progress)
  }

  function run(controls: AnimationPlaybackControls) {
    animation.current?.stop()
    animation.current = controls
    return controls
  }

  function close(velocity = 0): Promise<void> {
    if (closing.current) return closing.current
    const dialog = dialogRef.current
    drag.current = null
    closing.current = new Promise<void>((resolve) => {
      const finish = () => {
        if (dialog?.open) dialog.close()
        onCloseRef.current()
        resolve()
      }
      const controls = reduceRef.current
        ? run(animate(opacity, 0, { duration: 0.16, ease: 'easeOut' }))
        : run(
            animate(y, height.current, {
              type: 'spring',
              bounce: 0,
              duration: 0.35,
              velocity,
              restDelta: 1,
              restSpeed: 20,
            }),
          )
      void controls.finished.then(finish)
    })
    return closing.current
  }

  function springHome(velocity = 0) {
    if (reduceRef.current) {
      run(animate(y, 0, { duration: 0.15 }))
      return
    }
    // Bounce only after a throw: the finger gave it momentum to spend.
    const settle = Math.abs(velocity) > 400 ? springFlick : spring
    run(animate(y, 0, { ...settle, velocity }))
  }

  function attemptDismiss(velocity = 0) {
    if (closing.current) return
    if (dirty.current) {
      springHome(velocity)
      onBlockedRef.current?.()
      return
    }
    void close(velocity)
  }

  const api = useMemo<SheetApi>(
    () => ({
      close: () => close(),
      setDirty: (value) => {
        dirty.current = value
      },
      requestDismiss: () => attemptDismiss(),
    }),
    // The handlers only read refs, so one api object serves the sheet's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useLayoutEffect(() => {
    if (apiRef) apiRef.current = api
    return () => {
      if (apiRef) apiRef.current = null
    }
  }, [api, apiRef])

  // Up it comes. A layout effect, so the panel is placed below the fold
  // before the first paint rather than flashing at its resting place.
  useLayoutEffect(() => {
    const dialog = dialogRef.current
    const panel = panelRef.current
    if (!dialog || !panel) return

    dialog.showModal()
    // React focuses `autoFocus` fields on mount - while the dialog is still
    // closed, so it never takes. The rows mark theirs; focus it now that the
    // dialog is open, inside the tap that opened it (so iOS raises the keyboard).
    panel.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true })
    isRoot.current = sheetOpened()
    height.current = panel.offsetHeight

    const unsubscribeY = y.on('change', paint)
    const unsubscribeOpacity = opacity.on('change', paint)

    if (reduceRef.current) {
      y.set(0)
      opacity.set(0)
      paint()
      run(animate(opacity, 1, { duration: 0.2, ease: 'easeOut' }))
    } else {
      opacity.set(1)
      y.set(height.current)
      paint()
      run(animate(y, 0, spring))
    }

    // An 'auto' sheet grows and shrinks with its content; the dismiss
    // distance and the scrim's fade follow.
    const resize = new ResizeObserver(() => {
      height.current = panel.offsetHeight
    })
    resize.observe(panel)

    // A touch that starts in the scrolling body and pulls down from its top
    // belongs to the sheet: claimed on the very first move, before the
    // browser commits to a scroll (after which it would cancel the pointer).
    function handleTouchMove(event: TouchEvent) {
      const state = drag.current
      if (!state) return
      if (state.active) {
        event.preventDefault()
        return
      }
      const touch = event.touches[0]
      if (!touch || !state.scroller) return
      const dy = touch.clientY - state.startY
      const dx = touch.clientX - state.startX
      if (state.scroller.scrollTop <= 0 && dy > 0 && Math.abs(dy) >= Math.abs(dx)) {
        event.preventDefault()
      }
    }
    panel.addEventListener('touchmove', handleTouchMove, { passive: false })

    return () => {
      panel.removeEventListener('touchmove', handleTouchMove)
      resize.disconnect()
      unsubscribeY()
      unsubscribeOpacity()
      animation.current?.stop()
      if (dialog.open) dialog.close()
      if (isRoot.current) setRecedeProgress(0)
      sheetClosed()
      closing.current = null
    }
    // Runs once per mount; everything it reads is a ref or a stable value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function endDrag(event: PointerEvent) {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    state.detach()
    drag.current = null
    if (!state.active) return

    suppressClick.current = true
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)

    const velocity = state.tracker.velocity(event.timeStamp)
    const projected = y.get() + project(velocity)
    if (event.type !== 'pointercancel' && projected > height.current / 2) attemptDismiss(velocity)
    else springHome(velocity)
  }

  function handlePointerMove(event: PointerEvent) {
    const state = drag.current
    if (!state || state.pointerId !== event.pointerId) return
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY

    if (!state.active) {
      if (Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return
      // Sideways is somebody else's gesture - a swipe row, a chip strip.
      // Upwards, or down a body that still has scrolling to do, is a scroll.
      const sideways = Math.abs(dx) > Math.abs(dy)
      const scrolls = state.scroller && (state.scroller.scrollTop > 0 || dy < 0)
      if (sideways || scrolls) {
        state.detach()
        drag.current = null
        return
      }
      // Committed: grab it wherever it is, mid-rise included, and track from
      // here so the slop doesn't make it jump.
      animation.current?.stop()
      state.active = true
      state.origin = y.get()
      state.startY = event.clientY
      state.tracker.reset(state.origin, event.timeStamp)
      try {
        panelRef.current?.setPointerCapture(event.pointerId)
      } catch {
        // A pointer that already ended can't be captured; the drag just ends.
      }
      return
    }

    const raw = state.origin + (event.clientY - state.startY)
    const next = raw >= 0 ? raw : -rubberband(-raw, height.current || 1)
    y.set(next)
    state.tracker.add(next, event.timeStamp)
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (closing.current || drag.current) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const target = event.target as Element
    // A sheet stacked on this one lives inside it in the DOM; its gestures are its own.
    if (target.closest('dialog') !== dialogRef.current) return
    // Typing and picking keep their own pointer behaviour.
    if (target.closest('input, textarea, select, [contenteditable="true"], [data-no-sheet-drag]')) return

    const scroller = target.closest<HTMLElement>('[data-sheet-scroll]')
    const handle = target.closest('[data-sheet-handle]')
    if (!handle && !scroller && variant !== 'action') return

    drag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: y.get(),
      active: false,
      scroller: handle ? null : scroller,
      tracker: new VelocityTracker(),
      // The very functions added here, whichever render later removes them.
      detach: () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', end)
        window.removeEventListener('pointercancel', end)
      },
    }
    const move = handlePointerMove
    const end = endDrag
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
  }

  function handleClickCapture(event: ReactMouseEvent) {
    if (!suppressClick.current) return
    event.preventDefault()
    event.stopPropagation()
  }

  // Detach the window listeners if the sheet goes away mid-drag.
  useEffect(
    () => () => {
      drag.current?.detach()
      drag.current = null
    },
    [],
  )

  return (
    <dialog
      ref={dialogRef}
      className="sheet-dialog"
      aria-label={label}
      data-variant={variant}
      style={{ '--keyboard-inset': `${keyboard}px` } as CSSProperties}
      onCancel={(event) => {
        // Escape takes the same road as a swipe, dirty guard included.
        event.preventDefault()
        attemptDismiss()
      }}
      onClose={() => {
        // Closed by the browser rather than by us (a repeated Escape that
        // Chrome won't let a page refuse twice): unmount without the exit.
        //
        // `close` is queued, not fired on the spot - so a close from an
        // effect cleanup (StrictMode's test unmount in dev) arrives after
        // the remount has already reopened the dialog. That one is stale:
        // the dialog is open, and must stay so.
        if (!closing.current && !dialogRef.current?.open) onCloseRef.current()
      }}
    >
      <div ref={scrimRef} className="sheet-scrim" onClick={() => attemptDismiss()} />
      <div
        ref={panelRef}
        className="sheet-panel"
        data-size={size}
        data-variant={variant}
        onPointerDown={handlePointerDown}
        onClickCapture={handleClickCapture}
      >
        {variant === 'sheet' && <div className="sheet-grabber" data-sheet-handle aria-hidden="true" />}
        <SheetContext.Provider value={api}>{children}</SheetContext.Provider>
      </div>
    </dialog>
  )
}
