import type { Migration } from '../lib/migration'

/**
 * Adds `startDate` to Goal. Left unset (null) on existing goals - the
 * frontend falls back to the goal's own createdAt as the range start when
 * it's null, which is the closest we can infer for goals that predate this
 * field.
 */
export const migration: Migration = {
  id: '0004_goal_start_date',
  description: 'Add goal.startDate (null on existing goals)',
  up: async (db) => {
    await db
      .collection('goals')
      .updateMany({ startDate: { $exists: false } }, { $set: { startDate: null } })
  },
}
