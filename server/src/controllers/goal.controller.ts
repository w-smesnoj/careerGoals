import type { Request, Response } from 'express'
import { isValidObjectId } from 'mongoose'
import { z } from 'zod'
import { GoalModel, goalColors, goalStatuses } from '../models/goal.model'
import { TaskModel } from '../models/task.model'
import { CompletionModel } from '../models/completion.model'
import { TaskNoteModel } from '../models/taskNote.model'
import { MeasurementModel } from '../models/measurement.model'
import { GoalResolutionModel } from '../models/goalResolution.model'
import { HttpError } from '../middleware/errorHandler'

/** Deduped case-insensitively, keeping the first casing sent. */
const categoriesSchema = z
  .array(z.string().trim().min(1).max(60))
  .max(20)
  .transform((values) => {
    const seen = new Set<string>()
    return values.filter((value) => {
      const key = value.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  })

const createGoalSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(140),
  description: z.string().trim().max(2000).optional(),
  // An empty list on create means "didn't say", so the schema default applies.
  categories: categoriesSchema.optional().transform((values) => (values?.length ? values : undefined)),
  status: z.enum(goalStatuses).optional(),
  startDate: z.coerce.date().nullable().optional(),
  targetDate: z.coerce.date().nullable().optional(),
  color: z.enum(goalColors).nullable().optional(),
})

const updateGoalSchema = createGoalSchema.partial().extend({
  // On edit an empty list is a real edit - the goal ends up with no categories.
  // Dropping it the way create does would make removing the last chip silently
  // do nothing.
  categories: categoriesSchema.optional(),
})

const listQuerySchema = z.object({
  status: z.enum(goalStatuses).optional(),
  search: z.string().trim().min(1).optional(),
})

export function requireObjectId(id: unknown, label = 'id'): string {
  if (typeof id !== 'string' || !isValidObjectId(id)) {
    throw new HttpError(400, `Invalid ${label}: ${String(id)}`)
  }
  return id
}

export async function listGoals(req: Request, res: Response): Promise<void> {
  const { status, search } = listQuerySchema.parse(req.query)

  const goals = await GoalModel.find({
    ...(status ? { status } : {}),
    ...(search ? { title: { $regex: search, $options: 'i' } } : {}),
  }).sort({ order: 1, createdAt: 1 })

  res.json(goals)
}

export async function getGoal(req: Request, res: Response): Promise<void> {
  const goal = await GoalModel.findById(requireObjectId(req.params.id))
  if (!goal) throw new HttpError(404, 'Goal not found')
  res.json(goal)
}

export async function createGoal(req: Request, res: Response): Promise<void> {
  const last = await GoalModel.findOne().sort({ order: -1 }).select('order')
  const goal = await GoalModel.create({
    ...createGoalSchema.parse(req.body),
    order: (last?.order ?? -1) + 1,
  })
  res.status(201).json(goal)
}

const reorderGoalsSchema = z.object({
  goalIds: z.array(z.string()).min(1),
})

/**
 * Persists a new row order in one shot: `goalIds` is the full list shown on
 * screen, in its new order, and each gets reindexed to its position - the
 * goal mirror of reorderTrackingUnits.
 */
export async function reorderGoals(req: Request, res: Response): Promise<void> {
  const { goalIds } = reorderGoalsSchema.parse(req.body)
  const ids = goalIds.map((id) => requireObjectId(id, 'goal id'))

  await GoalModel.bulkWrite(
    ids.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { $set: { order: index } } },
    })),
  )

  res.status(204).send()
}

export async function updateGoal(req: Request, res: Response): Promise<void> {
  const payload = updateGoalSchema.parse(req.body)
  const goal = await GoalModel.findByIdAndUpdate(requireObjectId(req.params.id), payload, {
    new: true,
    runValidators: true,
  })
  if (!goal) throw new HttpError(404, 'Goal not found')
  res.json(goal)
}

/**
 * Deleting a goal takes everything hanging off it: its tasks, their day
 * records, their notes, and its own resolution. This is the escape hatch, not
 * the normal way a goal ends - resolving is (see goalResolution.controller.ts).
 */
export async function deleteGoal(req: Request, res: Response): Promise<void> {
  const goalId = requireObjectId(req.params.id)

  const goal = await GoalModel.findByIdAndDelete(goalId)
  if (!goal) throw new HttpError(404, 'Goal not found')

  const tasks = await TaskModel.find({ goalId }).select('_id')
  const taskIds = tasks.map((task) => task._id)

  await Promise.all([
    CompletionModel.deleteMany({ taskId: { $in: taskIds } }),
    TaskNoteModel.deleteMany({ taskId: { $in: taskIds } }),
    MeasurementModel.deleteMany({ taskId: { $in: taskIds } }),
    TaskModel.deleteMany({ goalId }),
    GoalResolutionModel.deleteOne({ goalId }),
  ])

  res.status(204).send()
}
