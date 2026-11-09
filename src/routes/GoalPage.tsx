import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { goalsApi } from '../api/goals'
import { outcomeLabels } from '../api/goalResolutions'
import type { TrackerGoal, TrackerTask } from '../api/tracker'
import { CalendarHeatmap } from '../components/CalendarHeatmap'
import { GoalSheet } from '../components/GoalSheet'
import { LargeTitle, NavBarButton } from '../components/LargeTitle'
import { ProgressRing } from '../components/ProgressRing'
import { PushLink } from '../components/PushLink'
import { ResolveGoalDialog } from '../components/ResolveGoalDialog'
import { TaskSheet } from '../components/TaskSheet'
import { ChevronRightIcon, PlusIcon } from '../components/icons'
import { useGoals } from '../hooks/useGoals'
import { useReopenGoal } from '../hooks/useGoalResolution'
import { useGoalNotes } from '../hooks/useTaskNotes'
import { useTracker } from '../hooks/useTracker'
import { useTrackingUnits } from '../hooks/useTrackingUnits'
import {
  goalDateRange,
  goalDays,
  goalHeat,
  goalStats,
  goalStreaks,
  taskWeek,
  type TaskDayMark,
} from '../lib/goalStats'
import { dayCount, formatDayLong, formatDayShort, todayKey } from '../lib/date'
import { counted, frequencySummary, limitSummary } from '../lib/taskLabels'
import { usePush } from '../lib/navigation'
import { hideGoal, refetchEverything } from '../lib/optimistic'
import { undoable } from '../lib/toast'

const MARK_LABELS: Record<TaskDayMark, string> = {
  done: 'done',
  failed: 'failed',
  open: 'not answered',
  none: 'not due',
}

/** A task's last seven days as dots: done, failed, owed, or not due. */
function WeekDots({ task, goal }: { task: TrackerTask; goal: TrackerGoal }) {
  const week = taskWeek(task, goal)
  return (
    <span
      className="week-dots"
      role="img"
      aria-label={`Last 7 days: ${week.map((entry) => MARK_LABELS[entry.mark]).join(', ')}`}
    >
      {week.map((entry) => (
        <span key={entry.day} className="week-dot" data-mark={entry.mark} />
      ))}
    </span>
  )
}

interface JournalEntry {
  key: string
  date: string
  text: string
  taskTitle: string
  failed: boolean
}

const JOURNAL_PREVIEW = 5

/**
 * One goal, read-only, top to bottom the way Health lays out a single metric:
 * how it's going, a calendar of its days, its tasks, its plan, what was
 * written along the way, and the units it feeds. Everything is edited
 * elsewhere - "Edit" for the goal, a task row for its task, + for a new one.
 */
export function GoalPage() {
  const { goalId = '' } = useParams()
  const { data, isPending } = useTracker()
  const goal = data?.goals.find((candidate) => candidate.id === goalId)

  if (isPending) {
    return (
      <div className="ios-page goal-page">
        <LargeTitle title="" back={{ label: 'Goals', to: '/goals' }} />
        <p className="today-empty">Loading…</p>
      </div>
    )
  }

  if (!goal) {
    return (
      <div className="ios-page goal-page">
        <LargeTitle title="Not found" back={{ label: 'Goals', to: '/goals' }} />
        <p className="today-empty">This goal doesn’t exist any more.</p>
      </div>
    )
  }

  return <GoalDetail key={goal.id} goal={goal} />
}

function GoalDetail({ goal }: { goal: TrackerGoal }) {
  const navigate = useNavigate()
  const push = usePush()
  const queryClient = useQueryClient()
  const today = todayKey()
  const { data: allGoals } = useGoals()
  const { data: units } = useTrackingUnits()
  const { data: notes } = useGoalNotes(goal.id)
  const reopenGoal = useReopenGoal()

  const [editing, setEditing] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  const [editingTask, setEditingTask] = useState<TrackerTask | null>(null)
  const [resolving, setResolving] = useState(false)
  const [planOpen, setPlanOpen] = useState(false)
  const [journalOpen, setJournalOpen] = useState(false)

  const stats = goalStats(goal)
  const { startDay, dueDay } = goalDateRange(goal)
  const days = useMemo(() => goalDays(goal), [goal])
  const heat = useMemo(() => goalHeat(goal), [goal])
  const streaks = goalStreaks(heat, days)
  const resolution = goal.resolution
  const activeGoals = (allGoals ?? []).filter((candidate) => candidate.status !== 'archived')
  const unitById = new Map((units ?? []).map((unit) => [unit.id, unit]))
  const started = today >= startDay

  // What was written along the way: day notes, and the reasons given for
  // failed days - newest first.
  const journal = useMemo(() => {
    const titles = new Map(goal.tasks.map((task) => [task.id, task.title]))
    const entries: JournalEntry[] = (notes ?? [])
      .filter((note) => titles.has(note.taskId))
      .map((note) => ({
        key: note.id,
        date: note.date,
        text: note.text,
        taskTitle: titles.get(note.taskId) ?? '',
        failed: false,
      }))
    for (const task of goal.tasks) {
      for (const [date, entry] of Object.entries(task.completions)) {
        if (entry.status === 'failed' && entry.note && !entry.auto) {
          entries.push({ key: `${task.id}-${date}`, date, text: entry.note, taskTitle: task.title, failed: true })
        }
      }
    }
    return entries.sort((a, b) => b.date.localeCompare(a.date))
  }, [goal, notes])

  // The units this goal's tasks feed: asked for when ticked, or judged on.
  const fedUnitIds = new Set<string>()
  for (const task of goal.tasks) {
    for (const id of task.unitIds) fedUnitIds.add(id)
    if (task.limit) fedUnitIds.add(task.limit.unitId)
  }
  const fedUnits = [...fedUnitIds].map((id) => unitById.get(id)).filter((unit) => unit !== undefined)

  function archive() {
    undoable({
      message: `Archived “${goal.title}”`,
      apply: () => hideGoal(queryClient, goal.id),
      run: (options) =>
        goalsApi.update(goal.id, { status: 'archived' }, options).finally(() => refetchEverything(queryClient)),
      undo: () => refetchEverything(queryClient),
      failure: 'Couldn’t archive it',
    })
    navigate('/goals', { replace: true })
  }

  const range = `${formatDayShort(startDay)} – ${dueDay ? formatDayShort(dueDay) : 'ongoing'}`
  const eyebrow = (
    <span className="goal-eyebrow" data-goal-color={goal.color ?? 'purple'}>
      <span className="goal-dot" aria-hidden="true" />
      <span>{[range, ...goal.categories].join(' · ')}</span>
    </span>
  )

  const shownJournal = journalOpen ? journal : journal.slice(0, JOURNAL_PREVIEW)

  return (
    <div className="ios-page goal-page" data-goal-color={goal.color ?? 'purple'}>
      <LargeTitle
        title={goal.title}
        eyebrow={eyebrow}
        back={{ label: 'Goals', to: '/goals' }}
        actions={
          <>
            <NavBarButton label="Add Task" onClick={() => setAddingTask(true)}>
              <PlusIcon />
            </NavBarButton>
            <NavBarButton onClick={() => setEditing(true)}>Edit</NavBarButton>
          </>
        }
      />

      <section className="ios-card progress-card" aria-label="Progress">
        <ProgressRing
          done={resolution ? resolution.stats.done : stats.done}
          failed={resolution ? resolution.stats.failed : stats.failed}
          total={resolution ? resolution.stats.possible : stats.possible}
          size={92}
          stroke={11}
          label={`${resolution ? resolution.stats.rate : stats.rate}% done`}
        >
          <span className="progress-card-rate">{resolution ? resolution.stats.rate : stats.rate}%</span>
        </ProgressRing>
        <div className="progress-card-text">
          {resolution ? (
            <>
              <span className="progress-card-figure">{outcomeLabels[resolution.outcome]}</span>
              <span className="progress-card-line">
                {resolution.stats.done.toLocaleString()} of {resolution.stats.possible.toLocaleString()} done ·
                resolved {formatDayShort(resolution.resolvedAt.slice(0, 10))}
              </span>
            </>
          ) : (
            <>
              <span className="progress-card-figure">
                {stats.done.toLocaleString()}
                <span className="progress-card-total"> of {stats.possible.toLocaleString()} done</span>
              </span>
              <span className="progress-card-line">
                {!started
                  ? `Starts in ${counted(dayCount(today, startDay) - 1, 'day')}`
                  : stats.daysPlanned
                    ? `Day ${Math.min(stats.daysElapsed, stats.daysPlanned)} of ${stats.daysPlanned}`
                    : `Day ${stats.daysElapsed}`}
                {stats.overdue && ' · past due'}
              </span>
              {started && (
                <span className="progress-card-line">
                  Streak {counted(streaks.current, 'day')} · best {counted(streaks.best, 'day')}
                </span>
              )}
            </>
          )}
        </div>
      </section>
      {resolution?.note && <p className="goal-resolution-note">{resolution.note}</p>}

      {days.length > 0 && heat.size > 0 && (
        <section className="ios-section">
          <h2 className="ios-section-title">Calendar</h2>
          <div className="ios-card">
            <CalendarHeatmap
              heat={heat}
              from={days[0]}
              to={days[days.length - 1]}
              onSelectDay={(day) => push(`/?date=${day}`)}
            />
          </div>
        </section>
      )}

      <section className="ios-section">
        <h2 className="ios-section-title">
          Tasks <span className="ios-section-count">{goal.tasks.length}</span>
        </h2>
        <ul className="ios-list">
          {goal.tasks.map((task) => {
            const limitUnit = task.limit ? unitById.get(task.limit.unitId) : undefined
            const subtitle = [
              frequencySummary(task.frequency),
              task.limit ? limitSummary({ ...task.limit, unit: limitUnit }) : null,
              ...task.unitIds.map((id) => unitById.get(id)?.name).filter(Boolean),
            ]
              .filter(Boolean)
              .join(' · ')
            return (
              <li key={task.id} className="ios-row">
                <button type="button" className="ios-row-link" onClick={() => setEditingTask(task)}>
                  <span className="ios-row-text">
                    <span className="ios-row-title">{task.title}</span>
                    <span className="ios-row-subtitle">{subtitle}</span>
                  </span>
                  {task.frequency.type !== 'once' && <WeekDots task={task} goal={goal} />}
                  <span className="ios-chevron" aria-hidden="true">
                    <ChevronRightIcon />
                  </span>
                </button>
              </li>
            )
          })}
          <li className="ios-row">
            <button type="button" className="ios-row-link ios-row-add" onClick={() => setAddingTask(true)}>
              <span className="ios-add-glyph" aria-hidden="true">
                <PlusIcon />
              </span>
              <span className="ios-row-title">Add Task</span>
            </button>
          </li>
        </ul>
      </section>

      {goal.description && (
        <section className="ios-section">
          <h2 className="ios-section-title">Plan</h2>
          <div className="ios-card">
            <p className="goal-plan" data-open={planOpen || undefined}>
              {goal.description}
            </p>
            {!planOpen && goal.description.length > 220 && (
              <button type="button" className="ios-link-button" onClick={() => setPlanOpen(true)}>
                more
              </button>
            )}
          </div>
        </section>
      )}

      {journal.length > 0 && (
        <section className="ios-section">
          <h2 className="ios-section-title">
            Journal <span className="ios-section-count">{journal.length}</span>
          </h2>
          <ul className="ios-list">
            {shownJournal.map((entry) => (
              <li key={entry.key} className="ios-row ios-row-static journal-row">
                <span className="ios-row-text">
                  <span className="journal-text" data-failed={entry.failed || undefined}>
                    {entry.text}
                  </span>
                  <span className="ios-row-subtitle">
                    {formatDayLong(entry.date)} · {entry.failed ? `Failed “${entry.taskTitle}”` : entry.taskTitle}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {!journalOpen && journal.length > JOURNAL_PREVIEW && (
            <button type="button" className="ios-link-button" onClick={() => setJournalOpen(true)}>
              Show all
            </button>
          )}
        </section>
      )}

      {fedUnits.length > 0 && (
        <section className="ios-section">
          <h2 className="ios-section-title">Tracking</h2>
          <ul className="ios-list">
            {fedUnits.map((unit) => (
              <li key={unit.id} className="ios-row">
                <PushLink to={`/tracking/${unit.id}`} className="ios-row-link">
                  <span className="ios-row-text">
                    <span className="ios-row-title">{unit.name}</span>
                  </span>
                  {unit.symbol && <span className="ios-row-detail">{unit.symbol}</span>}
                  <span className="ios-chevron" aria-hidden="true">
                    <ChevronRightIcon />
                  </span>
                </PushLink>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="ios-section">
        <ul className="ios-list">
          <li className="ios-row">
            <button type="button" className="ios-row-link ios-row-action" onClick={() => setResolving(true)}>
              {resolution ? 'Edit Resolution…' : 'Resolve…'}
            </button>
          </li>
          {resolution && (
            <>
              <li className="ios-row">
                <button
                  type="button"
                  className="ios-row-link ios-row-action"
                  disabled={reopenGoal.isPending}
                  onClick={() => reopenGoal.mutate(goal.id)}
                >
                  Reopen
                </button>
              </li>
              <li className="ios-row">
                <button type="button" className="ios-row-link ios-row-action" onClick={archive}>
                  Archive
                </button>
              </li>
            </>
          )}
        </ul>
      </section>

      {editing && (
        <GoalSheet
          goal={goal}
          onClose={() => setEditing(false)}
          onDeleted={() => navigate('/goals', { replace: true })}
        />
      )}

      {addingTask && (
        <TaskSheet goals={activeGoals.length ? activeGoals : [goal]} defaultGoalId={goal.id} onClose={() => setAddingTask(false)} />
      )}

      {editingTask && (
        <TaskSheet
          key={editingTask.id}
          task={editingTask}
          goals={activeGoals.length ? activeGoals : [goal]}
          onClose={() => setEditingTask(null)}
        />
      )}

      {resolving && (
        <ResolveGoalDialog
          goal={goal}
          onClose={() => setResolving(false)}
          onDeleted={() => navigate('/goals', { replace: true })}
        />
      )}
    </div>
  )
}
