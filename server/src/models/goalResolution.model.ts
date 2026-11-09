import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

/** How the goal actually ended, in the owner's own judgement. */
export const resolutionOutcomes = ['achieved', 'partial', 'missed', 'abandoned'] as const
export type ResolutionOutcome = (typeof resolutionOutcomes)[number]

/**
 * The numbers as they stood the moment the book was closed. Snapshotted rather
 * than recomputed on read: tasks and their day records can be deleted later,
 * and the figures the user was looking at when they wrote the note should
 * outlive that.
 */
const resolutionStatsSchema = new Schema(
  {
    /** Percentage of scheduled days actually ticked, 0-100. */
    rate: { type: Number, required: true, min: 0, max: 100 },
    done: { type: Number, required: true, min: 0 },
    failed: { type: Number, required: true, min: 0 },
    /** Scheduled days that were never answered either way. */
    missed: { type: Number, required: true, min: 0 },
    possible: { type: Number, required: true, min: 0 },
    taskCount: { type: Number, required: true, min: 0 },
    daysElapsed: { type: Number, required: true, min: 0 },
    /** Start to due date, or null when the goal never had a due date. */
    daysPlanned: { type: Number, default: null },
  },
  { _id: false },
)

/**
 * Resolving is how a goal ends - the goal record itself is never deleted as a
 * matter of course, a resolution is written beside it and the goal's status
 * moves to 'completed'. Its own collection rather than more fields on Goal, so
 * the goal stays the plain container it is and this can grow (a stats
 * snapshot, later a history) without widening every goal document.
 *
 * One live resolution per goal, enforced by the unique index; re-resolving
 * overwrites it rather than stacking up.
 */
const goalResolutionSchema = new Schema(
  {
    goalId: { type: Schema.Types.ObjectId, ref: 'Goal', required: true, unique: true },
    outcome: { type: String, enum: resolutionOutcomes, required: true },
    /** The whole point of resolving: what the user made of it. */
    note: { type: String, trim: true, maxlength: 4000, default: '' },
    stats: { type: resolutionStatsSchema, required: true },
    resolvedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id)
        ret.goalId = String(ret.goalId)
        delete ret._id
        return ret
      },
    },
  },
)

export type GoalResolution = InferSchemaType<typeof goalResolutionSchema>
export type GoalResolutionDocument = HydratedDocument<GoalResolution>

export const GoalResolutionModel = model('GoalResolution', goalResolutionSchema)
