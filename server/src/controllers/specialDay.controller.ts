import type { Request, Response } from 'express'
import { z } from 'zod'
import { isValidObjectId } from 'mongoose'
import { SpecialDayModel, specialDayRecurrences } from '../models/specialDay.model'
import { SpecialDayCategoryModel } from '../models/specialDayCategory.model'
import { HttpError } from '../middleware/errorHandler'
import { requireObjectId } from './goal.controller'
import { DAY_PATTERN, daysBetween } from '../lib/date'
import { loadVacationDays, pausesOnVacation } from '../lib/vacation'
import { GoalModel } from '../models/goal.model'
import { TaskModel } from '../models/task.model'
import { CompletionModel } from '../models/completion.model'

const dayKey = z.string().regex(DAY_PATTERN, 'must be formatted as YYYY-MM-DD')

/**
 * `endDate` defaults to `startDate`, so a single day is written the same shape
 * as a range and nothing downstream has to ask which it is.
 */
const specialDayShape = z.object({
  categoryId: z.string().refine(isValidObjectId, 'must be a category id'),
  title: z.string().trim().min(1, 'A special day needs a title').max(140),
  startDate: dayKey,
  endDate: dayKey.optional(),
  recurrence: z.enum(specialDayRecurrences).optional(),
  yearKnown: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
})

/** A day can only be filed under a category that exists. */
async function requireCategory(id: string) {
  const category = await SpecialDayCategoryModel.findById(id)
  if (!category) throw new HttpError(422, 'That category no longer exists')
  return category
}

/**
 * The two rules that keep an occurrence expandable:
 *  - a range has to run forwards, or it covers no days at all;
 *  - an annually recurring range has to end before the same date a year on,
 *    or each year's copy would run into the next one's. Both ends repeat on
 *    their own month/day (see projectSpan in lib/vacation.ts).
 */
function checkRange(value: { startDate: string; endDate?: string; recurrence?: string }, ctx: z.RefinementCtx) {
  const end = value.endDate ?? value.startDate
  if (end < value.startDate) {
    ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'endDate cannot precede startDate' })
  }
  const yearOn = `${Number(value.startDate.slice(0, 4)) + 1}${value.startDate.slice(4)}`
  if (value.recurrence === 'annual' && end >= yearOn) {
    ctx.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'An annually recurring special day has to be shorter than a year',
    })
  }
}

const createSpecialDaySchema = specialDayShape.superRefine(checkRange)

/**
 * A vacation entered after the fact - the usual case - lands on days the
 * resolver has already failed, and its watermark means it will never look at
 * them again. So the automatic fails on the newly paused days are withdrawn
 * here. Only automatic ones: anything answered by hand stays as it was.
 *
 * "Vacation" is any day whose category pauses habits. The caller checks that;
 * this takes the days themselves, so a category switched to pausing can
 * withdraw across all of its days at once.
 *
 * Removing a vacation doesn't put them back; those days just read as
 * unanswered, which is the honest state of them.
 */
export async function withdrawAutoFailsOn(
  ranges: { startDate: string; endDate: string }[],
): Promise<void> {
  if (ranges.length === 0) return

  const [goals, tasks, vacation] = await Promise.all([
    GoalModel.find(),
    TaskModel.find({ 'frequency.type': { $ne: 'once' } }).select('goalId frequency'),
    loadVacationDays(),
  ])
  const goalById = new Map(goals.map((goal) => [String(goal._id), goal]))
  const paused = tasks.filter((task) => {
    const goal = goalById.get(String(task.goalId))
    return goal !== undefined && pausesOnVacation(task, goal, vacation)
  })
  if (paused.length === 0) return

  await CompletionModel.deleteMany({
    taskId: { $in: paused.map((task) => task._id) },
    date: { $in: [...new Set(ranges.flatMap((range) => daysBetween(range.startDate, range.endDate)))] },
    status: 'failed',
    auto: true,
  })
}

// Partial, but the range rules still have to hold across the merged document,
// so validation happens after the patch is applied rather than on the patch.
const updateSpecialDaySchema = specialDayShape.partial()

const listQuerySchema = z.object({
  from: dayKey.optional(),
  to: dayKey.optional(),
})

/**
 * Everything by default. `from`/`to` narrow to non-recurring days that *overlap*
 * the window - recurring ones are always returned, since whether they land in
 * the window depends on a projection the client does.
 */
export async function listSpecialDays(req: Request, res: Response): Promise<void> {
  const { from, to } = listQuerySchema.parse(req.query)

  const overlapsWindow =
    from && to
      ? { $or: [{ recurrence: 'annual' }, { startDate: { $lte: to }, endDate: { $gte: from } }] }
      : {}

  const specialDays = await SpecialDayModel.find(overlapsWindow).sort({ startDate: 1 })
  res.json(specialDays)
}

export async function createSpecialDay(req: Request, res: Response): Promise<void> {
  const payload = createSpecialDaySchema.parse(req.body)
  const category = await requireCategory(payload.categoryId)
  const specialDay = await SpecialDayModel.create({
    ...payload,
    endDate: payload.endDate ?? payload.startDate,
  })
  if (category.pausesHabits) await withdrawAutoFailsOn([specialDay])
  res.status(201).json(specialDay)
}

export async function updateSpecialDay(req: Request, res: Response): Promise<void> {
  const payload = updateSpecialDaySchema.parse(req.body)
  const id = requireObjectId(req.params.id, 'special day id')

  const current = await SpecialDayModel.findById(id)
  if (!current) throw new HttpError(404, 'Special day not found')

  // Checked against the document as it will be, not against the patch alone:
  // moving only `startDate` past an untouched `endDate` is just as invalid.
  const merged = {
    startDate: payload.startDate ?? current.startDate,
    endDate: payload.endDate ?? (payload.startDate ? undefined : current.endDate),
    recurrence: payload.recurrence ?? current.recurrence,
  }
  // A moved start with no new end drags the end along, keeping a single day single.
  merged.endDate ??= merged.startDate
  const categoryId = payload.categoryId ?? String(current.categoryId)
  createSpecialDaySchema.parse({
    categoryId,
    title: payload.title ?? current.title,
    ...merged,
  })
  const category = await requireCategory(categoryId)

  current.set({ ...payload, endDate: merged.endDate })
  await current.save()
  if (category.pausesHabits) await withdrawAutoFailsOn([current])

  res.json(current)
}

/** A special day owns no child documents, so deletion is plain. */
export async function deleteSpecialDay(req: Request, res: Response): Promise<void> {
  const specialDay = await SpecialDayModel.findByIdAndDelete(
    requireObjectId(req.params.id, 'special day id'),
  )
  if (!specialDay) throw new HttpError(404, 'Special day not found')
  res.status(204).send()
}
