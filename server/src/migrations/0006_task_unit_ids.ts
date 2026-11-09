import type { Migration } from '../lib/migration'

/**
 * Backfills the empty attachment list on tasks that predate tracking units.
 *
 * Purely additive and guarded on the field being absent, so it's idempotent and
 * can't touch a task that already has units attached. Mongoose would hydrate a
 * missing array as [] anyway - this exists so the stored documents match the
 * schema rather than relying on that.
 */
export const migration: Migration = {
  id: '0006_task_unit_ids',
  description: 'Add task.unitIds (empty array) to existing tasks',
  up: async (db) => {
    await db
      .collection('tasks')
      .updateMany({ unitIds: { $exists: false } }, { $set: { unitIds: [] } })
  },
}
