import { goalStatuses, type GoalStatus } from '../api/goals'
import { usePrefs } from '../hooks/usePrefs'
import { FilterList } from './FilterList'

const STATUS_LABELS: Record<GoalStatus, string> = {
  active: 'In progress',
  completed: 'Completed',
  archived: 'Archived',
}

/** Sidebar filter for a goal's own status - same look and toggle/solo/clear
 *  behaviour as CategoryFilter and TaskStatusFilter, just over a fixed set of
 *  goal statuses. App-wide like the other two, so it narrows Today and
 *  Overview as well as the Goals page. */
export function GoalStatusFilter() {
  const { hiddenGoalStatuses, toggleGoalStatus, soloGoalStatus, clearGoalStatuses } = usePrefs()

  return (
    <FilterList
      title="Goal status"
      items={goalStatuses.map((status) => ({ key: status, label: STATUS_LABELS[status] }))}
      hidden={hiddenGoalStatuses}
      onToggle={(key) => toggleGoalStatus(key as GoalStatus)}
      onSolo={(key) => soloGoalStatus(key as GoalStatus)}
      onClear={clearGoalStatuses}
    />
  )
}
