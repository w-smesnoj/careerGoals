import { CompletionModel } from '../models/completion.model'
import type { GoalDocument } from '../models/goal.model'
import { MeasurementModel } from '../models/measurement.model'
import { TaskModel, type TaskDocument, type TaskLimit } from '../models/task.model'
import { TrackingUnitModel, type UnitAggregation } from '../models/trackingUnit.model'
import { addDays, toDayKey, today, weekdayOf } from './date'
import { taskStartDay } from './dayResolution'
import { isScheduledOn } from './schedule'

/**
 * Limit tasks - "at most 4 coffees a day", "at most 3 meetings a week" - are
 * never ticked - and neither is an 'atLeast' target ("at least 7,000 steps").
 * Their days are judged from the unit's readings, wherever those were entered
 * (the tracking page, or another task's tick):
 *
 *  - nothing logged in the period  -> unanswered. Days at zero need a 0 logged,
 *    so forgetting to log can't pass for success.
 *  - the outcome is settled early  -> straight away: an 'atMost' total gone
 *    over fails, an 'atLeast' total reached is done. Neither can un-happen
 *    while the period runs, since readings only add up.
 *  - period over, otherwise        -> 'atMost' within is done, 'atLeast'
 *    short is failed.
 *  - period still open, otherwise  -> unanswered for now; Today shows the bar.
 *
 * A weekly average ("at least 8 h of sleep a night") is the exception to the
 * early settling: one good or bad night can still move it either way, so it
 * is judged only once its week is over, on the days that have a reading.
 *
 * A weekly limit is one verdict shared by every day of its Mon-Sun week, so a
 * week's rate weighs the same as a daily task's would.
 *
 * A daily limit can also ask for a second unit to be logged ("≥ 2 reviews,
 * and hours logged"): a day that would be done waits for that reading, and fails
 * if the day ends without one.
 *
 * Verdicts are stored as ordinary auto completions rather than computed per
 * screen, so every rate, the timeline and the heatmap read them unchanged.
 * syncLimitVerdicts re-derives them on each tracker read, the same way
 * sweepAutoResolutions runs - there is no scheduler.
 */

/** Monday of the week a day falls in - the calendar is Monday-first throughout. */
export function weekStart(day: string): string {
  return addDays(day, -((weekdayOf(day) + 6) % 7))
}

/** Floating sums of 2.6s drift (10.399999...); readings never carry more than 3 decimals. */
function tidy(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * Each day's figure for one unit over a span, by the unit's own aggregation:
 * the day's total, or its newest reading for a 'latest' unit (the same rule as
 * its chart). Days with no reading are absent, not 0.
 */
export async function dailyValues(
  unitId: TaskLimit['unitId'],
  aggregation: UnitAggregation,
  from: string,
  to: string,
): Promise<Map<string, number>> {
  const rows = await MeasurementModel.aggregate<{ _id: string; value: number }>([
    { $match: { unitId, date: { $gte: from, $lte: to } } },
    { $sort: { date: 1, measuredAt: -1 } },
    {
      $group: {
        _id: '$date',
        value: aggregation === 'sum' ? { $sum: '$value' } : { $first: '$value' },
      },
    },
  ])
  return new Map(rows.map((row) => [row._id, row.value]))
}

export interface PeriodUsage {
  /** The total so far - or, for an average, the mean of the days logged so far. */
  used: number
  /** Whether anything at all was logged in the period - a logged 0 counts. */
  hasData: boolean
  /** The period the day belongs to, inclusive. */
  from: string
  to: string
  /** The period is over, so a within-limit total is final. */
  final: boolean
}

/**
 * What a day's period has used so far. Readings past `now` can't exist, so the
 * span stops there. An average is rounded to the unit's own decimals, so the
 * verdict agrees with the figure the app shows for it.
 */
export function usageOn(
  limit: Pick<TaskLimit, 'period' | 'measure'>,
  day: string,
  values: ReadonlyMap<string, number>,
  now: string,
  decimals: number,
): PeriodUsage {
  const from = limit.period === 'day' ? day : weekStart(day)
  const to = limit.period === 'day' ? day : addDays(from, 6)

  let sum = 0
  let days = 0
  for (let date = from; date <= to && date <= now; date = addDays(date, 1)) {
    const value = values.get(date)
    if (value === undefined) continue
    sum += value
    days += 1
  }
  const factor = 10 ** decimals
  const used = limit.measure === 'average' && days > 0 ? Math.round((sum / days) * factor) / factor : tidy(sum)
  return { used, hasData: days > 0, from, to, final: to < now }
}

export function verdictOf(
  limit: Pick<TaskLimit, 'direction' | 'target' | 'measure'>,
  usage: PeriodUsage,
): 'done' | 'failed' | null {
  if (!usage.hasData) return null
  if (limit.measure === 'average') {
    if (!usage.final) return null
    const met = limit.direction === 'atLeast' ? usage.used >= limit.target : usage.used <= limit.target
    return met ? 'done' : 'failed'
  }
  if (limit.direction === 'atLeast') {
    if (usage.used >= limit.target) return 'done'
    return usage.final ? 'failed' : null
  }
  if (usage.used > limit.target) return 'failed'
  return usage.final ? 'done' : null
}

/** "5 / 4 coffees", "5720 / 7000 steps", "7.6 / 8 h average that week", "3 / 2 reviews, no hours" - the note a verdict carries. */
function noteOf(
  limit: Pick<TaskLimit, 'target' | 'period' | 'measure'>,
  usage: PeriodUsage,
  unit: { symbol: string } | undefined,
  missing?: { name: string; symbol: string },
): string {
  const symbol = unit?.symbol ? ` ${unit.symbol}` : ''
  const average = limit.measure === 'average' ? ' average' : ''
  const absent = missing ? `, no ${missing.symbol || missing.name.toLowerCase()}` : ''
  return `${usage.used} / ${limit.target}${symbol}${average}${limit.period === 'week' ? ' that week' : ''}${absent}`
}

/** The days a limit judges: from when it took effect, to today or the goal's due date. */
function judgedSpan(task: TaskDocument, goal: GoalDocument, now: string) {
  const limit = task.limit as TaskLimit
  const opened = taskStartDay(task, goal)
  const start = opened > limit.since ? opened : limit.since
  const dueDay = goal.targetDate ? toDayKey(goal.targetDate) : null
  const end = dueDay && dueDay < now ? dueDay : now
  return start > end ? null : { start, end }
}

/**
 * Brings every limit task's stored verdicts in line with its unit's readings:
 * writes the days that have a verdict, and clears the ones that no longer do
 * (a reading edited back under the limit, or deleted).
 *
 * Only days from the limit's `since` are touched - see TaskLimit.
 */
export async function syncLimitVerdicts(goals: GoalDocument[]): Promise<void> {
  const tasks = await TaskModel.find({ archived: false, limit: { $ne: null } })
  if (tasks.length === 0) return

  const now = today()
  const goalById = new Map(goals.map((goal) => [String(goal._id), goal]))
  const units = await TrackingUnitModel.find({
    _id: {
      $in: tasks.flatMap((task) => {
        const limit = task.limit as TaskLimit
        return limit.alsoLoggedUnitId ? [limit.unitId, limit.alsoLoggedUnitId] : [limit.unitId]
      }),
    },
  }).select('name symbol decimals aggregation')
  const unitById = new Map(units.map((unit) => [String(unit._id), unit]))

  const timestamp = new Date()

  await Promise.all(
    tasks.map(async (task) => {
      const limit = task.limit as TaskLimit
      const goal = goalById.get(String(task.goalId))
      if (!goal) return
      const span = judgedSpan(task, goal, now)
      if (!span) return
      const unit = unitById.get(String(limit.unitId))
      // A unit in use by a limit can't be deleted, so this is only ever a race.
      if (!unit) return
      const alsoUnit = limit.alsoLoggedUnitId ? unitById.get(String(limit.alsoLoggedUnitId)) : undefined

      const [values, alsoValues, existing] = await Promise.all([
        // From the Monday of the first judged week, so a weekly total counts
        // readings from before `since` that fall in the same week.
        dailyValues(limit.unitId, unit.aggregation, weekStart(span.start), now),
        alsoUnit ? dailyValues(alsoUnit._id, alsoUnit.aggregation, span.start, now) : null,
        CompletionModel.find({
          taskId: task._id,
          date: { $gte: span.start, $lte: span.end },
        }).select('date status note'),
      ])

      const desired = new Map<string, { status: 'done' | 'failed'; note: string }>()
      for (let day = span.start; day <= span.end; day = addDays(day, 1)) {
        if (!isScheduledOn(task.frequency, day)) continue
        const usage = usageOn(limit, day, values, now, unit.decimals)
        const verdict = verdictOf(limit, usage)
        const missing = verdict === 'done' && alsoUnit && !alsoValues?.has(day) ? alsoUnit : undefined
        // Reached but the other unit isn't logged: open today, failed once the day is over.
        const status = missing ? (usage.final ? 'failed' : null) : verdict
        if (status) {
          desired.set(day, { status, note: noteOf(limit, usage, unit, missing) })
        }
      }

      const existingByDay = new Map(existing.map((completion) => [completion.date, completion]))
      const stale = existing.filter((completion) => !desired.has(completion.date))
      const writes = [...desired].filter(([day, verdict]) => {
        const current = existingByDay.get(day)
        return !current || current.status !== verdict.status || current.note !== verdict.note
      })

      if (stale.length > 0) {
        await CompletionModel.deleteMany({ _id: { $in: stale.map((completion) => completion._id) } })
      }
      if (writes.length > 0) {
        // timestamps: false - see sweepAutoResolutions; both stamps are set by hand.
        await CompletionModel.bulkWrite(
          writes.map(([date, verdict]) => ({
            updateOne: {
              filter: { taskId: task._id, date },
              update: {
                $set: { status: verdict.status, note: verdict.note, auto: true, updatedAt: timestamp },
                $setOnInsert: { taskId: task._id, date, createdAt: timestamp },
              },
              upsert: true,
            },
          })),
          { ordered: false, timestamps: false },
        )
      }
    }),
  )
}
