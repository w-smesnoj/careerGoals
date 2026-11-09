import type { SwipeAction } from '../components/DayRowControls'
import { CheckIcon, CrossIcon, PlusIcon, TaskIcon, TrashIcon } from '../components/icons'

/** Today's two: swipe left for done, right for failed. */
export function doneAction(onCommit: () => void): SwipeAction {
  return { label: 'Done', icon: <CheckIcon />, tone: 'tint', onCommit }
}

export function failedAction(onCommit: () => void): SwipeAction {
  return { label: 'Failed', icon: <CrossIcon />, tone: 'destructive', onCommit }
}

export function deleteAction(onCommit: () => void): SwipeAction {
  return { label: 'Delete', icon: <TrashIcon />, tone: 'destructive', onCommit }
}

export function addTaskAction(onCommit: () => void): SwipeAction {
  return { label: 'Add Task', icon: <PlusIcon />, tone: 'blue', onCommit }
}

export function makeTaskAction(onCommit: () => void): SwipeAction {
  return { label: 'Make Task', icon: <TaskIcon />, tone: 'blue', onCommit }
}
