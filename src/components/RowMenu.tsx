import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { DotsIcon } from './icons'

export interface MenuItem {
  label: string
  onSelect: () => void
  /** Set apart visually - for the one that ends something. */
  danger?: boolean
}

/** Wide enough for the longest label we use, and the panel is right-aligned
 *  to the button, so it needs a width to measure against. */
const MENU_WIDTH = 190
const VIEWPORT_MARGIN = 8

/**
 * A row's own actions, behind one button.
 *
 * The panel is portalled to <body> rather than rendered where it sits. In the
 * timeline this button lives inside `.rct-sidebar-row`, which is
 * `overflow: hidden` on purpose - it clips a row rather than letting one bleed
 * into its neighbours - and inside `.tracker-scroll`, which scrolls sideways.
 * A panel rendered in place would be cut off by both.
 */
export function RowMenu({
  label,
  items,
  trigger,
  buttonClassName,
}: {
  label: string
  items: MenuItem[]
  /** Replaces the default `<DotsIcon />` as the button's content. */
  trigger?: ReactNode
  /** Appended to the button's class, for a caller that needs its own size/shape. */
  buttonClassName?: string
}) {
  // Doubles as the open flag: there is no position until it has been measured.
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const open = position !== null

  useEffect(() => {
    if (!open) return
    const close = () => setPosition(null)

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      close()
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    // The panel is positioned once, from a measurement. Anything that moves the
    // button out from under it closes it rather than leaving it stranded -
    // capture, because the scroll that matters is an inner one.
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [open])

  function toggle() {
    if (open) {
      setPosition(null)
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setPosition({
      top: rect.bottom + 4,
      // Right-aligned to the button, then held inside the viewport.
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN),
      ),
    })
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={buttonClassName ? `row-menu-button ${buttonClassName}` : 'row-menu-button'}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={toggle}
      >
        {trigger ?? <DotsIcon />}
      </button>

      {position &&
        createPortal(
          <div
            ref={menuRef}
            className="row-menu"
            role="menu"
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className="row-menu-item"
                data-danger={item.danger || undefined}
                onClick={() => {
                  setPosition(null)
                  item.onSelect()
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
