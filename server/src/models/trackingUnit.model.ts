import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

/** How a unit's many readings collapse into the one figure shown on its card. */
export const unitAggregations = ['latest', 'sum'] as const
export type UnitAggregation = (typeof unitAggregations)[number]

/**
 * A thing the user measures: "Weight", in "kg", to one decimal.
 *
 * A unit is metadata only - every actual number lives in Measurement, whether
 * it was typed on the tracking page or captured by ticking a task off. That's
 * what lets one history list show both.
 */
const trackingUnitSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    /** Rendered after the value: "75 kg". Optional - "coffees" needs none. */
    symbol: { type: String, trim: true, maxlength: 12, default: '' },
    /** Display precision, and what values are rounded to on write. */
    decimals: { type: Number, required: true, default: 1, min: 0, max: 3 },
    /**
     * Weight is one reading a day and the last one wins; coffees and millilitres
     * accumulate. That's the only thing that differs between them, so it's one
     * enum here rather than every screen guessing.
     */
    aggregation: {
      type: String,
      enum: unitAggregations,
      required: true,
      default: 'latest',
    },
    /**
     * Where the user wants this number to end up - drawn as a dashed rule on
     * the unit's chart. Optional, and absent on units made before it existed,
     * so no migration: a missing field and null mean the same thing.
     */
    target: { type: Number, default: null },
    /** Manual drag order on the tracking list - the Task model's own field, same idea. */
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

trackingUnitSchema.index({ order: 1, createdAt: 1 })

export type TrackingUnit = InferSchemaType<typeof trackingUnitSchema>
export type TrackingUnitDocument = HydratedDocument<TrackingUnit>

export const TrackingUnitModel = model('TrackingUnit', trackingUnitSchema)
