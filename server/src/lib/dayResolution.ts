import { CompletionModel } from '../models/completion.model'
import type { GoalDocument } from '../models/goal.model'
import { TaskModel, type TaskDocument } from '../models/task.model'
import { addDays, dayDiff, toDayKey, today } from './date'
import { isScheduledOn } from './schedule'
import { loadVacationDays, pausedBy, type VacationDays } from './vacation'

/**
 * The single implementation of "what happens to a day nobody answered".
 *
 * Both halves of the question live here - the days a carry-over task is still
 * carrying (what the day screen shows as due) and the days that have run out
 * of road and become automatic fails - because they are the same calculation
 * seen from two sides, and splitting them across controllers is exactly how
 * the two would drift.
 */

/** The note an automatically failed day carries, so it reads as one on screen. */
export const AUTO_FAIL_NOTE = 'Automatically failed'

/** A closed range of calendar days, inclusive at both ends. */
export interface DayWindow {
  start: string
  end: string
}

/** One task's stacked-up debt, as the day screen shows it. */
export interface CarriedDays {
  /** The oldest day still outstanding - the one a due row answers. */
  dueDate: string
  /** How far behind that day now is, in days. */
  daysLate: number
  /** How many days are outstanding in total, this one included. */
  stacked: number
}

/**
 * The first day a task exists at all: the later of its own creation and its
 * goal's start. A goal that starts next week has nothing to do today, however
 * its tasks recur - the frequency says which days *within* the window count,
 * never when the window opens.
 *
 * The one definition of that, used by the window below and by the day screen
 * (see tracker.controller.ts getDay) - the two used to disagree.
 */
export function taskStartDay(
  task: Pick<TaskDocument, 'createdAt'>,
  goal: GoalDocument,
): string {
  const goalStart = toDayKey(goal.startDate ?? goal.createdAt)
  const taskStart = toDayKey(task.createdAt)
  return taskStart > goalStart ? taskStart : goalStart
}

/**
 * The span a task can actually be judged on: from the later of its own creation
 * and its goal's start, to the earlier of `upTo` and the goal's target date.
 *
 * The same clamp `taskStats` applies in src/lib/goalStats.ts, and for the same
 * reason - a task is never scored against days before it or its goal existed,
 * and nothing past the due date ever counts. Null when the span is empty.
 */
export function taskWindow(
  task: Pick<TaskDocument, 'createdAt'>,
  goal: GoalDocument,
  upTo: string,
): DayWindow | null {
  const start = taskStartDay(task, goal)

  const dueDay = goal.targetDate ? toDayKey(goal.targetDate) : null
  const end = dueDay && dueDay < upTo ? dueDay : upTo

  return start > end ? null : { start, end }
}

/**
 * Scheduled days in the window with no completion against them.
 *
 * Not for 'once' tasks: isScheduledOn is true every day for those, since a once
 * task has no date of its own, so this would read every day as an outstanding
 * one. Callers handle that frequency separately.
 *
 * `paused` is the vacation calendar when this task pauses on it (see
 * lib/vacation.ts). A paused day is owed nothing, so it is never outstanding -
 * which is what keeps it out of both the auto-fail sweep and the due list.
 */
export function outstandingDays(
  task: Pick<TaskDocument, 'frequency'>,
  window: DayWindow,
  answered: ReadonlySet<string>,
  paused?: Pick<VacationDays, 'has'>,
): string[] {
  const days: string[] = []
  for (let day = window.start; day <= window.end; day = addDays(day, 1)) {
    if (!isScheduledOn(task.frequency, day)) continue
    if (answered.has(day)) continue
    if (paused?.has(day)) continue
    days.push(day)
  }
  return days
}

/**
 * Where a task's unanswered days start being the resolver's business: the
 * window's own start, unless the watermark has already moved past it.
 *
 * Both sides of the feature go through this, and they have to. A day at or
 * before the watermark has been dealt with, so the sweep won't fail it - which
 * means the due list mustn't keep offering it either, or switching a task to
 * 'carry' would strand every day before the switch as permanently due.
 */
function unresolvedFrom(task: Pick<TaskDocument, 'autoResolvedThrough'>, window: DayWindow): string {
  const resolved = task.autoResolvedThrough
  return resolved && resolved >= window.start ? addDays(resolved, 1) : window.start
}

/** Which days each task already has an answer on, keyed by task id. */
async function answeredDays(
  taskIds: TaskDocument['_id'][],
  upTo?: string,
): Promise<Map<string, Set<string>>> {
  const completions = await CompletionModel.find({
    taskId: { $in: taskIds },
    ...(upTo ? { date: { $lte: upTo } } : {}),
  }).select('taskId date')

  const byTask = new Map<string, Set<string>>()
  for (const completion of completions) {
    const key = String(completion.taskId)
    const days = byTask.get(key) ?? new Set<string>()
    days.add(completion.date)
    byTask.set(key, days)
  }
  return byTask
}

/**
 * What each carry-over task is still carrying, keyed by task id. Only tasks
 * with something outstanding appear.
 *
 * 'once' tasks are left out: one already stays on every day's list until it is
 * answered (see getDay), so carrying it as well would show the same task twice.
 */
export async function carriedDueDays(
  tasks: TaskDocument[],
  goalById: Map<string, GoalDocument>,
): Promise<Map<string, CarriedDays>> {
  const now = today()
  const yesterday = addDays(now, -1)
  const carried = new Map<string, CarriedDays>()

  // A limit task is never owed an answer - its readings decide (lib/limits.ts).
  const candidates = tasks.filter(
    (task) => task.dayResolution === 'carry' && task.frequency.type !== 'once' && !task.limit,
  )
  if (candidates.length === 0) return carried

  const [answered, vacation] = await Promise.all([
    answeredDays(
      candidates.map((task) => task._id),
      yesterday,
    ),
    loadVacationDays(),
  ])

  for (const task of candidates) {
    const goal = goalById.get(String(task.goalId))
    if (!goal) continue
    const window = taskWindow(task, goal, yesterday)
    if (!window) continue

    const from = unresolvedFrom(task, window)
    if (from > window.end) continue

    const days = outstandingDays(
      task,
      { start: from, end: window.end },
      answered.get(String(task._id)) ?? new Set(),
      pausedBy(task, goal, vacation),
    )
    if (days.length === 0) continue

    carried.set(String(task._id), {
      dueDate: days[0],
      daysLate: dayDiff(days[0], now),
      stacked: days.length,
    })
  }

  return carried
}

/** The stretch of days a task still owes the resolver an answer for. */
interface PendingWork {
  from: string
  to: string
  /** Where autoResolvedThrough lands once this task has been dealt with. */
  watermark: string
}

function pendingWork(
  task: TaskDocument,
  goal: GoalDocument,
  now: string,
  yesterday: string,
): PendingWork | null {
  const dueDay = goal.targetDate ? toDayKey(goal.targetDate) : null

  // A carry-over task keeps carrying until its goal's due date has actually
  // passed - the due day itself is still a day you can do the work on. Without
  // a due date there is no deadline at all, so it stacks indefinitely.
  if (task.dayResolution === 'carry' && !(dueDay && dueDay < now)) return null

  if (task.frequency.type === 'once') {
    // A once task is not date-keyed: its single opportunity runs out when the
    // goal's due date passes, whichever resolution it carries.
    if (!dueDay || dueDay >= now) return null
    return { from: dueDay, to: dueDay, watermark: dueDay }
  }

  const window = taskWindow(task, goal, yesterday)
  if (!window) return null

  const from = unresolvedFrom(task, window)
  if (from > window.end) return null

  return { from, to: window.end, watermark: window.end }
}

/**
 * Resolves every day that has run out of road: a 'fail' task's past days, and a
 * 'carry' task's outstanding ones once its goal's due date has gone by.
 *
 * Idempotent, and safe to call on a read. There is no scheduler in this app, so
 * this runs from the two tracker reads instead (see tracker.controller.ts) -
 * in the steady state the candidate query matches nothing and it costs one
 * empty find. It writes with $setOnInsert, so a day answered by hand between
 * the read and the write is never overwritten, and a retry after a half-done
 * run cannot fail on the (taskId, date) unique index.
 *
 * `goals` is the caller's already-loaded list, since both callers have one.
 */
export async function sweepAutoResolutions(goals: GoalDocument[]): Promise<void> {
  const now = today()
  const yesterday = addDays(now, -1)

  const candidates = await TaskModel.find({
    archived: false,
    dayResolution: { $ne: 'open' },
    // Limit tasks are judged from their readings instead (lib/limits.ts).
    limit: null,
    $or: [{ autoResolvedThrough: null }, { autoResolvedThrough: { $lt: yesterday } }],
  })
  if (candidates.length === 0) return

  const goalById = new Map(goals.map((goal) => [String(goal._id), goal]))

  const pending: { task: TaskDocument; goal: GoalDocument; work: PendingWork }[] = []
  for (const task of candidates) {
    const goal = goalById.get(String(task.goalId))
    if (!goal) continue
    const work = pendingWork(task, goal, now, yesterday)
    if (work) pending.push({ task, goal, work })
  }
  if (pending.length === 0) return

  // Unbounded by date on purpose: a once task's answer can sit on any day, and
  // this is only ever the handful of tasks that have pending work.
  const [answered, vacation] = await Promise.all([
    answeredDays(pending.map(({ task }) => task._id)),
    loadVacationDays(),
  ])

  const timestamp = new Date()
  const inserts = []
  const watermarks = []

  for (const { task, goal, work } of pending) {
    const days = answered.get(String(task._id)) ?? new Set<string>()
    const outstanding =
      task.frequency.type === 'once'
        ? days.size === 0
          ? [work.to]
          : []
        : outstandingDays(
            task,
            { start: work.from, end: work.to },
            days,
            pausedBy(task, goal, vacation),
          )

    // Only the deadline case gets a note - it is the one where the chance was
    // taken away rather than simply never answered.
    const note = task.dayResolution === 'carry' ? AUTO_FAIL_NOTE : ''

    for (const date of outstanding) {
      inserts.push({
        updateOne: {
          filter: { taskId: task._id, date },
          update: {
            $setOnInsert: {
              taskId: task._id,
              date,
              status: 'failed' as const,
              note,
              auto: true,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          },
          upsert: true,
        },
      })
    }

    // Advanced even when nothing was written: the point of the watermark is
    // that these days have been dealt with, whether or not that meant a row.
    watermarks.push({
      updateOne: {
        filter: { _id: task._id },
        update: { $set: { autoResolvedThrough: work.watermark } },
      },
    })
  }

  // Completions first: interrupted halfway, the watermark simply has not moved
  // and the next sweep repeats the same upserts harmlessly.
  //
  // `timestamps: false` on both, for different reasons. On the completions,
  // Mongoose's own updatedAt would land in $set beside the one below in
  // $setOnInsert, and Mongo rejects the same path in two operators. On the
  // tasks, moving a watermark isn't an edit to the task and shouldn't read
  // like one.
  if (inserts.length > 0) {
    await CompletionModel.bulkWrite(inserts, { ordered: false, timestamps: false })
  }
  await TaskModel.bulkWrite(watermarks, { ordered: false, timestamps: false })
}
