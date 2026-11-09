import type { Migration } from '../lib/migration'

/**
 * Backfills the day-resolution setting onto tasks that predate it, and the
 * `auto` marker onto completions written before there was such a thing.
 *
 * Every existing task lands on 'open', which is exactly what they already did:
 * a day nobody answered stays unanswered. So this rewrites no history and
 * resolves no day - it only makes the stored documents match the schema.
 *
 * `autoResolvedThrough` starts null: the resolver has never run for these
 * tasks, and while they're 'open' it never will.
 */
export const migration: Migration = {
  id: '0009_task_day_resolution',
  description: "Add task.dayResolution ('open') and completion.auto (false) to existing documents",
  up: async (db) => {
    await db
      .collection('tasks')
      .updateMany(
        { dayResolution: { $exists: false } },
        { $set: { dayResolution: 'open', autoResolvedThrough: null } },
      )

    await db
      .collection('completions')
      .updateMany({ auto: { $exists: false } }, { $set: { auto: false } })
  },
}
