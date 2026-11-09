import type { Request, Response } from 'express'
import { Types } from 'mongoose'
import { z } from 'zod'
import { GoalModel, type GoalDocument } from '../models/goal.model'
import {
  TaskModel,
  type TaskDocument,
  type TaskLimitDirection,
  type TaskLimitMeasure,
  type TaskLimitPeriod,
} from '../models/task.model'
import { CompletionModel, completionStatuses } from '../models/completion.model'
import { GoalResolutionModel } from '../models/goalResolution.model'
import { MeasurementModel } from '../models/measurement.model'
import { TrackingUnitModel, type UnitAggregation } from '../models/trackingUnit.model'
import { HttpError } from '../middleware/errorHandler'
import { DAY_PATTERN, addDays, dayDiff, daysBetween, toDayKey, today } from '../lib/date'
import { isDayKeyed, isScheduledOn } from '../lib/schedule'
import {
  carriedDueDays,
  sweepAutoResolutions,
  taskStartDay,
  type CarriedDays,
} from '../lib/dayResolution'
import { dailyValues, syncLimitVerdicts, usageOn, weekStart } from '../lib/limits'
import { loadVacationDays, pausedBy, pausesOnVacation, type VacationDays } from '../lib/vacation'
import { requireObjectId } from './goal.controller'
import { roundToDecimals } from './measurement.controller'

/** An explicitly requested window wider than this isn't a real use case and
 *  just risks a slow query, so it's rejected outright. */
const MAX_RANGE_DAYS = 366
/** The derived full span has no user-typed range to sanity-check, so it gets
 *  its own, looser ceiling - enough for any real history, short of a runaway
 *  from one mistyped date. Clamped rather than rejected: an outlier shouldn't
 *  make the whole screen fail, it should fall off the left edge of it. */
const MAX_SPAN_DAYS = 1830
/** Padding either side of today when there's nothing else to go on. */
const DEFAULT_PAST_DAYS = 14
const DEFAULT_FUTURE_DAYS = 14

const rangeQuerySchema = z.object({
  from: z.string().regex(DAY_PATTERN, 'from must be formatted as YYYY-MM-DD').optional(),
  to: z.string().regex(DAY_PATTERN, 'to must be formatted as YYYY-MM-DD').optional(),
})

const dayQuerySchema = z.object({
  date: z.string().regex(DAY_PATTERN, 'date must be formatted as YYYY-MM-DD').optional(),
})

const measurementInputSchema = z.object({
  unitId: z.string().min(1),
  value: z.number().finite(),
  note: z.string().trim().max(500).optional(),
})

const setCompletionSchema = z.object({
  status: z.enum(completionStatuses),
  note: z.string().trim().max(2000).optional(),
  /**
   * Omitted  -> this day's readings are left exactly as they are.
   * []       -> this day's task-borne readings are deleted (the sheet's "Skip").
   * [ ... ]  -> replaces them: any attached unit not listed is deleted.
   *
   * Applies to a failed day as much as a done one - only clearing the day
   * outright (see clearCompletion) removes readings on its own.
   *
   * The three cases are distinct on purpose. The timeline ticks days without
   * ever sending the key, so backfilling a month in the grid can't wipe a
   * weight that was typed on the day screen.
   *
   * Mirrored by `nextMeasurements` in src/hooks/useDay.ts, which reproduces
   * this rule for the optimistic update - keep the two in sync by hand.
   */
  measurements: z.array(measurementInputSchema).max(6).optional(),
})

const dayParamSchema = z
  .string()
  .regex(DAY_PATTERN, 'date must be formatted as YYYY-MM-DD')

/** What happened on one day: the status, plus the reason if it failed. */
interface DayEntry {
  status: (typeof completionStatuses)[number]
  note: string
  /** Resolved by the day resolver rather than answered by hand. */
  auto: boolean
}

/** A unit a task asks for when it's ticked, inlined the way goalTitle is. */
interface DayTaskUnit {
  id: string
  name: string
  symbol: string
  decimals: number
  /** 'latest' shows one editable reading (weight); 'sum' accumulates several. */
  aggregation: UnitAggregation
}

/** A limit task's running figure for the period a day falls in - Today's budget bar. */
interface DayTaskLimit {
  unit: DayTaskUnit
  direction: TaskLimitDirection
  target: number
  period: TaskLimitPeriod
  measure: TaskLimitMeasure
  /** The second unit a daily limit wants logged, and whether this day has it. */
  alsoLogged: { unit: DayTaskUnit; logged: boolean } | null
  since: string
  /**
   * Total so far in the period: the day, or Monday through the day's week. For
   * an average, the mean of the days logged so far that week.
   */
  used: number
  /** Anything logged in the period at all, a 0 included. */
  hasData: boolean
  /** The period is over, so the figure won't move again. */
  final: boolean
}

/** One reading against an attached unit, for the day's own readings list -
 *  hand-entered and task-borne alike, so a 'sum' unit's field can show every
 *  number behind its total instead of just this task's own row. */
interface DayUnitReading {
  id: string
  value: number
  note: string
  taskId: string | null
  taskTitle: string | null
}

/** The window a caller asked for by hand, with the defaults filled in. */
function explicitRange(parsed: { from?: string; to?: string }): { from: string; to: string } {
  const center = today()
  const to =
    parsed.to ??
    (parsed.from
      ? addDays(parsed.from, DEFAULT_PAST_DAYS + DEFAULT_FUTURE_DAYS)
      : addDays(center, DEFAULT_FUTURE_DAYS))
  const from =
    parsed.from ??
    (parsed.to
      ? addDays(parsed.to, -(DEFAULT_PAST_DAYS + DEFAULT_FUTURE_DAYS))
      : addDays(center, -DEFAULT_PAST_DAYS))

  if (from > to) throw new HttpError(400, '`from` must not be after `to`')
  if (daysBetween(from, to).length > MAX_RANGE_DAYS) {
    throw new HttpError(400, `range too large - max ${MAX_RANGE_DAYS} days`)
  }

  return { from, to }
}

/**
 * The whole span the data actually occupies: from the earliest thing that
 * exists - a goal's start, a goal's creation, the oldest day ever answered -
 * out to the latest due date, plus a fortnight of runway past today so there's
 * always somewhere to pan to.
 *
 * This is what a caller gets when it asks for no range at all, which is what
 * the overview does. The timeline's own date window is a *view* control, not a
 * fetch control: everything is loaded, and panning never runs into a wall of
 * blank days that turn out to have data behind them.
 */
async function fullSpan(goals: GoalDocument[]): Promise<{ from: string; to: string }> {
  const center = today()
  let from: string | null = null
  let to = addDays(center, DEFAULT_FUTURE_DAYS)

  for (const goal of goals) {
    const start = toDayKey(goal.startDate ?? goal.createdAt)
    if (!from || start < from) from = start
    if (goal.targetDate) {
      const due = toDayKey(goal.targetDate)
      if (due > to) to = due
    }
  }

  // A day could in principle have been answered before any goal that still
  // exists began, so the oldest completion gets a say in where the span opens.
  const oldest = await CompletionModel.findOne().sort({ date: 1 }).select('date')
  if (oldest && (!from || oldest.date < from)) from = oldest.date

  if (!from || from > to) from = addDays(to, -(DEFAULT_PAST_DAYS + DEFAULT_FUTURE_DAYS))
  if (daysBetween(from, to).length > MAX_SPAN_DAYS) from = addDays(to, -(MAX_SPAN_DAYS - 1))

  return { from, to }
}

/**
 * The whole grid in one request: goals -> their tasks -> a {day: entry} map.
 *
 * With no `from`/`to` it returns everything there is (see fullSpan) - the
 * client is expected to ask for exactly that and then choose its own view
 * window locally. `from`/`to` are still honoured for a narrower slice.
 *
 * No goal status is excluded here, archived and resolved alike - a screen
 * that wants to hide either does it with the sidebar's goal-status filter,
 * the same way it already hides categories and task statuses, rather than
 * needing a second request for what a filter toggle reveals.
 */
export async function getTracker(req: Request, res: Response): Promise<void> {
  const parsed = rangeQuerySchema.parse(req.query)

  const goals = await GoalModel.find().sort({ order: 1, createdAt: 1 })

  // There is no scheduler in this app, so the two tracker reads are what drive
  // the day resolver - see sweepAutoResolutions. With nothing to resolve it
  // costs a single query that matches no tasks.
  await sweepAutoResolutions(goals)
  await syncLimitVerdicts(goals)

  const tasks = await TaskModel.find({ archived: false }).sort({ order: 1, createdAt: 1 })

  const { from, to } =
    parsed.from || parsed.to ? explicitRange(parsed) : await fullSpan(goals)

  const days = daysBetween(from, to)

  // ISO day strings sort lexicographically, so a plain string range works here.
  const [completions, resolutions, vacation] = await Promise.all([
    CompletionModel.find({
      taskId: { $in: tasks.map((task) => task._id) },
      date: { $gte: from, $lte: to },
    }).select('taskId date status note auto'),
    GoalResolutionModel.find({ goalId: { $in: goals.map((goal) => goal._id) } }),
    loadVacationDays(),
  ])
  const vacationDays = vacation.within(from, to)

  const entriesByTask = new Map<string, Record<string, DayEntry>>()
  for (const completion of completions) {
    const taskId = String(completion.taskId)
    const record = entriesByTask.get(taskId) ?? {}
    record[completion.date] = {
      status: completion.status,
      note: completion.note,
      auto: completion.auto,
    }
    entriesByTask.set(taskId, record)
  }

  const resolutionByGoal = new Map(
    resolutions.map((resolution) => [String(resolution.goalId), resolution.toJSON()]),
  )

  const tasksByGoal = new Map<string, typeof tasks>()
  for (const task of tasks) {
    const goalId = String(task.goalId)
    tasksByGoal.set(goalId, [...(tasksByGoal.get(goalId) ?? []), task])
  }

  res.json({
    from,
    to,
    days,
    goals: goals.map((goal) => ({
      ...goal.toJSON(),
      resolution: resolutionByGoal.get(String(goal._id)) ?? null,
      tasks: (tasksByGoal.get(String(goal._id)) ?? []).map((task) => ({
        ...task.toJSON(),
        // Only answered days appear; a missing day is still unanswered.
        completions: entriesByTask.get(String(task._id)) ?? {},
        // The days in this window the task is paused for vacation, decided
        // here so every client view agrees (see lib/vacation.ts).
        pausedDays: pausesOnVacation(task, goal, vacation) ? vacationDays : [],
      })),
    })),
  })
}

/**
 * One day's worth of work as a flat list - what the mobile "Today" screen shows.
 * Tasks that haven't opened yet are left out: ones created after the day in
 * question, and ones whose goal doesn't start until later. Both turn up under
 * `upcoming` instead, previewed by the first day they're actually due.
 *
 * Each row carries its goal's categories and status, so the day screen can
 * filter by category or goal status - including hiding an archived goal's
 * tasks, which aren't excluded here - without a second request to find out
 * which goal is which.
 */
export async function getDay(req: Request, res: Response): Promise<void> {
  const { date = today() } = dayQuerySchema.parse(req.query)

  const goals = await GoalModel.find().sort({ order: 1, createdAt: 1 })
  const goalById = new Map(goals.map((goal) => [String(goal._id), goal]))

  // See getTracker: the reads are what drive the resolver, for want of a scheduler.
  await sweepAutoResolutions(goals)
  await syncLimitVerdicts(goals)

  const tasks = await TaskModel.find({
    archived: false,
    goalId: { $in: goals.map((goal) => goal._id) },
  }).sort({ order: 1, createdAt: 1 })

  // The day a task opens for business: its own creation, or its goal's start
  // if that is later. A frequency says which days *within* that window count,
  // never when the window opens - so a Tuesday task on a goal starting next
  // Monday is not a task for today, it's a preview (see `upcoming` below).
  const startDayByTask = new Map<string, string>()
  for (const task of tasks) {
    const goal = goalById.get(String(task.goalId))
    if (goal) startDayByTask.set(String(task._id), taskStartDay(task, goal))
  }

  const started = tasks.filter((task) => {
    const start = startDayByTask.get(String(task._id))
    return start !== undefined && start <= date
  })
  const notStarted = tasks.filter((task) => {
    const start = startDayByTask.get(String(task._id))
    return start !== undefined && start > date
  })

  const onceTaskIds = started
    .filter((task) => task.frequency.type === 'once')
    .map((task) => task._id)

  // Every unit any visible task asks for, in one query rather than per task.
  const attachedUnitIds = [
    ...new Set(started.flatMap((task) => task.unitIds.map(String))),
  ]
  const limitUnitIds = [
    ...new Set(
      started.flatMap((task) => {
        if (!task.limit) return []
        const { unitId, alsoLoggedUnitId } = task.limit
        return alsoLoggedUnitId ? [String(unitId), String(alsoLoggedUnitId)] : [String(unitId)]
      }),
    ),
  ]
  const shownUnitIds = [...new Set([...attachedUnitIds, ...limitUnitIds])]

  const [completions, onceCompletions, units, measurements, vacation] = await Promise.all([
    CompletionModel.find({
      taskId: { $in: started.map((task) => task._id) },
      date,
    }).select('taskId status note auto'),
    // Unbounded by date: a 'once' task has at most one live completion (see
    // setCompletion), so this tells us whether - and where - it's already resolved.
    CompletionModel.find({ taskId: { $in: onceTaskIds } }).select('taskId date status note auto'),
    shownUnitIds.length
      ? TrackingUnitModel.find({ _id: { $in: shownUnitIds } }).select(
          'name symbol decimals aggregation',
        )
      : [],
    // Every reading against an attached unit on this date, not just this
    // task's own - a 'sum' unit's total has to include what was typed by hand
    // on the tracking page, or captured by ticking a different task.
    attachedUnitIds.length
      ? MeasurementModel.find({ unitId: { $in: attachedUnitIds }, date })
          .select('taskId unitId value note')
          // Oldest first, so a 'latest' unit's chip can take the last reading.
          .sort({ measuredAt: 1 })
      : [],
    loadVacationDays(),
  ])

  // Paused rows stay on the list and stay tickable - a habit kept up on holiday
  // still counts - they just stop being owed.
  const isPausedToday = (task: TaskDocument): boolean => {
    const goal = goalById.get(String(task.goalId))
    return goal !== undefined && vacation.has(date) && pausesOnVacation(task, goal, vacation)
  }

  const unitById = new Map<string, DayTaskUnit>(
    units.map((unit) => [
      String(unit._id),
      {
        id: String(unit._id),
        name: unit.name,
        symbol: unit.symbol,
        decimals: unit.decimals,
        aggregation: unit.aggregation,
      },
    ]),
  )

  // A reading's taskId can point past `started` - an archived task's old rows
  // aren't deleted, only its own listing here is filtered out - so any title
  // missing from that list is looked up the same way listMeasurements does.
  const titleByTask = new Map(started.map((task) => [String(task._id), task.title]))
  const untitledTaskIds = [
    ...new Set(
      measurements
        .filter((m) => m.taskId && !titleByTask.has(String(m.taskId)))
        .map((m) => String(m.taskId)),
    ),
  ]
  if (untitledTaskIds.length) {
    const extra = await TaskModel.find({ _id: { $in: untitledTaskIds } }).select('title')
    for (const task of extra) titleByTask.set(String(task._id), task.title)
  }

  // Keyed by task, then by unit - what the log sheet prefills from and what a
  // 'latest' unit's chip renders.
  const measurementsByTask = new Map<string, Record<string, { value: number; note: string }>>()
  // Keyed by unit - every reading recorded against it today, so a 'sum' unit's
  // chip and log sheet can show the whole total, not just one task's slice of it.
  const readingsByUnit = new Map<string, DayUnitReading[]>()
  for (const measurement of measurements) {
    const unitId = String(measurement.unitId)
    readingsByUnit.set(unitId, [
      ...(readingsByUnit.get(unitId) ?? []),
      {
        id: String(measurement._id),
        value: measurement.value,
        note: measurement.note,
        taskId: measurement.taskId ? String(measurement.taskId) : null,
        taskTitle: measurement.taskId ? (titleByTask.get(String(measurement.taskId)) ?? null) : null,
      },
    ])

    if (!measurement.taskId) continue
    const key = String(measurement.taskId)
    const record = measurementsByTask.get(key) ?? {}
    record[unitId] = { value: measurement.value, note: measurement.note }
    measurementsByTask.set(key, record)
  }

  const entryByTask = new Map(
    completions.map((completion) => [
      String(completion.taskId),
      { status: completion.status, note: completion.note, auto: completion.auto },
    ]),
  )
  const onceHistoryByTask = new Map(
    onceCompletions.map((completion) => [String(completion.taskId), completion]),
  )

  const unitsOf = (task: TaskDocument): DayTaskUnit[] =>
    task.unitIds
      .map((unitId) => unitById.get(String(unitId)))
      .filter((unit): unit is DayTaskUnit => unit !== undefined)

  // What each limit task's period has used so far, for Today's budget bar. The
  // verdict itself is already stored (syncLimitVerdicts); this is the running
  // figure behind it, so the bar moves before any verdict exists.
  const now = today()
  const limitByTask = new Map<string, DayTaskLimit>()
  await Promise.all(
    started.map(async (task) => {
      const limit = task.limit
      // Days before the limit took effect were ticked by hand, and still are.
      if (!limit || date < limit.since) return
      const unit = unitById.get(String(limit.unitId))
      if (!unit) return
      const from = limit.period === 'day' ? date : weekStart(date)
      const to = limit.period === 'day' ? date : addDays(from, 6)
      const values = await dailyValues(limit.unitId, unit.aggregation, from, to)
      const usage = usageOn(limit, date, values, now, unit.decimals)
      const alsoUnit = limit.alsoLoggedUnitId ? unitById.get(String(limit.alsoLoggedUnitId)) : undefined
      const alsoValues =
        limit.alsoLoggedUnitId && alsoUnit
          ? await dailyValues(limit.alsoLoggedUnitId, alsoUnit.aggregation, date, date)
          : null
      limitByTask.set(String(task._id), {
        unit,
        direction: limit.direction,
        target: limit.target,
        period: limit.period,
        measure: limit.measure,
        alsoLogged: alsoUnit && alsoValues ? { unit: alsoUnit, logged: alsoValues.has(date) } : null,
        since: limit.since,
        used: usage.used,
        hasData: usage.hasData,
        final: usage.final,
      })
    }),
  )

  const visible = started.filter((task) => {
    if (isDayKeyed(task.frequency)) {
      return isScheduledOn(task.frequency, date)
    }
    if (task.frequency.type === 'once') {
      const history = onceHistoryByTask.get(String(task._id))
      return !history || history.date === date
    }
    return true // daily
  })

  // Two kinds of preview, both answering "when does this next come round":
  //
  //  - a started day-keyed task simply isn't due today. Daily is always due and
  //    a started 'once' has no date of its own, so neither belongs here.
  //  - a task that hasn't started yet, whatever its frequency: a daily task on
  //    a goal beginning next Monday is as much an upcoming row as a weekly one,
  //    and its first occurrence is found from that start rather than tomorrow.
  const previews = [
    ...started
      .filter((task) => isDayKeyed(task.frequency) && !isScheduledOn(task.frequency, date))
      .map((task) => ({ task, notBefore: undefined as string | undefined })),
    ...notStarted.map((task) => ({
      task,
      notBefore: startDayByTask.get(String(task._id)),
    })),
  ]

  const upcoming = previews
    .map(({ task, notBefore }) => {
      const goal = goalById.get(String(task.goalId))
      const occurrence = nextOccurrence(
        task.frequency,
        date,
        notBefore,
        goal ? pausedBy(task, goal, vacation) : undefined,
      )
      if (!occurrence) return null
      return {
        id: String(task._id),
        title: task.title,
        goalId: String(task.goalId),
        goalTitle: goal?.title ?? '',
        goalStatus: goal?.status ?? 'active',
        categories: goal?.categories ?? [],
        frequency: task.frequency,
        dueDate: occurrence.dueDate,
        daysUntil: occurrence.daysUntil,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => a.daysUntil - b.daysUntil)

  // What a carry-over task has stacked up behind it, one row per task: the
  // oldest day it still owes an answer for, and how many are queued behind it.
  //
  // Only ever computed for today. Carried debt is a Today concept - looking
  // back at the 2nd should show the 2nd as it actually was, not what has since
  // piled up on top of it.
  const carried =
    date === today() ? await carriedDueDays(tasks, goalById) : new Map<string, CarriedDays>()

  const due = started
    .filter((task) => carried.has(String(task._id)))
    .map((task) => {
      const goal = goalById.get(String(task.goalId))
      const days = carried.get(String(task._id)) as CarriedDays
      return {
        id: String(task._id),
        title: task.title,
        goalId: String(task.goalId),
        goalTitle: goal?.title ?? '',
        goalStatus: goal?.status ?? 'active',
        categories: goal?.categories ?? [],
        frequency: task.frequency,
        // Carried rows are answered on their own date, where nothing has been
        // recorded yet by definition - so units are offered but nothing
        // prefills them, and today's unitReadings don't apply to them either.
        units: unitsOf(task),
        ...days,
      }
    })
    // Oldest debt first; a stable sort leaves same-day rows in task order.
    .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0))

  res.json({
    date,
    tasks: visible.map((task) => {
      const goal = goalById.get(String(task.goalId))
      const entry = entryByTask.get(String(task._id))
      return {
        id: String(task._id),
        title: task.title,
        goalId: String(task.goalId),
        goalTitle: goal?.title ?? '',
        goalStatus: goal?.status ?? 'active',
        categories: goal?.categories ?? [],
        frequency: task.frequency,
        dayResolution: task.dayResolution,
        status: entry?.status ?? null,
        note: entry?.note ?? '',
        paused: isPausedToday(task),
        // A once task's chance runs out on its goal's due date (see
        // pendingWork in lib/dayResolution.ts) - the countdown Today shows.
        // A recurring task has no single day to count down to.
        deadline:
          task.frequency.type === 'once' && goal?.targetDate ? toDayKey(goal.targetDate) : null,
        limit: limitByTask.get(String(task._id)) ?? null,
        // Two fields, not one: a unit that's attached but unanswered has to be
        // askable without being confused for a recorded zero.
        units: unitsOf(task),
        measurements: measurementsByTask.get(String(task._id)) ?? {},
      }
    }),
    due,
    upcoming,
    // Keyed by unit id - every reading recorded against it today, for a 'sum'
    // unit's chip and log sheet to total up and list, whatever recorded them.
    unitReadings: Object.fromEntries(readingsByUnit),
  })
}

/**
 * First day after `date` a frequency is next due, never earlier than
 * `notBefore` - which is how a task whose goal starts later gets previewed by
 * its first real occurrence rather than by one inside the closed window.
 *
 * 31 days from wherever the search opens is enough to guarantee a hit for
 * weekly or monthly (the longest possible gap between two arbitrary
 * days-of-month is bounded by the longest month); daily and 'once' match the
 * opening day itself.
 *
 * 'everyNDays' is solved rather than searched. No scan bound would be sound for
 * it: its anchor is frozen at save time but the goal's startDate stays editable,
 * so rewinding a goal can leave the search opening an arbitrary number of days
 * before the next occurrence - and a scan that misses returns null, which drops
 * the row from the preview list with nothing to show for it.
 *
 * `paused` skips vacation days, so a habit isn't previewed for a day it won't
 * be owed on. A vacation can push the next hit past 31 days, so the scan then
 * runs to a year instead.
 */
function nextOccurrence(
  frequency: TaskDocument['frequency'],
  date: string,
  notBefore?: string,
  paused?: Pick<VacationDays, 'has'>,
): { dueDate: string; daysUntil: number } | null {
  const tomorrow = addDays(date, 1)
  const from = notBefore && notBefore > tomorrow ? notBefore : tomorrow
  const until = (candidate: string) => ({ dueDate: candidate, daysUntil: dayDiff(date, candidate) })

  if (frequency.type === 'everyNDays') {
    const { anchorDate, intervalDays } = frequency
    let candidate =
      from <= anchorDate
        ? anchorDate
        : addDays(anchorDate, Math.ceil(dayDiff(anchorDate, from) / intervalDays) * intervalDays)
    for (let hops = 0; paused?.has(candidate) && hops < 366; hops++) {
      candidate = addDays(candidate, intervalDays)
    }
    return until(candidate)
  }

  const horizon = paused ? 366 : 31
  for (let offset = 0; offset <= horizon; offset++) {
    const candidate = addDays(from, offset)
    if (paused?.has(candidate)) continue
    if (isScheduledOn(frequency, candidate)) return until(candidate)
  }
  return null
}

/**
 * The task, if this day may be written to at all: it has to exist, and the day
 * can't be one that hasn't happened yet.
 */
async function requireAnswerableDay(taskId: string, date: string): Promise<TaskDocument> {
  const task = await TaskModel.findById(taskId).select('frequency unitIds limit')
  if (!task) throw new HttpError(404, 'Task not found')
  if (date > today()) throw new HttpError(400, 'Cannot record a day in the future')
  // A limit judges its own days from the unit's readings; a hand answer would
  // just be overwritten on the next read (see lib/limits.ts).
  if (task.limit && date >= task.limit.since) {
    throw new HttpError(409, 'This task is judged from its readings - log them on the tracking page')
  }
  return task
}

/**
 * The same, plus the day actually being one this task recurs on.
 *
 * Only for *writing* an answer. Clearing one deliberately skips this check: a
 * task whose frequency has since changed can be left holding completions on
 * days it no longer recurs on, and those are invisible in the grid and counted
 * nowhere - so refusing to delete them would make them permanent.
 */
async function requireTickableDay(taskId: string, date: string): Promise<TaskDocument> {
  const task = await requireAnswerableDay(taskId, date)
  if (isDayKeyed(task.frequency) && !isScheduledOn(task.frequency, date)) {
    throw new HttpError(400, 'Not a scheduled day for this task')
  }
  return task
}

/**
 * Makes this task's readings for one day match `entries` exactly: anything it
 * used to record and no longer does is removed, so an emptied box in the sheet
 * clears its value.
 *
 * Only rows carrying this task's id are touched. A reading typed by hand on the
 * tracking page for the same unit and day has no taskId and isn't the task's to
 * delete.
 */
async function syncTaskMeasurements(
  task: TaskDocument,
  date: string,
  entries: { unitId: string; value: number; note?: string }[],
): Promise<void> {
  const attached = new Set(task.unitIds.map(String))
  for (const entry of entries) {
    if (!attached.has(entry.unitId)) {
      throw new HttpError(400, 'That unit is not attached to this task')
    }
  }

  const units = await TrackingUnitModel.find({
    _id: { $in: entries.map((entry) => entry.unitId) },
  }).select('decimals')
  const decimalsById = new Map(units.map((unit) => [String(unit._id), unit.decimals]))

  const keep = entries.map((entry) => entry.unitId)

  // One round trip: the removals and the upserts can't half-apply relative to
  // each other, which matters because there are no transactions here.
  await MeasurementModel.bulkWrite([
    {
      deleteMany: {
        filter: { taskId: task._id, date, ...(keep.length ? { unitId: { $nin: keep } } : {}) },
      },
    },
    // $setOnInsert writes the document as stored, so the ids have to be real
    // ObjectIds here - unlike a filter, nothing casts them on the way in.
    ...entries.map((entry) => ({
      updateOne: {
        filter: { taskId: task._id, unitId: new Types.ObjectId(entry.unitId), date },
        update: {
          $set: {
            value: roundToDecimals(entry.value, decimalsById.get(entry.unitId) ?? 1),
            note: entry.note ?? '',
            measuredAt: new Date(),
          },
          $setOnInsert: {
            taskId: task._id,
            unitId: new Types.ObjectId(entry.unitId),
            date,
          },
        },
        upsert: true,
      },
    })),
  ])
}

/**
 * Upsert one (task, day) record: done, or failed with a reason.
 * A `note` only makes sense on a failure, so it's dropped on a success.
 *
 * A task carrying tracking units also records its readings here rather than in
 * a second request: the 'once' day-move below has to take them with it, and one
 * call means the day and its numbers can't half-land. The completion is written
 * first, so the only reachable partial state is a ticked day whose reading
 * didn't save - not a stored reading on a day that was never ticked.
 */
export async function setCompletion(req: Request, res: Response): Promise<void> {
  const taskId = requireObjectId(req.params.id, 'task id')
  const date = dayParamSchema.parse(req.params.date)
  const { status, note, measurements } = setCompletionSchema.parse(req.body)

  const task = await requireTickableDay(taskId, date)

  // A 'once' task has at most one live completion - marking a new day moves
  // it rather than leaving a stale row behind on the old one.
  if (task.frequency.type === 'once') {
    await CompletionModel.deleteMany({ taskId, date: { $ne: date } })
    // The completion moved day; its readings move with it rather than being
    // stranded on a day the task is no longer recorded on.
    await MeasurementModel.deleteMany({ taskId, date: { $ne: date } })
  }

  // `auto: false` on every hand-made answer: answering a day takes ownership of
  // it, which is how an automatic fail gets overridden.
  const completion = await CompletionModel.findOneAndUpdate(
    { taskId, date },
    { $set: { status, note: status === 'failed' ? (note ?? '') : '', auto: false } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  )

  // Failing a day doesn't erase its numbers: missing a review and logging
  // your hours anyway is an ordinary Tuesday. The fail sheet asks for the same
  // values the log sheet does, so both statuses follow the same rule.
  if (measurements) await syncTaskMeasurements(task, date, measurements)

  res.json(completion)
}

/** Put a day back to unanswered by removing its record entirely. */
export async function clearCompletion(req: Request, res: Response): Promise<void> {
  const taskId = requireObjectId(req.params.id, 'task id')
  const date = dayParamSchema.parse(req.params.date)

  await requireAnswerableDay(taskId, date)
  await CompletionModel.deleteOne({ taskId, date })
  // The day is unanswered again, so the reading the tick captured goes with it.
  // Only this task's own rows - anything typed by hand on the tracking page for
  // the same unit and day stays.
  await MeasurementModel.deleteMany({ taskId, date })

  res.status(204).send()
}
