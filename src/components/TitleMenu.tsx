import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

interface TitleMenuProps {
  /** The title button the panel is measured against. */
  anchorRef: RefObject<HTMLElement | null>
  /** The task's full title - rows truncate theirs to one line, so this is
   *  where a long one can be read in full. */
  heading?: string
  /** Context the row itself no longer shows - the task's goal, how often it
   *  repeats - read before any of the actions. */
  caption?: string
  onAddNote: () => void
  /** Everything about the task - title, goal, repeat, units, limit, what a
   *  missed day becomes - in the one task sheet. */
  onEditTask: () => void
  /** The task's goal, on its own page. */
  onShowGoal: () => void
  /** Only offered once the task's goal has been resolved - archiving is how
   *  finished work leaves the day screen. */
  onArchive?: () => void
  onClose: () => void
}

/** Wide enough for the longest label, and the panel is positioned by
 *  measurement, so it needs a width to hold inside the viewport with. */
const MENU_WIDTH = 230
const VIEWPORT_MARGIN = 8

/**
 * Small popover under a task title. Closes on outside click or Escape.
 *
 * The panel is portalled to <body> rather than rendered where it sits: the
 * title of an open task lives inside `.day-item-swipe`, which is
 * `overflow: hidden` so the swipe cues stay inside the row, and which the
 * drag transform turns into its own stacking context. Either would clip a
 * panel rendered in place.
 */
export function TitleMenu({
  anchorRef,
  heading,
  caption,
  onAddNote,
  onEditTask,
  onShowGoal,
  onArchive,
  onClose,
}: TitleMenuProps) {
  const ref = useRef<HTMLDivElement>(null)
  // No position until it has been measured; until then the panel stays hidden
  // rather than flashing at the top-left corner.
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (!rect) return
    setPosition({
      top: rect.bottom + 4,
      // Left-aligned to the title, then held inside the viewport.
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(rect.left, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN),
      ),
    })
  }, [anchorRef])

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      // The anchor is excluded too: it toggles the menu itself, and closing
      // here first would just let that click reopen it.
      if (ref.current?.contains(target) || anchorRef.current?.contains(target)) return
      onClose()
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    // Positioned once, from a measurement. Anything that moves the title out
    // from under the panel closes it rather than leaving it stranded -
    // capture, because the scroll that matters is an inner one.
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [anchorRef, onClose])

  if (!position) return null

  return createPortal(
    <div
      className="title-menu"
      ref={ref}
      role="menu"
      style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
    >
      {(heading || caption) && (
        <div className="title-menu-caption">
          {heading && <span className="title-menu-heading">{heading}</span>}
          {caption}
        </div>
      )}
      <button type="button" role="menuitem" onClick={onAddNote}>
        Add note
      </button>
      <button type="button" role="menuitem" onClick={onEditTask}>
        Edit Task…
      </button>
      <button type="button" role="menuitem" onClick={onShowGoal}>
        Show Goal
      </button>
      {onArchive && (
        <button type="button" role="menuitem" onClick={onArchive}>
          Archive task
        </button>
      )}
    </div>,
    document.body,
  )
}
