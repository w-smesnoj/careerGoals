import type { Goal } from '../api/goals'
import { TaskSheet } from './TaskSheet'

interface AddTaskDialogProps {
  /** The goals a task can go under; the first is preselected. */
  goals: Goal[]
  onClose: () => void
}

/**
 * Add a task to a goal - now the New Task sheet, kept under its old name and
 * props because Overview's timeline opens it.
 */
export function AddTaskDialog({ goals, onClose }: AddTaskDialogProps) {
  return <TaskSheet goals={goals} defaultGoalId={goals[0]?.id} onClose={onClose} />
}
