import { useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import type { SheetApi } from '../context/sheet'
import { useSheet } from '../hooks/useSheet'
import { spring } from '../lib/motion'
import { ActionSheet } from './ActionSheet'
import { OverlayScrollbar } from './OverlayScrollbar'
import { SheetCore, type SheetSize } from './SheetCore'
import { ChevronLeftIcon } from './icons'

/**
 * A bottom sheet with the "Discard Changes?" guard built in: while anything
 * inside has marked it dirty (useSheetDirty), a swipe down, a scrim tap or
 * Escape springs it back and asks first, the way iOS does.
 *
 * Mount it only while it's open and unmount it in `onClose`, which runs once
 * it has animated away. Inside, `useSheet().close()` is the way out.
 */
export function Sheet({
  label,
  onClose,
  size = 'auto',
  children,
}: {
  label: string
  onClose: () => void
  size?: SheetSize
  children: ReactNode
}) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const apiRef = useRef<SheetApi | null>(null)

  return (
    <SheetCore
      label={label}
      onClose={onClose}
      size={size}
      apiRef={apiRef}
      onBlockedDismiss={() => setConfirmingDiscard(true)}
    >
      {children}
      {confirmingDiscard && (
        <ActionSheet
          label="Discard changes?"
          message="Are you sure you want to discard your changes?"
          actions={[
            {
              label: 'Discard Changes',
              destructive: true,
              onSelect: () => {
                apiRef.current?.setDirty(false)
                void apiRef.current?.close()
              },
            },
          ]}
          cancelLabel="Keep Editing"
          onClose={() => setConfirmingDiscard(false)}
        />
      )}
    </SheetCore>
  )
}

/**
 * The bar at the top of a sheet: Cancel on the leading edge, the title in the
 * middle, the confirming action - bold - on the trailing edge. It's also a
 * drag handle: a sheet can be pulled down by it.
 */
export function SheetHeader({
  title,
  leading,
  trailing,
}: {
  title: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
}) {
  return (
    <header className="sheet-header" data-sheet-handle>
      <div className="sheet-header-leading">{leading}</div>
      <h2 className="sheet-title">{title}</h2>
      <div className="sheet-header-trailing">{trailing}</div>
    </header>
  )
}

/** A text button in a sheet's header - "Cancel", or bold "Save". */
export function SheetButton({
  children,
  onClick,
  bold = false,
  type = 'button',
  disabled,
}: {
  children: ReactNode
  onClick?: () => void
  bold?: boolean
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  return (
    <button
      type={type}
      className="sheet-nav-button"
      data-bold={bold || undefined}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** "Cancel": leaves through the dirty guard, exactly as a swipe would. */
export function SheetCancelButton({ label = 'Cancel' }: { label?: string }) {
  const sheet = useSheet()
  return <SheetButton onClick={() => sheet.requestDismiss()}>{label}</SheetButton>
}

/** "‹ Back" in a pushed page's header. */
export function SheetBackButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="sheet-nav-button sheet-back" onClick={onClick}>
      <ChevronLeftIcon />
      <span className="sheet-back-label">{label}</span>
    </button>
  )
}

/** The scrolling part of a sheet. Pulling down from its top drags the sheet. */
export function SheetBody({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null)
  return (
    <div className="sheet-scroll-frame">
      <div ref={scroller} className="sheet-scroll" data-sheet-scroll>
        {children}
      </div>
      <OverlayScrollbar scrollerRef={scroller} />
    </div>
  )
}

/**
 * Settings-style push navigation inside one sheet: Repeat ›, Tracking units ›
 * and the like slide in from the right over the root and back out again. All
 * pages edit the same draft and one Save on the root commits it, so moving
 * between them never loses anything.
 *
 * The root stays mounted underneath (and inert) so its scroll position and
 * fields survive the round trip.
 */
export function SheetPages({
  page,
  root,
  pages,
}: {
  /** The pushed page's key, or null for the root. */
  page: string | null
  root: ReactNode
  pages: Record<string, ReactNode>
}) {
  const reduceMotion = useReducedMotion()
  const pushed = page ? pages[page] : null

  return (
    <div className="sheet-pages">
      <motion.div
        className="sheet-page sheet-page-root"
        inert={page !== null}
        initial={false}
        animate={reduceMotion ? { opacity: page ? 0 : 1 } : { x: page ? '-28%' : '0%' }}
        transition={reduceMotion ? { duration: 0.2 } : spring}
      >
        {root}
      </motion.div>
      <AnimatePresence initial={false}>
        {pushed && (
          <motion.div
            key={page}
            className="sheet-page sheet-page-pushed"
            initial={reduceMotion ? { opacity: 0 } : { x: '100%' }}
            animate={reduceMotion ? { opacity: 1 } : { x: '0%' }}
            exit={reduceMotion ? { opacity: 0 } : { x: '100%' }}
            transition={reduceMotion ? { duration: 0.2 } : spring}
          >
            {pushed}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
