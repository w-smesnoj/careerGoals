import { type ReactNode, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  type DragEndEvent,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import type { TrackerGoal, UpcomingTask } from '../api/tracker'
import { goalsApi } from '../api/goals'
import { outcomeLabels } from '../api/goalResolutions'
import { GoalSheet } from '../components/GoalSheet'
import { ResolveGoalDialog } from '../components/ResolveGoalDialog'
import { TaskSheet } from '../components/TaskSheet'
import { ProgressRing } from '../components/ProgressRing'
import { PushLink } from '../components/PushLink'
import { SwipeRow, type SwipeAction } from '../components/DayRowControls'
import { DayNav } from '../components/DayNav'
import { ArchiveIcon, CheckIcon, ChevronRightIcon } from '../components/icons'
import { useGoals, useReorderGoals } from '../hooks/useGoals'
import { useDay } from '../hooks/useDay'
import { useFabAction } from '../hooks/useFabAdd'
import { usePrefs } from '../hooks/usePrefs'
import { useTracker } from '../hooks/useTracker'
import { goalDateRange, goalStats } from '../lib/goalStats'
import { dayCount, formatDayLong, formatDayShort, formatRelativeDays, todayKey } from '../lib/date'
import { addTaskAction } from '../lib/swipeActions'
import { counted } from '../lib/taskLabels'
import { hideGoal, refetchEverything } from '../lib/optimistic'
import { undoable } from '../lib/toast'

/** How many of a goal's tasks due on the day in view are done/failed/still open. */
interface DayCounts {
  done: number
  failed: number
  total: number
}

const EMPTY_COUNTS: DayCounts = { done: 0, failed: 0, total: 0 }

/** "Day 14 of 31 · 78% so far", "Ongoing · 64% so far", "Achieved · 92%". */
function goalSubtitle(goal: TrackerGoal, date: string): string {
  const stats = goalStats(goal)
  if (goal.resolution) return `${outcomeLabels[goal.resolution.outcome]} · ${goal.resolution.stats.rate}%`
  const rate = stats.possible > 0 ? ` · ${stats.rate}% so far` : ''
  if (!stats.daysPlanned) return `Ongoing${rate}`
  return `Day ${dayCount(stats.startDay, date)} of ${stats.daysPlanned}${rate}`
}

function GoalRow({
  goal,
  date,
  counts,
  onAddTask,
  onResolve,
  onArchive,
}: {
  goal: TrackerGoal
  date: string
  counts: DayCounts
  onAddTask: () => void
  onResolve: () => void
  onArchive: () => void
}) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: goal.id })
  const style = {
    transform:
      [CSS.Transform.toString(transform), isDragging ? 'scale(1.02)' : null].filter(Boolean).join(' ') ||
      undefined,
    transition,
  }
  const resolved = goal.resolution !== null

  const trailing: SwipeAction = resolved
    ? { label: 'Archive', icon: <ArchiveIcon />, tone: 'gray', onCommit: onArchive }
    : { label: 'Resolve', icon: <CheckIcon />, tone: 'orange', onCommit: onResolve }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="ios-row ios-row-lead goal-row"
      data-goal-color={goal.color ?? 'purple'}
      data-resolved={resolved || undefined}
      data-dragging={isDragging || undefined}
    >
      <SwipeRow
        enabled
        lifted={isDragging}
        leading={addTaskAction(onAddTask)}
        trailing={trailing}
        contentProps={listeners}
      >
        <PushLink to={`/goals/${goal.id}`} className="ios-row-link">
          <ProgressRing done={counts.done} failed={counts.failed} total={counts.total} />
          <span className="ios-row-text">
            <span className="ios-row-title">{goal.title}</span>
            <span className="ios-row-subtitle">{goalSubtitle(goal, date)}</span>
          </span>
          <span className="ios-chevron" aria-hidden="true">
            <ChevronRightIcon />
          </span>
        </PushLink>
      </SwipeRow>
    </li>
  )
}

/**
 * Goal rows reordered by pressing and holding, as in any iOS list - a
 * sideways move before then is a swipe, a vertical one is a scroll.
 */
function SortableGoalList({
  goals,
  onMove,
  children,
}: {
  goals: TrackerGoal[]
  /** The lifted goal and the one it was dropped on. */
  onMove: (activeId: string, overId: string) => void
  children: ReactNode
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  )

  // Letting go of a lifted row would otherwise land as a tap that opens it.
  const suppressClick = useRef(false)
  function endDrag() {
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
  }

  function handleDragEnd(event: DragEndEvent) {
    endDrag()
    const { active, over } = event
    if (!over || active.id === over.id) return
    onMove(String(active.id), String(over.id))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={() => {
        suppressClick.current = true
        navigator.vibrate?.(8)
      }}
      onDragEnd={handleDragEnd}
      onDragCancel={endDrag}
    >
      <SortableContext items={goals.map((goal) => goal.id)} strategy={verticalListSortingStrategy}>
        <ul
          className="ios-list"
          onClickCapture={(event) => {
            if (!suppressClick.current) return
            event.preventDefault()
            event.stopPropagation()
          }}
        >
          {children}
        </ul>
      </SortableContext>
    </DndContext>
  )
}

/** A goal past its due date that nobody has closed the book on yet. */
function ResolveRow({ goal, onResolve }: { goal: TrackerGoal; onResolve: () => void }) {
  const stats = goalStats(goal)
  return (
    <li className="ios-row ios-row-lead goal-row" data-goal-color={goal.color ?? 'purple'}>
      <div className="ios-row-static">
        <PushLink to={`/goals/${goal.id}`} className="ios-row-link ios-row-link-inline">
          <ProgressRing done={stats.done} failed={stats.failed} total={stats.possible} />
          <span className="ios-row-text">
            <span className="ios-row-title">{goal.title}</span>
            <span className="ios-row-subtitle">
              Due {stats.dueDay ? formatDayShort(stats.dueDay) : ''} · {stats.rate}%
            </span>
          </span>
        </PushLink>
        <button type="button" className="pill-button" data-tone="orange" onClick={onResolve}>
          Resolve
        </button>
      </div>
    </li>
  )
}

/**
 * A goal with nothing due on the day in view, previewed by when it next has:
 * a running goal by its next task, one that hasn't started by its first day.
 */
interface UpcomingGoal {
  goal: TrackerGoal
  /** Null when nothing is scheduled at all - no tasks, or none falling due before the goal ends. */
  nextDay: string | null
  daysUntil: number | null
  /** What happens then: the task(s) falling due, or the start of the whole goal. */
  subtitle: string
  starts: boolean
}

/**
 * How far out each reveal of the upcoming list reaches, in days from the day
 * in view. The last one is open-ended: a goal can be scheduled a year out, and
 * "Next month" would be a lie about it.
 */
const UPCOMING_GROUPS = [
  { heading: 'Upcoming', through: 7 },
  { heading: 'Next two weeks', through: 14 },
  { heading: 'Next month', through: 30 },
  { heading: 'Later', through: Infinity },
]

/** A goal with nothing due on the day in view: a preview, linking to its page. */
function UpcomingGoalRow({ entry, date }: { entry: UpcomingGoal; date: string }) {
  const { goal, nextDay, daysUntil, subtitle, starts } = entry
  return (
    <li className="ios-row" data-resolved={goal.resolution !== null || undefined}>
      <PushLink to={`/goals/${goal.id}`} className="ios-row-link">
        <span className="ios-row-text">
          <span className="ios-row-title">{goal.title}</span>
          <span className="ios-row-subtitle">{nextDay ? subtitle : goalSubtitle(goal, date)}</span>
        </span>
        {nextDay && daysUntil !== null && (
          <span
            className="ios-row-detail"
            title={`${starts ? 'Starts' : 'Next due'} ${formatDayLong(nextDay)}`}
          >
            {formatRelativeDays(daysUntil)}
          </span>
        )}
      </PushLink>
    </li>
  )
}

/**
 * Goals with nothing due on the day in view, grouped by how far out their next
 * task is - the same shape Today previews its upcoming tasks in. Only the
 * nearest group shows at first; farther ones reveal behind one "Show more",
 * skipping straight past an empty group. Goals with nothing scheduled at all
 * come last, so every running goal is still somewhere on the screen.
 */
function UpcomingGoalsSection({ upcoming, date }: { upcoming: UpcomingGoal[]; date: string }) {
  const [revealed, setRevealed] = useState(1)

  const groups = useMemo(
    () => [
      ...UPCOMING_GROUPS.map(({ heading, through }, index) => {
        const from = index === 0 ? 1 : UPCOMING_GROUPS[index - 1].through + 1
        return {
          heading,
          items: upcoming.filter(
            (entry) => entry.daysUntil !== null && entry.daysUntil >= from && entry.daysUntil <= through,
          ),
        }
      }),
      { heading: 'Nothing scheduled', items: upcoming.filter((entry) => entry.daysUntil === null) },
    ],
    [upcoming],
  )

  if (upcoming.length === 0) return null

  // Open on the first group that actually has something in it, so a screen
  // whose nearest goal is a month out isn't just a bare "Show more".
  const shown = Math.max(revealed, groups.findIndex((group) => group.items.length > 0) + 1)

  function handleShowMore() {
    const next = groups.findIndex((group, index) => index >= shown && group.items.length > 0)
    setRevealed(next === -1 ? groups.length : next + 1)
  }

  const hasMoreToReveal = groups.slice(shown).some((group) => group.items.length > 0)

  return (
    <section className="ios-section">
      {groups.slice(0, shown).map(
        (group) =>
          group.items.length > 0 && (
            <div key={group.heading} className="ios-section-group">
              <h2 className="ios-section-title">{group.heading}</h2>
              <ul className="ios-list">
                {group.items.map((entry) => (
                  <UpcomingGoalRow key={entry.goal.id} entry={entry} date={date} />
                ))}
              </ul>
            </div>
          ),
      )}

      {hasMoreToReveal && (
        <button type="button" className="ios-link-button" onClick={handleShowMore}>
          Show more
        </button>
      )}
    </section>
  )
}

/**
 * The Goals screen, browsable by day like Today and Tracking: every goal
 * whose window covers the day in view, with a ring of how that day's tasks
 * under it are going. A row opens the goal's own page; swiping adds a task or
 * resolves it; pressing and holding reorders.
 */
export function GoalsPage() {
  const [date, setDate] = useState(todayKey)
  const today = todayKey()
  const queryClient = useQueryClient()
  const { data, isPending, isError, error } = useTracker()
  const { data: day, isPending: dayPending } = useDay(date)
  const { data: allGoals } = useGoals()
  const { isVisible, isStatusVisible, isGoalStatusVisible } = usePrefs()
  const reorderGoals = useReorderGoals()
  const [addingTaskFor, setAddingTaskFor] = useState<TrackerGoal | null>(null)
  const [resolvingGoal, setResolvingGoal] = useState<TrackerGoal | null>(null)
  const [addingGoal, setAddingGoal] = useState(false)

  // Here the floating add button means "New Goal".
  useFabAction(() => setAddingGoal(true))

  const activeGoals = useMemo(
    () => (allGoals ?? []).filter((goal) => goal.status !== 'archived'),
    [allGoals],
  )

  const visible = useMemo(
    () =>
      (data?.goals ?? []).filter(
        (goal) => isVisible(goal.categories) && isGoalStatusVisible(goal.status),
      ),
    [data, isVisible, isGoalStatusVisible],
  )

  // Every goal whose active window covers the day in view - a goal with
  // nothing due that day still shows, just with an empty ring.
  const goals = useMemo(
    () =>
      visible.filter((goal) => {
        const { startDay, dueDay } = goalDateRange(goal)
        return date >= startDay && (!dueDay || date <= dueDay)
      }),
    [visible, date],
  )

  // Past due and still open: the state Resolve exists for. Only asked about
  // on today - an earlier day's screen is a look back, not a to-do list.
  const needsResolving = useMemo(
    () =>
      date !== today
        ? []
        : visible.filter((goal) => goal.status !== 'archived' && goalStats(goal).overdue),
    [visible, date, today],
  )

  // The day's tasks, grouped by goal, counted the same way Today counts them.
  const countsByGoal = useMemo(() => {
    const counts = new Map<string, DayCounts>()
    for (const task of day?.tasks ?? []) {
      if (!isVisible(task.categories) || !isStatusVisible(task.status)) continue
      const current = counts.get(task.goalId) ?? { done: 0, failed: 0, total: 0 }
      current.total += 1
      if (task.status === 'done') current.done += 1
      else if (task.status === 'failed') current.failed += 1
      counts.set(task.goalId, current)
    }
    return counts
  }, [day, isVisible, isStatusVisible])

  // Goals with something to do on the day in view: a task on that day's list
  // - ticked or not, so finishing one doesn't send its goal away, and paused
  // for vacation or not, since a tick still counts - or, on today, a
  // carried-over day still owed. The same rows Today lists.
  const dueGoals = useMemo(() => {
    const ids = new Set<string>()
    for (const task of day?.tasks ?? []) {
      if (isVisible(task.categories) && isStatusVisible(task.status)) ids.add(task.goalId)
    }
    for (const task of day?.due ?? []) {
      if (isVisible(task.categories)) ids.add(task.goalId)
    }
    return goals.filter((goal) => ids.has(goal.id))
  }, [goals, day, isVisible, isStatusVisible])

  // Everything else, previewed by when it next has something due: a running
  // goal by its nearest upcoming task, one that hasn't started by its first
  // day - so the screen says what's coming as well as what's on.
  const upcoming = useMemo(() => {
    const dueIds = new Set(dueGoals.map((goal) => goal.id))
    const tasksByGoal = new Map<string, UpcomingTask[]>()
    for (const task of day?.upcoming ?? []) {
      tasksByGoal.set(task.goalId, [...(tasksByGoal.get(task.goalId) ?? []), task])
    }

    const entries: UpcomingGoal[] = []
    for (const goal of visible) {
      const { startDay, dueDay } = goalDateRange(goal)
      if (date < startDay) {
        entries.push({
          goal,
          nextDay: startDay,
          daysUntil: dayCount(date, startDay) - 1,
          subtitle: `Starts · ${counted(goal.tasks.length, 'task')} · ${dueDay ? `due ${formatDayShort(dueDay)}` : 'no due date'}`,
          starts: true,
        })
        continue
      }
      if (dueIds.has(goal.id) || (dueDay && date > dueDay)) continue

      // A weekly task can come round again after the goal has ended - that
      // isn't anything the goal still has coming.
      const next = (tasksByGoal.get(goal.id) ?? []).filter((task) => !dueDay || task.dueDate <= dueDay)
      const daysUntil = next.length > 0 ? Math.min(...next.map((task) => task.daysUntil)) : null
      const onNextDay = next.filter((task) => task.daysUntil === daysUntil)
      entries.push({
        goal,
        nextDay: onNextDay[0]?.dueDate ?? null,
        daysUntil,
        subtitle:
          onNextDay.length > 1
            ? `${onNextDay[0].title} + ${onNextDay.length - 1} more`
            : (onNextDay[0]?.title ?? ''),
        starts: false,
      })
    }
    // Stable, so goals due the same day keep their order from the list.
    return entries.sort((a, b) => (a.daysUntil ?? Infinity) - (b.daysUntil ?? Infinity))
  }, [visible, dueGoals, day, date])

  // The order is one list across every filter and day, so a move reindexes
  // every goal rather than just the ones on screen - only their own relative
  // order changes, and nothing off screen collides with it.
  function handleMove(activeId: string, overId: string) {
    const all = data?.goals ?? []
    const oldIndex = all.findIndex((goal) => goal.id === activeId)
    const newIndex = all.findIndex((goal) => goal.id === overId)
    if (oldIndex === -1 || newIndex === -1) return
    reorderGoals.mutate(arrayMove(all, oldIndex, newIndex).map((goal) => goal.id))
  }

  function archive(goal: TrackerGoal) {
    undoable({
      message: `Archived “${goal.title}”`,
      apply: () => hideGoal(queryClient, goal.id),
      run: (options) =>
        goalsApi.update(goal.id, { status: 'archived' }, options).finally(() => refetchEverything(queryClient)),
      undo: () => refetchEverything(queryClient),
      failure: 'Couldn’t archive it',
    })
  }

  return (
    <div className="goals-page ios-page">
      <header className="today-header">
        <DayNav date={date} onChange={setDate} allowFuture />
      </header>

      {(isPending || dayPending) && <p className="today-empty">Loading goals…</p>}
      {isError && <p className="error">Could not load the goals: {error.message}</p>}
      {data && data.goals.length === 0 && (
        <p className="today-empty">No goals yet. Tap + to set your first.</p>
      )}
      {data && data.goals.length > 0 && goals.length === 0 && needsResolving.length === 0 && (
        <p className="today-empty">
          {visible.length === 0 ? 'No goals match the selected filters.' : 'No goals running on this day.'}
        </p>
      )}

      {needsResolving.length > 0 && (
        <section className="ios-section">
          <h2 className="ios-section-title">
            Needs resolving <span className="ios-section-count">{needsResolving.length}</span>
          </h2>
          <ul className="ios-list">
            {needsResolving.map((goal) => (
              <ResolveRow key={goal.id} goal={goal} onResolve={() => setResolvingGoal(goal)} />
            ))}
          </ul>
        </section>
      )}

      {/* Held back until the day has loaded, so the list doesn't open with
          every goal under Upcoming and then jump back up. */}
      {!dayPending && goals.length > 0 && dueGoals.length === 0 && (
        <p className="today-empty">No goals have tasks {date === today ? 'today' : 'on this day'}.</p>
      )}

      {!dayPending && dueGoals.length > 0 && (
        <section className="ios-section">
          {needsResolving.length > 0 && (
            <h2 className="ios-section-title">{date === today ? 'Today' : 'This day'}</h2>
          )}
          <SortableGoalList goals={dueGoals} onMove={handleMove}>
            {dueGoals.map((goal) => (
              <GoalRow
                key={goal.id}
                goal={goal}
                date={date}
                counts={countsByGoal.get(goal.id) ?? EMPTY_COUNTS}
                onAddTask={() => setAddingTaskFor(goal)}
                onResolve={() => setResolvingGoal(goal)}
                onArchive={() => archive(goal)}
              />
            ))}
          </SortableGoalList>
        </section>
      )}

      {!dayPending && <UpcomingGoalsSection upcoming={upcoming} date={date} />}

      {addingGoal && <GoalSheet onClose={() => setAddingGoal(false)} />}

      {addingTaskFor && (
        <TaskSheet
          key={addingTaskFor.id}
          goals={activeGoals}
          defaultGoalId={addingTaskFor.id}
          onClose={() => setAddingTaskFor(null)}
        />
      )}

      {resolvingGoal && (
        <ResolveGoalDialog
          key={resolvingGoal.id}
          goal={resolvingGoal}
          onClose={() => setResolvingGoal(null)}
        />
      )}
    </div>
  )
}
