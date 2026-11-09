import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useCompactBar } from '../hooks/useCompactBar'
import type { ZoomOrigin } from '../lib/navigation'
import { BackButton } from './PushLink'

/** The pinned bar's height (2.75rem) - the safe-area inset rides above it. */
const PINNED_BAR_PX = 44

/**
 * The iOS navigation bar for a page that isn't browsing a day: a large title
 * (with a small line above it), and a compact translucent bar that fades in
 * at the top once the title has scrolled away.
 *
 * On a detail page - one with `back` or `actions` - that bar is always there:
 * "‹ Goals" and the page's buttons stay pinned at the top, its material and
 * small title appearing only once the large title is gone, as in any iOS app.
 *
 * The bar is portalled to <body>, outside the page: the page recedes under a
 * sheet by being scaled, and a fixed bar inside a transformed element would
 * stop being fixed to the screen.
 */
export function LargeTitle({
  title,
  eyebrow,
  back,
  actions,
  accessory,
}: {
  title: string
  eyebrow?: ReactNode
  /** `zoomTo`: back shrinks the page into that point instead of sliding it away. */
  back?: { label: string; to: string; zoomTo?: () => ZoomOrigin | undefined }
  actions?: ReactNode
  /** Under the title - the think tank's search field. */
  accessory?: ReactNode
}) {
  const pinned = Boolean(back || actions)
  // Under a pinned bar the title is "gone" once it has slid beneath it.
  const { ref, compact } = useCompactBar<HTMLHeadingElement>(pinned ? PINNED_BAR_PX : 0)

  return (
    <header className="large-title" data-pinned={pinned || undefined}>
      {pinned && <div className="nav-bar-spacer" aria-hidden="true" />}
      {eyebrow && <div className="large-title-eyebrow">{eyebrow}</div>}
      <h1 ref={ref} className="large-title-text">
        {title}
      </h1>
      {accessory}

      {createPortal(
        <div
          className="nav-bar"
          data-visible={pinned || compact || undefined}
          data-compact={compact || undefined}
          aria-hidden={!pinned && !compact}
        >
          <div className="nav-bar-inner">
            <div className="nav-bar-leading">{back && <BackButton label={back.label} to={back.to} zoomTo={back.zoomTo} />}</div>
            <span className="nav-bar-title" aria-hidden="true">
              {title}
            </span>
            <div className="nav-bar-trailing">{actions}</div>
          </div>
        </div>,
        document.body,
      )}
    </header>
  )
}

/** A text or icon button for a nav bar's trailing edge - "Edit", "+". */
export function NavBarButton({
  children,
  onClick,
  label,
  bold = false,
}: {
  children: ReactNode
  onClick: () => void
  /** For an icon-only button. */
  label?: string
  bold?: boolean
}) {
  return (
    <button
      type="button"
      className="nav-bar-button"
      aria-label={label}
      data-bold={bold || undefined}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
