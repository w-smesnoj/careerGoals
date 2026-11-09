import type { Migration } from '../lib/migration'

/**
 * Adds the `order` field tracking units now sort by, seeded from creation
 * order so existing rows keep their current position until someone drags one.
 */
export const migration: Migration = {
  id: '0007_tracking_unit_order',
  description: 'Seed trackingUnit.order from createdAt',
  up: async (db) => {
    const units = await db
      .collection('trackingunits')
      .find({}, { projection: { _id: 1 } })
      .sort({ createdAt: 1 })
      .toArray()

    if (units.length === 0) return

    await db.collection('trackingunits').bulkWrite(
      units.map((unit, index) => ({
        updateOne: { filter: { _id: unit._id }, update: { $set: { order: index } } },
      })),
    )
  },
}
