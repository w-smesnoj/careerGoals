import { taskStatusFilters, type TaskStatusFilter as TaskStatusValue } from '../api/tracker'
import { usePrefs } from '../hooks/usePrefs'
import { FilterList } from './FilterList'

const STATUS_LABELS: Record<TaskStatusValue, string> = {
  todo: 'To do',
  done: 'Done',
  failed: 'Failed',
}

/** Sidebar filter for a task's status on the day it's shown - same look and
 *  toggle/solo/clear behaviour as CategoryFilter, just over a fixed set of
 *  statuses instead of whatever categories happen to be in use. */
export function TaskStatusFilter() {
  const { hiddenStatuses, toggleStatus, soloStatus, clearStatuses } = usePrefs()

  return (
    <FilterList
      title="Task status"
      items={taskStatusFilters.map((status) => ({ key: status, label: STATUS_LABELS[status] }))}
      hidden={hiddenStatuses}
      onToggle={(key) => toggleStatus(key as TaskStatusValue)}
      onSolo={(key) => soloStatus(key as TaskStatusValue)}
      onClear={clearStatuses}
    />
  )
}
