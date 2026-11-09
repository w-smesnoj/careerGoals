import type { Request, Response } from 'express'
import { z } from 'zod'
import { TrackingUnitModel, unitAggregations } from '../models/trackingUnit.model'
import { MeasurementModel } from '../models/measurement.model'
import { TaskModel } from '../models/task.model'
import { HttpError } from '../middleware/errorHandler'
import { escapeRegex } from '../lib/text'
import { today, DAY_PATTERN } from '../lib/date'
import { requireObjectId } from './goal.controller'

const createTrackingUnitSchema = z.object({
  name: z.string().trim().min(1, 'A unit needs a name').max(60),
  symbol: z.string().trim().max(12).optional(),
  decimals: z.number().int().min(0).max(3).optional(),
  aggregation: z.enum(unitAggregations).optional(),
  target: z.number().nullable().optional(),
})

const updateTrackingUnitSchema = createTrackingUnitSchema.partial()

const listQuerySchema = z.object({
  date: z.string().regex(DAY_PATTERN, 'date must be formatted as YYYY-MM-DD').optional(),
})

/**
 * The one figure a unit's row shows, plus how much history sits behind it.
 * Scoped to whichever day the tracking list is browsing - mirroring getDay,
 * one aggregation figure per unit for a chosen day rather than always "now".
 */
interface UnitSummary {
  /** All-time, so a "0 today" reading can still be told apart from a unit
   *  that's never once been recorded. */
  entryCount: number
  /**
   * The reading recorded on the requested day, if any. Carries its id so
   * tapping the figure can edit that exact row without a second request - and
   * without the risk of a list fetch disagreeing with what was just tapped.
   */
  dayLatest: { id: string; value: number } | null
  /** That day's readings added up - what a 'sum' unit shows instead of `dayLatest`. */
  dayTotal: number
}

/**
 * Every unit's summary for one day, keyed by unit id.
 *
 * Two aggregations rather than one: `entryCount` has to stay all-time even
 * while `dayTotal`/`dayLatest` are scoped to a single day, and a $match on
 * date up front would throw the all-time count away along with everything
 * else outside that day.
 */
async function summariseUnits(date: string): Promise<Map<string, UnitSummary>> {
  const [totals, dayRows] = await Promise.all([
    MeasurementModel.aggregate<{ _id: unknown; entryCount: number }>([
      { $group: { _id: '$unitId', entryCount: { $sum: 1 } } },
    ]),
    MeasurementModel.aggregate<{
      _id: unknown
      dayTotal: number
      dayLatestId: unknown
      dayLatestValue: number
    }>([
      { $match: { date } },
      // Same-day readings ordered newest first, so $first is genuinely the
      // last one taken that day.
      { $sort: { measuredAt: -1 } },
      {
        $group: {
          _id: '$unitId',
          dayTotal: { $sum: '$value' },
          // $first and $sum in the same $group read the same rows, so the id
          // can't drift from the value beside it.
          dayLatestId: { $first: '$_id' },
          dayLatestValue: { $first: '$value' },
        },
      },
    ]),
  ])

  const entryCounts = new Map(totals.map((row) => [String(row._id), row.entryCount]))
  const dayByUnit = new Map(
    dayRows.map((row) => [
      String(row._id),
      {
        dayTotal: row.dayTotal,
        // Stringified by hand: aggregate() returns plain documents, so the
        // schema's toJSON transform never runs over this id.
        dayLatest: { id: String(row.dayLatestId), value: row.dayLatestValue },
      },
    ]),
  )

  const unitIds = new Set([...entryCounts.keys(), ...dayByUnit.keys()])
  return new Map(
    [...unitIds].map((id) => [
      id,
      {
        entryCount: entryCounts.get(id) ?? 0,
        dayTotal: dayByUnit.get(id)?.dayTotal ?? 0,
        dayLatest: dayByUnit.get(id)?.dayLatest ?? null,
      },
    ]),
  )
}

/** A unit with nothing recorded against it, on this day or ever. */
const EMPTY_SUMMARY: UnitSummary = { entryCount: 0, dayLatest: null, dayTotal: 0 }

/**
 * Refuses a name another unit already has, case-insensitively.
 *
 * Not a unique index: a plain one is case-sensitive, so it would let "kg" and
 * "Kg" both through - which is the collision people actually make - and a
 * collation index would then have to be matched by every query. A check here
 * also gets to say which name is taken.
 */
async function requireNameFree(name: string, excludeId?: string): Promise<void> {
  const clash = await TrackingUnitModel.findOne({
    name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).select('name')

  if (clash) throw new HttpError(409, `You already track something called “${clash.name}”`)
}

export async function listTrackingUnits(req: Request, res: Response): Promise<void> {
  const { date = today() } = listQuerySchema.parse(req.query)

  const [units, summaries] = await Promise.all([
    TrackingUnitModel.find().sort({ order: 1, createdAt: 1 }),
    summariseUnits(date),
  ])

  res.json(
    units.map((unit) => ({
      ...unit.toJSON(),
      summary: summaries.get(String(unit._id)) ?? EMPTY_SUMMARY,
    })),
  )
}

export async function createTrackingUnit(req: Request, res: Response): Promise<void> {
  const payload = createTrackingUnitSchema.parse(req.body)
  await requireNameFree(payload.name)

  const last = await TrackingUnitModel.findOne().sort({ order: -1 }).select('order')
  const unit = await TrackingUnitModel.create({ ...payload, order: (last?.order ?? -1) + 1 })
  res.status(201).json({ ...unit.toJSON(), summary: EMPTY_SUMMARY })
}

const reorderTrackingUnitsSchema = z.object({
  unitIds: z.array(z.string()).min(1),
})

/**
 * Persists a new row order in one shot: `unitIds` is the full list shown on
 * screen, in its new order, and each gets reindexed to its position - the
 * tracking-unit mirror of reorderTasks.
 */
export async function reorderTrackingUnits(req: Request, res: Response): Promise<void> {
  const { unitIds } = reorderTrackingUnitsSchema.parse(req.body)
  const ids = unitIds.map((id) => requireObjectId(id, 'unit id'))

  await TrackingUnitModel.bulkWrite(
    ids.map((id, index) => ({
      updateOne: { filter: { _id: id }, update: { $set: { order: index } } },
    })),
  )

  res.status(204).send()
}

export async function updateTrackingUnit(req: Request, res: Response): Promise<void> {
  const unitId = requireObjectId(req.params.id, 'unit id')
  const payload = updateTrackingUnitSchema.parse(req.body)
  if (payload.name) await requireNameFree(payload.name, unitId)

  const unit = await TrackingUnitModel.findByIdAndUpdate(unitId, payload, {
    new: true,
    runValidators: true,
  })
  if (!unit) throw new HttpError(404, 'Tracking unit not found')

  // Readings keep whatever precision they were stored with - lowering `decimals`
  // is a display choice, and rounding history to match would destroy data to
  // honour it. formatMeasurement renders old values at the new precision.
  //
  // The client refetches the list itself right after (it's the day actually
  // being browsed that matters), so this response's summary only has to be
  // shaped correctly, not date-accurate - today() is a fine default for it.
  const summaries = await summariseUnits(today())
  res.json({ ...unit.toJSON(), summary: summaries.get(unitId) ?? EMPTY_SUMMARY })
}

/**
 * A unit is only removable once nothing points at it - no cascade, because the
 * numbers behind a unit are the whole reason for having had one. The error
 * names what's holding it, so there's somewhere to go and fix it.
 *
 * The check and the delete aren't atomic, and can't be: this Mongo is a
 * standalone, so there are no transactions. For a single-user app the race
 * needs two of the user's own devices racing to the millisecond.
 */
export async function deleteTrackingUnit(req: Request, res: Response): Promise<void> {
  const unitId = requireObjectId(req.params.id, 'unit id')

  const unit = await TrackingUnitModel.findById(unitId)
  if (!unit) throw new HttpError(404, 'Tracking unit not found')

  const [tasks, entryCount] = await Promise.all([
    // Archived tasks count: they're off every screen but still hold the unit,
    // so the message has to say so or there's nothing to go and look for.
    // A limit judged from this unit holds it just the same.
    TaskModel.find({
      $or: [{ unitIds: unitId }, { 'limit.unitId': unitId }, { 'limit.alsoLoggedUnitId': unitId }],
    })
      .select('title archived')
      .limit(5),
    MeasurementModel.countDocuments({ unitId }),
  ])

  if (tasks.length > 0 || entryCount > 0) {
    const parts: string[] = []
    if (tasks.length > 0) {
      const names = tasks.map((task) => `“${task.title}”${task.archived ? ' (archived)' : ''}`)
      parts.push(
        names.length > 3
          ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
          : names.join(', '),
      )
    }
    if (entryCount > 0) {
      parts.push(`${entryCount} recorded ${entryCount === 1 ? 'entry' : 'entries'}`)
    }

    throw new HttpError(
      409,
      `“${unit.name}” is still in use by ${parts.join(' and ')}. Detach it and delete its entries first.`,
    )
  }

  await unit.deleteOne()
  res.status(204).send()
}

const seriesQuerySchema = z.object({
  from: z.string().regex(DAY_PATTERN, 'from must be formatted as YYYY-MM-DD').optional(),
  to: z.string().regex(DAY_PATTERN, 'to must be formatted as YYYY-MM-DD').optional(),
})

/**
 * One figure per recorded day, oldest first - what the unit's chart plots.
 *
 * Collapsed server-side by the unit's own aggregation rather than shipped as
 * raw rows: a 'sum' unit can log several entries a day, so a year of them
 * would blow straight through the measurement list's page cap. Days with
 * nothing recorded are simply absent; the chart decides what a gap means.
 */
export async function getTrackingUnitSeries(req: Request, res: Response): Promise<void> {
  const unitId = requireObjectId(req.params.id, 'unit id')
  const { from, to } = seriesQuerySchema.parse(req.query)

  const unit = await TrackingUnitModel.findById(unitId).select('aggregation decimals')
  if (!unit) throw new HttpError(404, 'Tracking unit not found')

  const dateRange = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) }
  const rows = await MeasurementModel.aggregate<{ _id: string; value: number; count: number }>([
    { $match: { unitId: unit._id, ...(from || to ? { date: dateRange } : {}) } },
    // Newest reading of each day first, so $first is that day's 'latest'.
    { $sort: { date: 1, measuredAt: -1 } },
    {
      $group: {
        _id: '$date',
        value: unit.aggregation === 'sum' ? { $sum: '$value' } : { $first: '$value' },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ])

  // Rounded so a summed day never charts as 0.30000000000000004.
  const factor = 10 ** unit.decimals
  res.json({
    points: rows.map((row) => ({
      date: row._id,
      value: Math.round(row.value * factor) / factor,
      count: row.count,
    })),
  })
}
