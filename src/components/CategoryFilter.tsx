import { usePrefs } from '../hooks/usePrefs'
import { FilterList } from './FilterList'

export interface CategoryCount {
  name: string
  count: number
}

/** Sidebar list of every category in use. The eye toggles just that one
 *  category; clicking the name solos it, hiding every other category.
 *
 *  The filter it drives is app-wide and persisted (see PrefsContext), so this
 *  is the same control wherever the sidebar happens to be drawn. */
export function CategoryFilter({ categories }: { categories: CategoryCount[] }) {
  const { hiddenCategories, toggleCategory, soloCategory, clearCategories } = usePrefs()
  const names = categories.map((category) => category.name)

  return (
    <FilterList
      title="Categories"
      items={categories.map(({ name, count }) => ({ key: name, label: name, count }))}
      hidden={hiddenCategories}
      onToggle={toggleCategory}
      onSolo={(name) => soloCategory(name, names)}
      onClear={clearCategories}
    />
  )
}
