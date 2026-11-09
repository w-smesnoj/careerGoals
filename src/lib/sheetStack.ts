import { prefersReducedMotion } from './motion'

/**
 * What every open sheet shares: the page underneath stops scrolling while any
 * is up, and - on a phone - recedes behind the first one, the way iOS pushes
 * the presenting screen back under a sheet.
 *
 * Module state rather than React state on purpose: the recede follows the
 * sheet's drag frame by frame, and is written straight to the page's
 * transform. Nothing here may cause a render.
 */

let openCount = 0
let savedOverflow = ''
let savedPaddingRight = ''

interface Recede {
  element: HTMLElement
  /** The visible window of the page, in the page's own coordinates. */
  clipTop: number
  clipBottom: number
}

let recede: Recede | null = null

/** How far back the page sits under a fully raised sheet. */
const RECEDE_SCALE = 0.06
const RECEDE_RADIUS = 12

/** Phone widths only, and never with reduced motion. */
function canRecede(): boolean {
  return window.matchMedia('(max-width: 40rem)').matches && !prefersReducedMotion()
}

function beginRecede(): void {
  const element = document.querySelector<HTMLElement>('.app-body')
  if (!element || !canRecede()) return

  const scrollY = window.scrollY
  const viewport = window.innerHeight
  const top = element.getBoundingClientRect().top + scrollY
  const height = element.offsetHeight
  const clipTop = Math.max(0, scrollY - top)
  const clipBottom = Math.max(0, top + height - (scrollY + viewport))

  // Scaled about the middle of what's on screen, not of the whole (tall) page.
  element.style.transformOrigin = `50% ${clipTop + viewport / 2}px`
  element.style.willChange = 'transform'
  document.documentElement.dataset.receded = ''
  recede = { element, clipTop, clipBottom }
}

/**
 * `progress` is how far the first sheet is up: 1 fully raised, 0 gone. Set
 * straight on the element's transform - never through an inherited CSS
 * variable, which would restyle every descendant on every frame.
 */
export function setRecedeProgress(progress: number): void {
  if (!recede) return
  const p = Math.max(0, Math.min(1, progress))
  const { element, clipTop, clipBottom } = recede
  element.style.transform = p > 0 ? `scale(${1 - RECEDE_SCALE * p})` : ''
  element.style.clipPath =
    p > 0 ? `inset(${clipTop}px 0 ${clipBottom}px 0 round ${RECEDE_RADIUS * p}px)` : ''
}

function endRecede(): void {
  if (!recede) return
  const { element } = recede
  element.style.transform = ''
  element.style.clipPath = ''
  element.style.transformOrigin = ''
  element.style.willChange = ''
  delete document.documentElement.dataset.receded
  recede = null
}

/**
 * Called as a sheet comes up. Returns whether it's the first one - the only
 * one that recedes the page; a sheet over a sheet just stacks.
 */
export function sheetOpened(): boolean {
  openCount += 1
  if (openCount > 1) return false

  const root = document.documentElement
  // Where a classic scrollbar disappears with the scroll, keep its width so
  // the page doesn't shift sideways under the sheet.
  const scrollbar = window.innerWidth - root.clientWidth
  savedOverflow = root.style.overflow
  savedPaddingRight = root.style.paddingRight
  root.style.overflow = 'hidden'
  if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`
  root.dataset.sheetOpen = ''

  beginRecede()
  return true
}

/** Called once a sheet has finished leaving. */
export function sheetClosed(): void {
  openCount = Math.max(0, openCount - 1)
  if (openCount > 0) return

  endRecede()
  const root = document.documentElement
  root.style.overflow = savedOverflow
  root.style.paddingRight = savedPaddingRight
  delete root.dataset.sheetOpen
}
