import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'
import { DAY_PATTERN } from '../lib/date'

/**
 * A freeform thought jotted against one task on one day - separate from the
 * fail-reason note on Completion. Many can exist per (task, day).
 */
const taskNoteSchema = new Schema(
  {
    taskId: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    date: {
      type: String,
      required: true,
      match: [DAY_PATTERN, 'date must be formatted as YYYY-MM-DD'],
    },
    text: { type: String, trim: true, required: true, maxlength: 2000 },
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

taskNoteSchema.index({ taskId: 1, date: 1 })

export type TaskNote = InferSchemaType<typeof taskNoteSchema>
export type TaskNoteDocument = HydratedDocument<TaskNote>

export const TaskNoteModel = model('TaskNote', taskNoteSchema)
