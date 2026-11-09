import type { Thought } from '../api/thoughts'
import { useGoals } from '../hooks/useGoals'
import { useUpdateThought } from '../hooks/useThoughts'
import { usePush } from '../lib/navigation'
import { thoughtHeadline } from '../lib/thoughts'
import { showToast } from '../lib/toast'
import { GoalSheet } from './GoalSheet'
import { TaskSheet } from './TaskSheet'

/**
 * Turning a thought into action: the New Task sheet prefilled with it (Repeat
 * = Once, a goal to pick, "Already done" for something that already happened),
 * or the New Goal sheet with its text as the plan. Once saved, the thought
 * remembers what it became and moves to "Turned into action".
 */
export function MakeFromThought({
  thought,
  kind,
  onClose,
}: {
  thought: Thought
  kind: 'task' | 'goal'
  onClose: () => void
}) {
  const { data: goals } = useGoals()
  const updateThought = useUpdateThought()
  const push = usePush()
  const activeGoals = (goals ?? []).filter((goal) => goal.status !== 'archived')
  const headline = thoughtHeadline(thought).slice(0, 140)

  function remember(outcome: { kind: 'task' | 'goal'; id: string; title: string }) {
    updateThought.mutate({ id: thought.id, outcome: { ...outcome, at: new Date().toISOString() } })
  }

  if (kind === 'goal') {
    return (
      <GoalSheet
        initialTitle={headline}
        initialPlan={thought.text}
        onClose={onClose}
        onSaved={(goal) => {
          remember({ kind: 'goal', id: goal.id, title: goal.title })
          showToast('Turned into a goal')
        }}
      />
    )
  }

  return (
    <TaskSheet
      goals={activeGoals}
      initialTitle={headline}
      initialOnce
      onClose={onClose}
      onSaved={(task) => {
        remember({ kind: 'task', id: task.id, title: task.title })
        showToast('Turned into a task', { label: 'View', onClick: () => push(`/goals/${task.goalId}`) })
      }}
    />
  )
}
