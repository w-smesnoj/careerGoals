import type { Migration } from '../lib/migration'

/**
 * Limits grew a direction: 'atLeast' (steps) beside the original 'atMost'
 * (coffees). The threshold was stored as `max`, which reads wrong for a
 * minimum, so it becomes the neutral `target`. Every existing limit was a cap,
 * so each lands on 'atMost' with its number unchanged - no verdict moves.
 */
export const migration: Migration = {
  id: '0010_task_limit_direction',
  description: "Rename task.limit.max to limit.target and add limit.direction ('atMost')",
  up: async (db) => {
    await db
      .collection('tasks')
      .updateMany(
        { 'limit.max': { $exists: true } },
        { $rename: { 'limit.max': 'limit.target' }, $set: { 'limit.direction': 'atMost' } },
      )
  },
}
