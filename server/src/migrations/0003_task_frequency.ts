import type { Migration } from '../lib/migration'

/** Backfills `frequency` so every existing task keeps recurring every day, exactly as before. */
export const migration: Migration = {
  id: '0003_task_frequency',
  description: "Default frequency: {type: 'daily'} on all existing tasks",
  up: async (db) => {
    await db.collection('tasks').updateMany({}, { $set: { frequency: { type: 'daily' } } })
  },
}
