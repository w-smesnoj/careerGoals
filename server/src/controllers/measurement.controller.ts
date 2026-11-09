import type { Request, Response } from 'express'
import { z } from 'zod'
import { MeasurementModel } from '../models/measurement.model'
import { TrackingUnitModel } from '../models/trackingUnit.model'
import { TaskModel } from '../models/task.model'
import { HttpError } from '../middleware/errorHandler'
import { DAY_PATTERN, today } from '../lib/date'
import { requireObjectId } from './goal.controller'

/** A card shows a headline; opening its history wants a page, not a lifetime. */
const DEFAULT_LIMIT = 30
const MAX_LIMIT = 366

const createMeasurementSchema = z.object({
  unitId: z.string().min(1, 'A measurement needs a unit'),
  value: z.number().finite(),
  /** Defaults to today. Backdating is allowed; the future is not. */
  date: z.string().regex(DAY_PATTERN, 'date must be formatted as YYYY-MM-DD').optional(),
  note: z.string().trim().max(500).optional(),
})

const updateMeasurementSchema = z.object({
  value: z.number().finite().optional(),
  note: z.string().trim().max(500).optional(),
})

const listQuerySchema = z.object({
  unitId: z.string().optional(),
  from: z.string().regex(DAY_PATTERN, 'from must be formatted as YYYY-MM-DD').optional(),
  to: z.string().regex(DAY_PATTERN, 'to must be formatted as YYYY-MM-DD').optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
})

/**
 * Rounds a value to a unit's display precision, so what's stored is what's
 * shown - an edit that doesn't change the visible number doesn't change the
 * stored one either. Shared with the task-completion write path.
 */
export function roundToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

/** The same rule the task tick enforces, so both entry points agree. */
export function requireNotFuture(date: string): void {
  if (date > today()) throw new HttpError(400, 'Cannot record a day in the future')
}

async function requireUnit(unitId: string) {
  const unit = await TrackingUnitModel.findById(requireObjectId(unitId, 'unitId')).select(
    'decimals',
  )
  if (!unit) throw new HttpError(404, 'Tracking unit not found')
  return unit
}

/**
 * One unit's readings, newest first. Hand-entered and task-borne alike - they're
 * the same kind of row, and the history is the one place that shows both.
 */
export async function listMeasurements(req: Request, res: Response): Promise<void> {
  const { unitId, from, to, limit } = listQuerySchema.parse(req.query)

  // ISO day strings sort lexicographically, so a plain string range works here.
  const dateRange = {
    ...(from ? { $gte: from } : {}),
    ...(to ? { $lte: to } : {}),
  }

  const measurements = await MeasurementModel.find({
    ...(unitId ? { unitId: requireObjectId(unitId, 'unitId') } : {}),
    ...(from || to ? { date: dateRange } : {}),
  })
    .sort({ date: -1, measuredAt: -1 })
    .limit(limit ?? DEFAULT_LIMIT)

  // Task-borne rows carry the title that produced them, inlined the way getDay
  // inlines goalTitle - a history row has to say where a number came from, and
  // it shouldn't take a second request to find out.
  const taskIds = [...new Set(measurements.filter((m) => m.taskId).map((m) => String(m.taskId)))]
  const tasks = taskIds.length
    ? await TaskModel.find({ _id: { $in: taskIds } }).select('title')
    : []
  const titleByTask = new Map(tasks.map((task) => [String(task._id), task.title]))

  res.json(
    measurements.map((measurement) => ({
      ...measurement.toJSON(),
      taskTitle: measurement.taskId ? (titleByTask.get(String(measurement.taskId)) ?? null) : null,
    })),
  )
}

export async function createMeasurement(req: Request, res: Response): Promise<void> {
  const { unitId, value, date = today(), note } = createMeasurementSchema.parse(req.body)
  requireNotFuture(date)

  const unit = await requireUnit(unitId)

  // `taskId` is left off entirely rather than set to null: the unique index that
  // stops a task tick duplicating itself is partial on taskId being an
  // ObjectId, and a null here would make a second hand-entered reading on the
  // same day collide with the first.
  const measurement = await MeasurementModel.create({
    unitId,
    value: roundToDecimals(value, unit.decimals),
    date,
    note,
  })

  res.status(201).json(measurement)
}

export async function updateMeasurement(req: Request, res: Response): Promise<void> {
  const id = requireObjectId(req.params.id, 'measurement id')
  const payload = updateMeasurementSchema.parse(req.body)

  const measurement = await MeasurementModel.findById(id)
  if (!measurement) throw new HttpError(404, 'Measurement not found')

  if (payload.value !== undefined) {
    const unit = await requireUnit(String(measurement.unitId))
    measurement.value = roundToDecimals(payload.value, unit.decimals)
  }
  if (payload.note !== undefined) measurement.note = payload.note

  await measurement.save()
  res.json(measurement)
}

export async function deleteMeasurement(req: Request, res: Response): Promise<void> {
  const measurement = await MeasurementModel.findByIdAndDelete(
    requireObjectId(req.params.id, 'measurement id'),
  )
  if (!measurement) throw new HttpError(404, 'Measurement not found')
  res.status(204).send()
}
