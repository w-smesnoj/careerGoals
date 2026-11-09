import type { Request, Response } from 'express'
import { z } from 'zod'
import { Types } from 'mongoose'
import {
  TaskModel,
  taskDayResolutions,
  taskLimitDirections,
  taskLimitMeasures,
  taskLimitPeriods,
} from '../models/task.model'
import { GoalModel } from '../models/goal.model'
import { CompletionModel } from '../models/completion.model'
import { TaskNoteModel } from '../models/taskNote.model'
import { MeasurementModel } from '../models/measurement.model'
import { TrackingUnitModel } from '../models/trackingUnit.model'
import { HttpError } from '../middleware/errorHandler'
import { requireObjectId } from './goal.controller'
import { addDays, today, toDayKey, weekdayOf } from '../lib/date'
import { taskStartDay } from '../lib/dayResolution'

const frequencySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('once') }),
  z.object({ type: z.literal('daily') }),
  z.object({
    type: z.literal('weekly'),
    daysOfWeek: z
      .array(z.number().int().min(0).max(6))
      .min(1)
      .refine((a) => new Set(a).size === a.length, 'daysOfWeek must be unique'),
  }),
  z.object({
    type: z.literal('monthly'),
    daysOfMonth: z
      .array(z.number().int().min(1).max(31))
      .min(1)
      .refine((a) => new Set(a).size === a.length, 'daysOfMonth must be unique'),
  }),
  // No anchorDate here on purpose: it's derived, never sent. Zod strips unknown
  // keys, so a client that posts one has it quietly ignored rather than getting
  // to choose where someone else's cadence falls.
  z.object({
    type: z.literal('everyNDays'),
    intervalDays: z.number().int().min(2).max(365),
    startWeekday: z.number().int().min(0).max(6),
  }),
])

/** A frequency as it arrives over the wire: the stored shape minus `anchorDate`. */
type TaskFrequencyInput = z.infer<typeof frequencySchema>

/**
 * Tracking units this task asks for when it's ticked. Capped because the log
 * sheet has to stay a sheet - six number fields plus a phone keyboard is
 * already the limit of what fits.
 */
const unitIdsSchema = z
  .array(z.string().min(1))
  .max(6, 'A task can track at most 6 units')
  .transform((ids) => [...new Set(ids)])

const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(140),
  goalId: z.string().min(1, 'A task must belong to a goal'),
  archived: z.boolean().optional(),
  frequency: frequencySchema.default({ type: 'daily' }),
  unitIds: unitIdsSchema.optional(),
  dayResolution: z.enum(taskDayResolutions).default('open'),
  /**
   * Backdates a `once` task to a day already gone by, so something done then
   * can be logged in one step (the think tank's "Already done"). Without it
   * the task would start today, and its completion on that earlier day would
   * sit before the task existed - shown as upcoming rather than done.
   */
  startDay: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'startDay must be YYYY-MM-DD')
    .optional(),
})

/** A limit as it arrives: `since` is the server's to set, see updateTask. */
const limitSchema = z.object({
  unitId: z.string().min(1),
  direction: z.enum(taskLimitDirections).default('atMost'),
  target: z.number().min(0).max(1_000_000),
  period: z.enum(taskLimitPeriods),
  measure: z.enum(taskLimitMeasures).default('total'),
  alsoLoggedUnitId: z.string().min(1).nullable().default(null),
  /** Judge every day since the task started, replacing their old answers. */
  fromStart: z.boolean().optional(),
})

const updateTaskSchema = z.object({
  title: z.string().trim().min(1).max(140).optional(),
  goalId: z.string().min(1).optional(),
  archived: z.boolean().optional(),
  frequency: frequencySchema.optional(),
  unitIds: unitIdsSchema.optional(),
  dayResolution: z.enum(taskDayResolutions).optional(),
  /** null removes it. */
  limit: limitSchema.nullable().optional(),
})

const listQuerySchema = z.object({
  goalId: z.string().optional(),
  includeArchived: z.enum(['true', 'false']).optional(),
})

const reorderTasksSchema = z.object({
  taskIds: z.array(z.string()).min(1),
})

async function requireGoalExists(goalId: string): Promise<void> {
  const exists = await GoalModel.exists({ _id: requireObjectId(goalId, 'goalId') })
  if (!exists) throw new HttpError(404, 'Goal not found')
}

/**
 * Every attached unit has to exist: a dangling reference would make the log
 * sheet ask for a value it can't label.
 */
async function requireUnitsExist(unitIds: string[]): Promise<void> {
  if (unitIds.length === 0) return
  const ids = unitIds.map((id) => requireObjectId(id, 'unitId'))
  const found = await TrackingUnitModel.countDocuments({ _id: { $in: ids } })
  if (found !== ids.length) throw new HttpError(400, 'One or more tracking units no longer exist')
}

/**
 * The first `startWeekday` on or after `from` - the concrete day an 'everyNDays'
 * cadence counts from, and the only place that field is ever produced.
 *
 * `from` differs by operation, and deliberately:
 *
 *  - creating, it's the task's start day (see taskStartDay), so a task on a goal
 *    beginning next month starts its cadence there rather than today.
 *  - editing, it's clamped to today, so changing a frequency never reaches back
 *    and makes days that have already gone by retroactively scheduled. That is
 *    the same promise the day-resolution dialog makes.
 *
 * Either way the anchor lands *on* the chosen weekday, so re-saving can't
 * quietly shift the cadence onto some other day of the week.
 */
function resolveAnchorDate(startWeekday: number, from: string): string {
  return addDays(from, (startWeekday - weekdayOf(from) + 7) % 7)
}

/**
 * The frequency as it gets stored: everything the client sent, plus the anchor
 * for the one variant that needs one.
 */
function withAnchor(frequency: TaskFrequencyInput, from: string): Record<string, unknown> {
  if (frequency.type !== 'everyNDays') return { ...frequency }
  return { ...frequency, anchorDate: resolveAnchorDate(frequency.startWeekday, from) }
}

export async function listTasks(req: Request, res: Response): Promise<void> {
  const { goalId, includeArchived } = listQuerySchema.parse(req.query)

  const tasks = await TaskModel.find({
    ...(goalId ? { goalId: requireObjectId(goalId, 'goalId') } : {}),
    ...(includeArchived === 'true' ? {} : { archived: false }),
  }).sort({ createdAt: 1 })

  res.json(tasks)
}

export async function createTask(req: Request, res: Response): Promise<void> {
  const { startDay: backdateTo, ...payload } = createTaskSchema.parse(req.body)

  // startDate and createdAt come along for taskStartDay: a cadence on a goal
  // that begins next month starts counting there, not today.
  const goal = await GoalModel.findById(requireObjectId(payload.goalId, 'goalId')).select(
    'startDate createdAt',
  )
  if (!goal) throw new HttpError(404, 'Goal not found')
  if (payload.unitIds) await requireUnitsExist(payload.unitIds)

  if (backdateTo !== undefined) {
    if (payload.frequency.type !== 'once') {
      throw new HttpError(400, 'Only a one-time task can start on an earlier day')
    }
    if (backdateTo > today()) throw new HttpError(400, 'startDay cannot be in the future')
    if (backdateTo < toDayKey(goal.startDate ?? goal.createdAt)) {
      throw new HttpError(400, 'startDay cannot be before the goal starts')
    }
  }

  // The task doesn't exist yet, so it stands in for its own createdAt - which is
  // now, give or take the write. toDayKey, not today(), because taskStartDay
  // reads every stored date back through it.
  const startDay = taskStartDay({ createdAt: new Date() }, goal)

  const last = await TaskModel.findOne().sort({ order: -1 }).select('order')
  const task = await TaskModel.create({
    ...payload,
    frequency: withAnchor(payload.frequency, startDay),
    order: (last?.order ?? -1) + 1,
  })

  // Noon UTC, so the day key reads back the same in any nearby timezone. The
  // same write the seed script once used to backdate tasks (timestamps off, or
  // Mongoose would stamp updatedAt and leave createdAt alone).
  if (backdateTo !== undefined) {
    const createdAt = new Date(`${backdateTo}T12:00:00Z`)
    await TaskModel.updateOne({ _id: task._id }, { $set: { createdAt } }, { timestamps: false })
    task.createdAt = createdAt
  }

  res.status(201).json(task)
}

/**
 * Persists a new row order in one shot: `taskIds` is the full list shown on
 * screen, in its new order, and each gets reindexed to its position.
 */
export async function reorderTasks(req: Request, res: Response): Promise<void> {
  const { taskIds } = reorderTasksSchema.parse(req.body)
  const ids = taskIds.map((id) => requireObjectId(id, 'task id'))

  await TaskModel.bulkWrite(
    ids.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { $set: { order: index } } },
    })),
  )

  res.status(204).send()
}

export async function updateTask(req: Request, res: Response): Promise<void> {
  const payload = updateTaskSchema.parse(req.body)
  const taskId = requireObjectId(req.params.id)
  if (payload.goalId) await requireGoalExists(payload.goalId)
  if (payload.unitIds) await requireUnitsExist(payload.unitIds)

  // One read, not three: the frequency guard, the anchor and the watermark all
  // need some part of the current task, and the anchor needs its createdAt.
  const current = await TaskModel.findById(taskId).select(
    'goalId dayResolution frequency createdAt limit',
  )
  if (!current) throw new HttpError(404, 'Task not found')

  const update: Record<string, unknown> = { ...payload }

  // A day's figure exists for any unit - its total, or its latest reading - and
  // so does a weekly average of those. A weekly total adds them up, so it needs
  // a 'sum' unit. Any of them needs a recurring task to have days to judge.
  // `since` holds while the limit keeps
  // judging the same thing - only the unit, direction, period or measure
  // changing restarts it, so nudging the target re-judges the days already under it.
  if (payload.limit) {
    const unit = await TrackingUnitModel.findById(requireObjectId(payload.limit.unitId, 'unitId'))
    if (!unit) throw new HttpError(400, 'That tracking unit no longer exists')
    const average = payload.limit.measure === 'average'
    if (average && payload.limit.period !== 'week') {
      throw new HttpError(400, 'An average is taken over a week')
    }
    if (!average && payload.limit.period === 'week' && unit.aggregation !== 'sum') {
      throw new HttpError(400, 'A weekly total needs a unit that adds up (like coffees), not a single reading')
    }
    if ((payload.frequency ?? current.frequency).type === 'once') {
      throw new HttpError(400, 'A one-time task cannot have a limit')
    }
    const alsoLoggedUnitId = payload.limit.alsoLoggedUnitId
    if (alsoLoggedUnitId) {
      if (payload.limit.period !== 'day') {
        throw new HttpError(400, 'Only a daily limit can also ask for another unit')
      }
      if (alsoLoggedUnitId === payload.limit.unitId) {
        throw new HttpError(400, 'The other unit must differ from the one being judged')
      }
      if (!(await TrackingUnitModel.exists({ _id: requireObjectId(alsoLoggedUnitId, 'alsoLoggedUnitId') }))) {
        throw new HttpError(400, 'That tracking unit no longer exists')
      }
    }
    const sameJudgement =
      current.limit &&
      String(current.limit.unitId) === payload.limit.unitId &&
      current.limit.direction === payload.limit.direction &&
      current.limit.period === payload.limit.period &&
      current.limit.measure === payload.limit.measure

    // Asked to judge the history too: `since` goes back to the task's first
    // day, and syncLimitVerdicts then overwrites (or clears) every old answer
    // from there with the verdict its readings give.
    let since = sameJudgement && current.limit ? current.limit.since : today()
    if (payload.limit.fromStart) {
      const goal = await GoalModel.findById(current.goalId).select('startDate createdAt')
      if (!goal) throw new HttpError(404, 'Goal not found')
      since = taskStartDay(current, goal)
    }

    update.limit = {
      unitId: new Types.ObjectId(payload.limit.unitId),
      direction: payload.limit.direction,
      target: payload.limit.target,
      period: payload.limit.period,
      measure: payload.limit.measure,
      alsoLoggedUnitId: alsoLoggedUnitId ? new Types.ObjectId(alsoLoggedUnitId) : null,
      since,
    }
  }

  if (payload.frequency) {
    // Against the *new* goal when the task is being moved - the cadence belongs
    // to where it's going, not where it's been.
    const goalId = payload.goalId ?? String(current.goalId)
    const goal = await GoalModel.findById(goalId).select('startDate createdAt')
    if (!goal) throw new HttpError(404, 'Goal not found')

    // Clamped to today: editing a frequency must not reach back and make days
    // that have already gone by newly scheduled. See resolveAnchorDate.
    const startDay = taskStartDay(current, goal)
    const todayKey = toDayKey(new Date())
    update.frequency = withAnchor(payload.frequency, startDay > todayKey ? startDay : todayKey)
  }

  // Changing what happens to an unanswered day applies from here on. Moving
  // the resolver's watermark to yesterday is what guarantees that: it never
  // looks at a day at or before it, so history is neither rewritten nor
  // retro-failed by a setting that wasn't in force at the time.
  //
  // A frequency change needs the same protection, and more urgently. A 'carry'
  // task never advances its own watermark (pendingWork bails before the write
  // while its goal is still in date), so without this, changing its frequency
  // would have carriedDueDays walk the task's entire history and surface it as
  // a hundred-odd stacked days due today - then fail every one of them when the
  // goal's target date passed.
  const resolutionChanged =
    payload.dayResolution !== undefined && current.dayResolution !== payload.dayResolution
  // Adding or removing a limit too: while one is set the resolver leaves the
  // task alone, and on removal it must not walk back over the limit's days.
  const limitChanged = payload.limit !== undefined && Boolean(payload.limit) !== Boolean(current.limit)
  if (resolutionChanged || payload.frequency || limitChanged) {
    update.autoResolvedThrough = addDays(today(), -1)
  }

  const task = await TaskModel.findByIdAndUpdate(taskId, update, {
    new: true,
    runValidators: true,
  })
  if (!task) throw new HttpError(404, 'Task not found')

  // Readings this task captured for a unit it no longer tracks would otherwise
  // linger with no screen able to show them, and block that unit from ever
  // being deleted. Hand-entered readings have no taskId and aren't touched.
  if (payload.unitIds) {
    const keep = payload.unitIds.map((id) => requireObjectId(id, 'unitId'))
    await MeasurementModel.deleteMany({ taskId, unitId: { $nin: keep } })
  }

  res.json(task)
}

/** Deleting a task removes its whole day history, its notes and its readings. */
export async function deleteTask(req: Request, res: Response): Promise<void> {
  const taskId = requireObjectId(req.params.id)

  const task = await TaskModel.findByIdAndDelete(taskId)
  if (!task) throw new HttpError(404, 'Task not found')

  await Promise.all([
    CompletionModel.deleteMany({ taskId }),
    TaskNoteModel.deleteMany({ taskId }),
    // Orphaned readings would be invisible and would block their unit's
    // deletion forever, naming a task that no longer exists.
    MeasurementModel.deleteMany({ taskId }),
  ])
  res.status(204).send()
}
