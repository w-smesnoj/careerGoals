import { shiftDay, todayKey } from './date'
import { readStored, writeStored } from './storage'

const VIEW_KEY = 'careerGoals.timelineView'

export type TimelineView = { from: string; to: string }

/** Today through the next 30 days - the fallback for when the container can't
 *  be measured and `fitTimelineView` has nothing to work from. */
export function defaultTimelineView(): TimelineView {
  const today = todayKey()
  return { from: today, to: shiftDay(today, 30) }
}

/** Today forward, as many whole days as fit at `dayWidth` px each - where the
 *  canvas opens when there's no stored window, sized so every tick cell comes
 *  out square. Clamped either side so a freak measurement can't open the
 *  timeline on two days or on a year. */
export function fitTimelineView(canvasWidth: number, dayWidth: number): TimelineView {
  const today = todayKey()
  const days = Math.min(120, Math.max(7, Math.floor(canvasWidth / dayWidth)))
  // `to` is the last day shown, not one past it, so a window of `days` columns
  // ends `days - 1` after it starts.
  return { from: today, to: shiftDay(today, days - 1) }
}

/** Wherever the user last panned the canvas to, or null if they never have -
 *  the caller fits the opening window to its own width in that case. */
export function readTimelineView(): TimelineView | null {
  return readStored<TimelineView | null>(VIEW_KEY, null)
}

export function writeTimelineView(view: TimelineView): void {
  writeStored(VIEW_KEY, view)
}
