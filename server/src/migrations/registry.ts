import type { Migration } from '../lib/migration'
import { migration as m0001 } from './0001_baseline'
import { migration as m0002 } from './0002_task_order'
import { migration as m0003 } from './0003_task_frequency'
import { migration as m0004 } from './0004_goal_start_date'
import { migration as m0005 } from './0005_goal_categories'
import { migration as m0006 } from './0006_task_unit_ids'
import { migration as m0007 } from './0007_tracking_unit_order'
import { migration as m0008 } from './0008_goal_order'
import { migration as m0009 } from './0009_task_day_resolution'
import { migration as m0010 } from './0010_task_limit_direction'
import { migration as m0011 } from './0011_special_day_categories'
import { migration as m0012 } from './0012_task_limit_measure'

/**
 * Run in array order. Append new migrations to the end - never reorder or
 * edit a migration that has already shipped, since it may have already run
 * against the real database.
 */
export const migrations: Migration[] = [
  m0001,
  m0002,
  m0003,
  m0004,
  m0005,
  m0006,
  m0007,
  m0008,
  m0009,
  m0010,
  m0011,
  m0012,
]
