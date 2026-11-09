import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'
import { DAY_PATTERN } from '../lib/date'

/** 'annual' repeats a day, or a range of days, on the same month/day every year. */
export const specialDayRecurrences = ['none', 'annual'] as const
export type SpecialDayRecurrence = (typeof specialDayRecurrences)[number]

/**
 * Something that *happens* on a day rather than something you do on it - it has
 * no completion, no goal and no schedule, which is exactly why it can't be a Task.
 *
 * What kind of day it is comes from its category (specialDayCategory.model.ts),
 * and so does everything that follows from that: time off, paused habits.
 * Public holidays are never stored: they're derived from the chosen Bundesland
 * on the client, so changing region can't leave stale rows behind.
 *
 * Dates are local calendar days (YYYY-MM-DD), the same as Completion, Measurement
 * and TaskNote store them, so "which day is this?" never depends on who's reading.
 */
const specialDaySchema = new Schema(
  {
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: 'SpecialDayCategory',
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    startDate: {
      type: String,
      required: true,
      match: [DAY_PATTERN, 'startDate must be formatted as YYYY-MM-DD'],
    },
    /**
     * Always present, equal to `startDate` for a single day. Storing it rather
     * than leaving it null keeps every range query a plain overlap test, with
     * no "is this a range or a point?" branch anywhere downstream.
     */
    endDate: {
      type: String,
      required: true,
      match: [DAY_PATTERN, 'endDate must be formatted as YYYY-MM-DD'],
    },
    recurrence: { type: String, enum: specialDayRecurrences, required: true, default: 'none' },
    /**
     * Whether `startDate`'s year is the real one, and so worth counting from - the
     * age a birthday turns, an anniversary's number. A birthday entered without a
     * year still needs *some* date to recur from, so its year is a placeholder.
     */
    yearKnown: { type: Boolean, default: true },
    note: { type: String, trim: true, maxlength: 500, default: '' },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id)
        delete ret._id
        ret.categoryId = String(ret.categoryId)
        return ret
      },
    },
  },
)

// Every read is "what falls in this window?", ordered by when it starts.
specialDaySchema.index({ startDate: 1 })

export type SpecialDay = InferSchemaType<typeof specialDaySchema>
export type SpecialDayDocument = HydratedDocument<SpecialDay>

export const SpecialDayModel = model('SpecialDay', specialDaySchema)
