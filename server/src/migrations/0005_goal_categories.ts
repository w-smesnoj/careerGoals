import type { Migration } from '../lib/migration'

/**
 * Converts the old single `category` string into a `categories` array so a
 * goal can carry several. Existing values are preserved as one-element
 * arrays; goals with no category at all fall back to the same 'general'
 * default the schema used to apply.
 */
export const migration: Migration = {
  id: '0005_goal_categories',
  description: 'Convert goal.category (string) to goal.categories (string[])',
  up: async (db) => {
    await db.collection('goals').updateMany({ categories: { $exists: false } }, [
      {
        $set: {
          categories: {
            $cond: [{ $ifNull: ['$category', false] }, ['$category'], ['general']],
          },
        },
      },
      { $unset: 'category' },
    ])
  },
}
