import type { Migration } from '../lib/migration'

/**
 * Adds the `order` field goals now sort by, seeded from creation order so
 * existing rows keep their current position until someone drags one.
 */
export const migration: Migration = {
  id: '0008_goal_order',
  description: 'Seed goal.order from createdAt',
  up: async (db) => {
    const goals = await db
      .collection('goals')
      .find({}, { projection: { _id: 1 } })
      .sort({ createdAt: 1 })
      .toArray()

    if (goals.length === 0) return

    await db.collection('goals').bulkWrite(
      goals.map((goal, index) => ({
        updateOne: { filter: { _id: goal._id }, update: { $set: { order: index } } },
      })),
    )
  },
}
