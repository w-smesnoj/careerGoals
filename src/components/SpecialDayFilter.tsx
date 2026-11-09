import { usePrefs } from '../hooks/usePrefs'
import { useCategoryIndex } from '../hooks/useSpecialDays'
import { FilterList } from './FilterList'

/** Sidebar filter for the special-days row - same toggle/solo/clear behaviour
 *  as the category and status filters, over the special-day categories.
 *  Hiding one takes it off the timeline, the day screen and Upcoming together. */
export function SpecialDayFilter() {
  const { hiddenSpecialCategories, toggleSpecialCategory, soloSpecialCategory, clearSpecialCategories } =
    usePrefs()
  const { list } = useCategoryIndex()
  const ids = list.map((category) => category.id)

  return (
    <FilterList
      title="Special days"
      items={list.map((category) => ({ key: category.id, label: category.name }))}
      hidden={hiddenSpecialCategories}
      onToggle={toggleSpecialCategory}
      onSolo={(key) => soloSpecialCategory(key, ids)}
      onClear={clearSpecialCategories}
    />
  )
}
