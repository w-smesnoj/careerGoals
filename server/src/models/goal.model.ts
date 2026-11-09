import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

export const goalStatuses = ['active', 'completed', 'archived'] as const

/**
 * The goal palette, validated as a set (every pair, both modes, colour-blind
 * separation included) - see `--goal-*` in src/index.css. Red is left out on
 * purpose: on these screens it means "failed". Unset means purple, the accent.
 */
export const goalColors = ['purple', 'blue', 'green', 'orange', 'pink'] as const

/**
 * A Goal is the container: it carries the deadline and is assembled from Tasks.
 * It has no progress field of its own - progress is derived from task completions.
 */
const goalSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    categories: {
      type: [{ type: String, trim: true, maxlength: 60 }],
      default: ['general'],
    },
    status: { type: String, enum: goalStatuses, default: 'active', index: true },
    /** When work on the goal begins; ticks before it are shown disabled. Defaults
     *  to the goal's own createdAt if never set explicitly. */
    startDate: { type: Date, default: null },
    targetDate: { type: Date, default: null },
    /** Marks only - rings, the heatmap, swatches. Never text. Null lists too,
     *  so clearing the colour validates. No migration: absent reads as null. */
    color: { type: String, enum: [...goalColors, null], default: null },
    /** Manual drag order on the goals list - the tracking-unit model's own field, same idea. */
    order: { type: Number, required: true, default: 0, index: true },
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

goalSchema.index({ createdAt: -1 })
goalSchema.index({ order: 1, createdAt: 1 })

export type Goal = InferSchemaType<typeof goalSchema>
export type GoalDocument = HydratedDocument<Goal>

export const GoalModel = model('Goal', goalSchema)
