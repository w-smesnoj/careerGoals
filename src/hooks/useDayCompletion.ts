import { useMemo } from 'react'
import { dayHeatMap, type DayHeat } from '../lib/dayHeat'
import { shiftDay, todayKey } from '../lib/date'
import { usePrefs } from './usePrefs'
import { useTracker } from './useTracker'

export interface DayCompletion {
  /**
   * How each day from `from` to `to` went, up to today. Folded from whatever
   * the cache holds even while the layer is off - the tracker is only asked
   * for once it's on - so turning it off can draw the bars back out rather
   * than drop them. Null until the grid has been loaded at all.
   */
  heat: Map<string, DayHeat> | null
  /** Whether the layer is on. */
  shown: boolean
}

/**
 * The calendar's completion layer. Folded out of the same cached grid, under
 * the same filters, as the sidebar's month, so the two never disagree about
 * a day.
 */
export function useDayCompletion(from: string, to: string): DayCompletion {
  const { showCompletion, isVisible, isGoalStatusVisible } = usePrefs()
  const { data } = useTracker(showCompletion)
  const today = todayKey()

  const heat = useMemo(() => {
    if (!data) return null
    // Only days the grid covers - before it nothing was tracked - and
    // nothing still to come.
    const start = from > data.from ? from : data.from
    const end = [to, data.to, today].reduce((earliest, day) => (day < earliest ? day : earliest))
    const days: string[] = []
    for (let day = start; day <= end; day = shiftDay(day, 1)) days.push(day)
    return dayHeatMap(data.goals, days, { isVisible, isGoalStatusVisible }, today)
  }, [data, from, to, today, isVisible, isGoalStatusVisible])

  return { heat, shown: showCompletion }
}
