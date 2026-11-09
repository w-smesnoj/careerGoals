import { EyeIcon, EyeOffIcon } from './icons'

export interface FilterItem {
  key: string
  label: string
  count?: number
}

/** A titled, togglable list for the sidebar: the eye hides just that one row;
 *  clicking the label solos it, hiding every other row. Shared by the
 *  category and task-status filters so they look and behave identically. */
export function FilterList({
  title,
  items,
  hidden,
  onToggle,
  onSolo,
  onClear,
}: {
  title: string
  items: FilterItem[]
  hidden: Set<string>
  onToggle: (key: string) => void
  onSolo: (key: string) => void
  onClear: () => void
}) {
  if (items.length === 0) return null

  return (
    <section className="sidebar-filter" aria-label={title}>
      <header className="sidebar-filter-head">
        <span className="sidebar-filter-title">{title}</span>
        {/* Always in the DOM, just hidden - so the header doesn't grow by a
            few pixels and nudge the list down the moment something's hidden. */}
        <button
          type="button"
          className="link-button sidebar-filter-clear"
          data-active={hidden.size > 0 || undefined}
          onClick={onClear}
        >
          Clear filter
        </button>
      </header>

      <ul className="sidebar-filter-list">
        {items.map(({ key, label, count }) => {
          const visible = !hidden.has(key)
          return (
            <li key={key} className="sidebar-filter-row">
              <button
                type="button"
                className="sidebar-filter-title-btn"
                aria-pressed={visible}
                title={`Show only ${label}`}
                onClick={() => onSolo(key)}
              >
                <span className="sidebar-filter-name">{label}</span>
                {count !== undefined && <span className="sidebar-filter-count">{count}</span>}
              </button>
              <button
                type="button"
                className="sidebar-filter-eye"
                aria-pressed={visible}
                aria-label={`${visible ? 'Hide' : 'Show'} ${label}`}
                onClick={() => onToggle(key)}
              >
                {visible ? <EyeIcon /> : <EyeOffIcon />}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
