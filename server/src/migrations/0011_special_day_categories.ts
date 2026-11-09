import type { Migration } from '../lib/migration'

/**
 * Turns the fixed special-day kinds into categories the user can add to.
 *
 * Creates the four categories the kinds used to be - carrying over the colour,
 * glyph and behaviour each kind had hardcoded - then files every stored day
 * under the one matching its `kind`. `kind` goes once it's been replaced, and
 * so does the per-day `workFree`: it only ever mirrored the kind (true for
 * vacations), and whether a day is time off is now the category's to say.
 *
 * Idempotent: an existing category is found by its built-in role or name
 * rather than created twice, and only days still without a category are
 * touched.
 */
const DEFAULTS = [
  {
    kind: 'holiday',
    name: 'Holidays',
    color: 'amber',
    icon: 'flag',
    dayOff: true,
    pausesHabits: false,
    builtin: 'holidays',
  },
  {
    kind: 'birthday',
    name: 'Birthdays',
    color: 'pink',
    icon: 'gift',
    dayOff: false,
    pausesHabits: false,
    builtin: null,
  },
  {
    kind: 'vacation',
    name: 'Vacations',
    color: 'teal',
    icon: 'sun',
    dayOff: true,
    pausesHabits: true,
    builtin: null,
  },
  {
    kind: 'occasion',
    name: 'Occasions',
    color: 'indigo',
    icon: 'star',
    dayOff: false,
    pausesHabits: false,
    builtin: 'observances',
  },
] as const

export const migration: Migration = {
  id: '0011_special_day_categories',
  description: 'Replace specialDay.kind with categories (specialdaycategories + specialDay.categoryId)',
  up: async (db) => {
    const categories = db.collection('specialdaycategories')
    const days = db.collection('specialdays')
    const now = new Date()

    for (const [order, { kind, ...category }] of DEFAULTS.entries()) {
      const existing = await categories.findOne(
        category.builtin ? { builtin: category.builtin } : { name: category.name },
      )
      const id =
        existing?._id ??
        (await categories.insertOne({ ...category, order, createdAt: now, updatedAt: now }))
          .insertedId

      await days.updateMany(
        { kind, categoryId: { $exists: false } },
        { $set: { categoryId: id } },
      )
    }

    await days.updateMany(
      { categoryId: { $exists: true } },
      { $unset: { kind: '', workFree: '' } },
    )
  },
}
