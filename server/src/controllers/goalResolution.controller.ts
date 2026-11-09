import type { Request, Response } from 'express'
import { z } from 'zod'
import { GoalModel } from '../models/goal.model'
import { GoalResolutionModel, resolutionOutcomes } from '../models/goalResolution.model'
import { HttpError } from '../middleware/errorHandler'
import { requireObjectId } from './goal.controller'

/**
 * The figures are computed and sent by the client rather than recomputed here:
 * it already holds the whole tracker payload and the one implementation of the
 * rate maths (src/lib/goalStats.ts), and a second copy on the server would be
 * a second thing to keep in step. They're a descriptive snapshot, not an
 * authority - nothing is decided from them later.
 */
const statsSchema = z.object({
  rate: z.number().min(0).max(100),
  done: z.number().int().min(0),
  failed: z.number().int().min(0),
  missed: z.number().int().min(0),
  possible: z.number().int().min(0),
  taskCount: z.number().int().min(0),
  daysElapsed: z.number().int().min(0),
  daysPlanned: z.number().int().min(0).nullable().optional(),
})

const setResolutionSchema = z.object({
  outcome: z.enum(resolutionOutcomes),
  note: z.string().trim().max(4000).optional(),
  stats: statsSchema,
})

export async function getGoalResolution(req: Request, res: Response): Promise<void> {
  const goalId = requireObjectId(req.params.id, 'goal id')
  const resolution = await GoalResolutionModel.findOne({ goalId })
  if (!resolution) throw new HttpError(404, 'Goal has not been resolved')
  res.json(resolution)
}

/**
 * Close the book on a goal. Writes the resolution and moves the goal to
 * 'completed' - which is what greys it out everywhere rather than hiding it.
 * Idempotent: resolving an already-resolved goal edits its resolution.
 */
export async function setGoalResolution(req: Request, res: Response): Promise<void> {
  const goalId = requireObjectId(req.params.id, 'goal id')
  const { outcome, note, stats } = setResolutionSchema.parse(req.body)

  const goal = await GoalModel.findById(goalId)
  if (!goal) throw new HttpError(404, 'Goal not found')

  const resolution = await GoalResolutionModel.findOneAndUpdate(
    { goalId },
    { $set: { outcome, note: note ?? '', stats, resolvedAt: new Date() } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  )

  // Archiving is a separate, later step, so a resolved goal stays visible.
  if (goal.status !== 'archived') {
    goal.status = 'completed'
    await goal.save()
  }

  res.json(resolution)
}

/** Reopen a goal: drops the resolution and puts it back to active. */
export async function deleteGoalResolution(req: Request, res: Response): Promise<void> {
  const goalId = requireObjectId(req.params.id, 'goal id')

  const deleted = await GoalResolutionModel.findOneAndDelete({ goalId })
  if (!deleted) throw new HttpError(404, 'Goal has not been resolved')

  await GoalModel.findByIdAndUpdate(goalId, { status: 'active' })
  res.status(204).send()
}
