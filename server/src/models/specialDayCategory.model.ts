import { Schema, model, type InferSchemaType, type HydratedDocument } from 'mongoose'

/**
 * The hues a category can wear. Darker steps than the goal palette, because a
 * special day's colour is also its text (the calendar names a day in it).
 * See `--hue-*` in src/index.css.
 *
 * Mirrored in `src/api/specialDays.ts` - keep the two in sync by hand.
 */
export const specialDayHues = [
  'red',
  'orange',
  'amber',
  'green',
  'teal',
  'blue',
  'indigo',
  'pink',
  'brown',
  'slate',
] as const

/** The glyphs a category's tile can show - drawn in src/components/specialDayGlyphs.tsx. */
export const specialDayIcons = [
  'flag',
  'sun',
  'gift',
  'star',
  'heart',
  'music',
  'thermometer',
  'plane',
  'briefcase',
  'sparkle',
  'graduation',
  'home',
  'ticket',
  'leaf',
  'trophy',
  'moon',
] as const

/**
 * The days the app computes rather than stores, and the category each lands
 * in: public holidays from the Bundesland, and the few moving observances
 * (Muttertag, Vatertag) in src/lib/holidays.ts. A built-in category can be
 * renamed and recoloured like any other, but never deleted - the computed
 * days would have nowhere to go.
 */
export const builtinCategories = ['holidays', 'observances'] as const
export type BuiltinCategory = (typeof builtinCategories)[number]

/**
 * What a special day *is* - Birthdays, Vacations, Sick days, Festivals. The
 * user makes these; the calendar's filter is simply the list of them.
 *
 * What a day does to the rest of the app is decided here, per category,
 * rather than by a hardcoded kind: whether it's time off, and whether it
 * pauses habits (see lib/vacation.ts).
 */
const specialDayCategorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    color: { type: String, enum: specialDayHues, required: true },
    icon: { type: String, enum: specialDayIcons, required: true },
    /** Position in the filter and the pickers. */
    order: { type: Number, required: true, default: 0 },
    /** Its days are time off: tinted as a band, and not counted as working days. */
    dayOff: { type: Boolean, default: false },
    /** Recurring habits aren't due on its days - nothing fails, stats leave them out. */
    pausesHabits: { type: Boolean, default: false },
    builtin: { type: String, enum: [...builtinCategories, null], default: null },
  },
  {
    // Spelled out, so the migration that creates it and this model can't
    // disagree about where it lives.
    collection: 'specialdaycategories',
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

export type SpecialDayCategory = InferSchemaType<typeof specialDayCategorySchema>
export type SpecialDayCategoryDocument = HydratedDocument<SpecialDayCategory>

export const SpecialDayCategoryModel = model('SpecialDayCategory', specialDayCategorySchema)
