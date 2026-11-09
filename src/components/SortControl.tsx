import { usePrefs } from '../hooks/usePrefs'
import type { SortOrder } from '../hooks/useTimelineRows'

/** How the timeline stacks its rows. Lives in the sidebar because that's where
 *  every other view control now lives, even though only the overview reads it. */
export function SortControl() {
  const { sortOrder, setSortOrder } = usePrefs()

  return (
    <section className="sidebar-section" aria-label="Sort">
      <label className="sidebar-field">
        <span className="sidebar-field-label">Sort</span>
        <select
          value={sortOrder}
          onChange={(event) => setSortOrder(event.target.value as SortOrder)}
        >
          <option value="grouped">Grouped by goal</option>
          <option value="today">Today order</option>
        </select>
      </label>
    </section>
  )
}
