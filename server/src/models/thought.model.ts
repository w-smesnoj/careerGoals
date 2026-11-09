import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

export const thoughtOutcomeKinds = ['task', 'goal'] as const

/**
 * A think-tank entry: a thought captured on its own terms, belonging to no
 * goal, task or day. Deliberately separate from TaskNote, which only exists in
 * the context of one task on one day - the whole point here is somewhere to put
 * a thought before it has anywhere to belong.
 */
const thoughtSchema = new Schema(
  {
    /** Optional - a thought is allowed to arrive without a headline. */
    title: { type: String, trim: true, maxlength: 140, default: '' },
    text: { type: String, trim: true, required: true, maxlength: 10000 },
    tags: { type: [{ type: String, trim: true, maxlength: 60 }], default: [] },
    pinned: { type: Boolean, default: false },
    /**
     * What the thought became, once it was turned into action - the think
     * tank's "Turned into action" group. `id` is a plain string rather than a
     * ref: the task or goal may be deleted later, and the thought page says so
     * instead of following a dead link. No migration: absent reads as null.
     */
    outcome: {
      type: new Schema(
        {
          kind: { type: String, enum: thoughtOutcomeKinds, required: true },
          id: { type: String, required: true },
          title: { type: String, trim: true, maxlength: 140, default: '' },
          at: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id)
        delete ret._id
        return ret
      },
    },
  },
)

// Pinned first, then newest - the list's default order, served by one index.
thoughtSchema.index({ pinned: -1, createdAt: -1 })

export type Thought = InferSchemaType<typeof thoughtSchema>
export type ThoughtDocument = HydratedDocument<Thought>

export const ThoughtModel = model('Thought', thoughtSchema)
