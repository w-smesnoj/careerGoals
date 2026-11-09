import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'
import { DAY_PATTERN } from '../lib/date'

/** A day is either ticked off, or explicitly failed with a reason. */
export const completionStatuses = ['done', 'failed'] as const
export type CompletionStatus = (typeof completionStatuses)[number]

/**
 * One record per task per day - the "every day is a new record" rule.
 * No record at all means the day is still unanswered.
 *
 * `date` is a local calendar day (YYYY-MM-DD), not a timestamp, so a tick made
 * at 23:50 stays on that day no matter who reads it later.
 */
const completionSchema = new Schema(
  {
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    date: {
      type: String,
      required: true,
      match: [DAY_PATTERN, 'date must be formatted as YYYY-MM-DD'],
    },
    status: { type: String, enum: completionStatuses, required: true },
    /** Why it failed. Only meaningful when status is 'failed'. */
    note: { type: String, trim: true, maxlength: 2000, default: '' },
    /**
     * Written by the day resolver rather than by a person - see the task's
     * dayResolution. Answering the day by hand always clears it, so this stays
     * a reliable "nobody actually said this" marker for the screens that dim
     * an automatic fail next to a deliberate one.
     */
    auto: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id)
        ret.taskId = String(ret.taskId)
        delete ret._id
        return ret
      },
    },
  },
)

// One row per (task, day). The upsert in the set handler relies on this.
completionSchema.index({ taskId: 1, date: 1 }, { unique: true })

export type Completion = InferSchemaType<typeof completionSchema>
export type CompletionDocument = HydratedDocument<Completion>

export const CompletionModel = model('Completion', completionSchema)
