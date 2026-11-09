import type { ZoomOrigin } from './navigation'
import { clampLead, MONTH_COUNT } from './plannerMonths'

/*
 * Where the calendar's strip was when a month was opened, so "‹ 2026" comes
 * back to the same place - and zooms back into the column it came out of.
 *
 * Module state rather than React state: it has to outlive the strip, which
 * unmounts while the month is open. Only a return (a history pop) reads it;
 * opening the tab fresh always starts on the current year.
 */

export interface PlannerReturn {
  /** The leading month when the strip was left. */
  lead: number
  scrollTop: number
  perScreen: number
  /** The month open now - stepping through months in the month view moves it. */
  month: number
  /** Where the scroller sat on screen, and one column's pitch, to aim the zoom. */
  rect: { left: number; top: number; width: number; height: number }
  pitch: number
}

let saved: PlannerReturn | null = null

export function rememberPlanner(state: PlannerReturn): void {
  saved = state
}

export function setReturnMonth(month: number): void {
  if (saved) saved = { ...saved, month: Math.min(Math.max(month, 0), MONTH_COUNT - 1) }
}

export function plannerReturn(): PlannerReturn | null {
  return saved
}

/**
 * The leading month to come back to: where it was, moved just far enough
 * that the month last open is on screen. The strip and the back button both
 * ask this, so the column the zoom aims at is the one that's there.
 */
export function returnLead(state: PlannerReturn): number {
  const { lead, month, perScreen } = state
  if (month < lead) return clampLead(month, perScreen)
  if (month >= lead + perScreen) return clampLead(month - perScreen + 1, perScreen)
  return lead
}

/** The centre of that column on screen, for the zoom back out. */
export function returnOrigin(): ZoomOrigin | undefined {
  if (!saved) return undefined
  const { rect, pitch, month } = saved
  return {
    x: rect.left + (month - returnLead(saved) + 0.5) * pitch,
    y: rect.top + rect.height / 2,
  }
}
