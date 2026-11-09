import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'
import { DAY_PATTERN } from '../lib/date'

/**
 * One number, in one unit, on one day.
 *
 * The same row whether it was typed on the tracking page or captured by ticking
 * a task - a task-borne reading just carries the taskId that produced it, which
 * is also what makes re-ticking a day edit its value instead of piling up
 * another one (see the partial index below).
 *
 * `date` is the calendar day, the same way Completion stores one (see
 * lib/date.ts); `measuredAt` only orders several readings within one day.
 * Never derive one from the other.
 */
const measurementSchema = new Schema(
  {
    unitId: { type: Schema.Types.ObjectId, ref: 'TrackingUnit', required: true, index: true },
    value: { type: Number, required: true },
    date: {
      type: String,
      required: true,
      match: [DAY_PATTERN, 'date must be formatted as YYYY-MM-DD'],
    },
    measuredAt: { type: Date, required: true, default: () => new Date() },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    /**
     * Set only when a task tick produced this reading. Left *absent*, never
     * null - the partial index below depends on that.
     */
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', default: undefined },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id)
        ret.unitId = String(ret.unitId)
        if (ret.taskId) ret.taskId = String(ret.taskId)
        delete ret._id
        return ret
      },
    },
  },
)

// One unit's history, newest first, with same-day readings in order.
measurementSchema.index({ unitId: 1, date: -1, measuredAt: -1 })
// Every task-borne reading on one day - the day screen, and the completion cascades.
measurementSchema.index({ taskId: 1, date: 1 })

/**
 * At most one reading per (task, unit, day), so re-ticking a day edits rather
 * than duplicates - the measurement mirror of Completion's unique (taskId, date).
 *
 * Partial on taskId being a real ObjectId, so hand-entered readings stay
 * unconstrained: four entries on a Tuesday is four rows. It matches on the type
 * rather than on `$exists` because a row written with `taskId: null` would
 * satisfy `$exists` and make the second hand-entered reading of a day collide.
 */
measurementSchema.index(
  { taskId: 1, unitId: 1, date: 1 },
  { unique: true, partialFilterExpression: { taskId: { $type: 'objectId' } } },
)

export type Measurement = InferSchemaType<typeof measurementSchema>
export type MeasurementDocument = HydratedDocument<Measurement>

export const MeasurementModel = model('Measurement', measurementSchema)
