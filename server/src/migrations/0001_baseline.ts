import type { Migration } from '../lib/migration'

/**
 * Marks the current schema (Goal / Task / Completion with a done|failed
 * status + note) as the starting point for migration tracking. No data
 * changes - every schema change from here on ships as its own migration
 * file instead of a destructive reseed.
 */
export const migration: Migration = {
  id: '0001_baseline',
  description: 'Establish migration tracking for the existing schema',
  up: async () => {},
}
