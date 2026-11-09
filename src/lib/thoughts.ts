import type { Thought } from '../api/thoughts'
import type { TrackerRange } from '../api/tracker'
import { readStored, writeStored } from './storage'

/** What a thought is called in a list: its title, else its first line. */
export function thoughtHeadline(thought: Pick<Thought, 'title' | 'text'>): string {
  if (thought.title.trim()) return thought.title.trim()
  return thought.text.trim().split('\n')[0] ?? ''
}

/** The text under a thought's title - all of it when it has none. Most
 *  thoughts are just a sentence or two, and that is content, not a title. */
export function thoughtBody(thought: Pick<Thought, 'title' | 'text'>): string {
  const text = thought.text.trim()
  const title = thought.title.trim()
  return title && text === title ? '' : text
}

/** Where a turned-into-action thought now lives, if it still exists. */
export function outcomeTarget(
  thought: Thought,
  tracker: TrackerRange | undefined,
): { to: string; label: string } | null {
  const outcome = thought.outcome
  if (!outcome || !tracker) return null
  if (outcome.kind === 'goal') {
    const goal = tracker.goals.find((candidate) => candidate.id === outcome.id)
    return goal ? { to: `/goals/${goal.id}`, label: goal.title } : null
  }
  for (const goal of tracker.goals) {
    if (goal.tasks.some((task) => task.id === outcome.id)) {
      return { to: `/goals/${goal.id}`, label: goal.title }
    }
  }
  return null
}

const SNOOZE_KEY = 'thinkTank.snoozed'

/** Thoughts the revisit card was told to "Keep", until when (day key). */
export function readSnoozed(): Record<string, string> {
  return readStored<Record<string, string>>(SNOOZE_KEY, {})
}

export function writeSnoozed(value: Record<string, string>): void {
  writeStored(SNOOZE_KEY, value)
}
