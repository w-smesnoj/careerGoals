import type { Migration } from '../lib/migration'

/**
 * Limits grew a measure: 'average' (sleep a night, averaged over the week)
 * beside the original 'total'. Every existing limit adds its readings up, so
 * each lands on 'total' - no verdict moves.
 */
export const migration: Migration = {
  id: '0012_task_limit_measure',
  description: "Add task.limit.measure ('total') to existing limits",
  up: async (db) => {
    await db
      .collection('tasks')
      .updateMany(
        { limit: { $ne: null }, 'limit.measure': { $exists: false } },
        { $set: { 'limit.measure': 'total' } },
      )
  },
}
