import { useMemo } from 'react'
import type { SpecialDayOccurrence } from '../api/specialDays'
import { holidayOccurrences } from '../lib/holidays'
import { expandStored, mergeOccurrences, placeComputed } from '../lib/specialDays'
import { usePrefs } from './usePrefs'
import { useCategoryIndex, useSpecialDays } from './useSpecialDays'

/**
 * Every special day falling in a window, from both sources at once: the days
 * entered by hand, and the holidays computed for the chosen Bundesland - each
 * paired with its category.
 *
 * The timeline, Today and Upcoming all read from here, so the three can never
 * disagree about what a day means or which categories are hidden.
 */
export function useSpecialDayOccurrences(fromDay: string, toDay: string): SpecialDayOccurrence[] {
  const { data: stored } = useSpecialDays()
  const categories = useCategoryIndex()
  const { bundesland, isSpecialCategoryVisible } = usePrefs()

  return useMemo(
    () =>
      mergeOccurrences(
        placeComputed(holidayOccurrences(fromDay, toDay, bundesland), categories.builtin),
        expandStored(stored ?? [], fromDay, toDay, categories.byId),
      ).filter((occurrence) => isSpecialCategoryVisible(occurrence.category.id)),
    [stored, categories, fromDay, toDay, bundesland, isSpecialCategoryVisible],
  )
}
