import type { TrackerTask } from '../api/tracker'

/**
 * Whether a task is paused for vacation on a day. The server decides which days
 * those are (server/src/lib/vacation.ts) and hands each task its own list, so
 * every view agrees - and hiding vacations in the sidebar filter only hides
 * them, it never un-pauses anything.
 *
 * A paused day counts only if it was ticked done anyway: it adds to a rate,
 * never subtracts from one.
 */
const setByList = new WeakMap<readonly string[], ReadonlySet<string>>()

export function isPausedOn(task: Pick<TrackerTask, 'pausedDays'>, day: string): boolean {
  const days = task.pausedDays
  if (!days || days.length === 0) return false
  let set = setByList.get(days)
  if (!set) {
    set = new Set(days)
    setByList.set(days, set)
  }
  return set.has(day)
}
