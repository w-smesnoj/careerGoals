import type { Migration } from '../lib/migration'

/**
 * Adds the `order` field tasks now sort by, seeded from creation order so
 * existing rows keep their current position until someone drags one.
 */
export const migration: Migration = {
  id: '0002_task_order',
  description: 'Seed task.order from createdAt',
  up: async (db) => {
    const tasks = await db
      .collection('tasks')
      .find({}, { projection: { _id: 1 } })
      .sort({ createdAt: 1 })
      .toArray()

    if (tasks.length === 0) return

    await db.collection('tasks').bulkWrite(
      tasks.map((task, index) => ({
        updateOne: { filter: { _id: task._id }, update: { $set: { order: index } } },
      })),
    )
  },
}
