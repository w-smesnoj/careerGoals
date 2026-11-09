import { Schema, model, type InferSchemaType, type HydratedDocument, type Types } from 'mongoose'
import { DAY_PATTERN } from '../lib/date'

export const taskFrequencyTypes = ['once', 'daily', 'weekly', 'monthly', 'everyNDays'] as const

/**
 * `once` is not date-keyed - it stays an outstanding to-do on every day until
 * it has a completion, then only shows on whichever day that completion actually
 * landed on. If its goal has a target date, the single chance runs out when that
 * date passes (see dayResolution); without one it waits indefinitely.
 *
 * `everyNDays` is the one frequency that needs a point to count from: a weekday
 * alone doesn't say *which* Monday a cadence starts on. The weekday the user
 * picks is resolved once, at save time, into the concrete `anchorDate` stored
 * here (see resolveAnchorDate in task.controller.ts, its only producer). Keeping
 * that date inside the frequency is what lets isScheduledOn stay a pure
 * (frequency, day) predicate instead of needing the task and goal threaded
 * through all ~10 of its call sites.
 */
export type TaskFrequency =
  | { type: 'once' }
  | { type: 'daily' }
  | { type: 'weekly'; daysOfWeek: number[] }
  | { type: 'monthly'; daysOfMonth: number[] }
  | { type: 'everyNDays'; intervalDays: number; startWeekday: number; anchorDate: string }

const frequencySchema = new Schema(
  {
    type: { type: String, enum: taskFrequencyTypes, required: true, default: 'daily' },
    /** 0 (Sun) .. 6 (Sat). Required, non-empty, unique when type is 'weekly'. */
    daysOfWeek: { type: [{ type: Number, min: 0, max: 6 }], default: undefined },
    /**
     * 1-31. Required, non-empty, unique when type is 'monthly'. A month with
     * fewer days than a selected value simply has no occurrence that month
     * (no clamping to month-end).
     */
    daysOfMonth: { type: [{ type: Number, min: 1, max: 31 }], default: undefined },
    /**
     * The cadence of an 'everyNDays' task. From 2, because 1 is exactly `daily`
     * and there is no sense in having two ways to say it; capped so a stray
     * value can't turn a scheduling scan into a long loop.
     */
    intervalDays: { type: Number, min: 2, max: 365, default: undefined },
    /** 0 (Sun) .. 6 (Sat): the weekday `anchorDate` was resolved onto. */
    startWeekday: { type: Number, min: 0, max: 6, default: undefined },
    /**
     * The first occurrence, and what every later one counts from. Server-owned
     * and fixed once written - moving the goal's startDate afterwards leaves
     * the cadence where it is.
     */
    anchorDate: {
      type: String,
      default: undefined,
      match: [DAY_PATTERN, 'anchorDate must be formatted as YYYY-MM-DD'],
    },
  },
  { _id: false },
)

frequencySchema.pre('validate', function (next) {
  if (this.type === 'weekly') {
    if (!this.daysOfWeek?.length) {
      return next(new Error('weekly frequency requires at least one day of week'))
    }
    if (new Set(this.daysOfWeek).size !== this.daysOfWeek.length) {
      return next(new Error('daysOfWeek must be unique'))
    }
    this.daysOfMonth = undefined
    this.intervalDays = undefined
    this.startWeekday = undefined
    this.anchorDate = undefined
  } else if (this.type === 'monthly') {
    if (!this.daysOfMonth?.length) {
      return next(new Error('monthly frequency requires at least one day of month'))
    }
    if (new Set(this.daysOfMonth).size !== this.daysOfMonth.length) {
      return next(new Error('daysOfMonth must be unique'))
    }
    this.daysOfWeek = undefined
    this.intervalDays = undefined
    this.startWeekday = undefined
    this.anchorDate = undefined
  } else if (this.type === 'everyNDays') {
    if (!this.intervalDays) {
      return next(new Error('everyNDays frequency requires an interval'))
    }
    if (this.startWeekday === undefined || this.startWeekday === null) {
      return next(new Error('everyNDays frequency requires a start weekday'))
    }
    if (!this.anchorDate) {
      return next(new Error('everyNDays frequency requires an anchor date'))
    }
    this.daysOfWeek = undefined
    this.daysOfMonth = undefined
  } else {
    this.daysOfWeek = undefined
    this.daysOfMonth = undefined
    this.intervalDays = undefined
    this.startWeekday = undefined
    this.anchorDate = undefined
  }
  next()
})

export const taskDayResolutions = ['open', 'fail', 'carry'] as const

/**
 * What becomes of a scheduled day the user never answered.
 *
 * 'open'  - nothing; it stays unanswered forever. The original behaviour, and
 *           the default, so no existing task changes by having this field.
 * 'fail'  - once the day is past it resolves to a failed completion.
 * 'carry' - the day stays outstanding and stacks forward, surfacing on Today
 *           as a due item until it's answered on its own date. Once the goal's
 *           target date has passed, whatever is still outstanding fails.
 *
 * The rule itself lives in server/src/lib/dayResolution.ts.
 * Mirrored in src/api/tasks.ts on the frontend - keep the two in sync by hand.
 */
export type TaskDayResolution = (typeof taskDayResolutions)[number]

export const taskLimitPeriods = ['day', 'week'] as const
export type TaskLimitPeriod = (typeof taskLimitPeriods)[number]

/** 'atMost' caps a total (coffees); 'atLeast' asks for one (steps). */
export const taskLimitDirections = ['atMost', 'atLeast'] as const
export type TaskLimitDirection = (typeof taskLimitDirections)[number]

/**
 * 'total' adds the period's readings up (coffees a week). 'average' takes each
 * logged day's figure - its total, or its latest reading for a 'latest' unit -
 * and averages them over the week (hours of sleep a night).
 */
export const taskLimitMeasures = ['total', 'average'] as const
export type TaskLimitMeasure = (typeof taskLimitMeasures)[number]

/**
 * "At most / at least `target` of a unit's day figure", "... of a 'sum' unit
 * per Mon-Sun week", or of any unit's daily figure averaged over a week. A task carrying one isn't
 * ticked at all: its days are judged from the unit's readings, and nothing
 * logged leaves the day unanswered. The rule lives in lib/limits.ts.
 *
 * `since` is the day the limit took effect. Days before it keep whatever they
 * were answered with by hand, so turning a plain daily tick into a limit
 * doesn't rewrite its history.
 *
 * Mirrored in src/api/tasks.ts - keep the two in sync by hand.
 */
export interface TaskLimit {
  unitId: Types.ObjectId
  direction: TaskLimitDirection
  target: number
  period: TaskLimitPeriod
  /** 'average' only ever goes with a 'week' period. */
  measure: TaskLimitMeasure
  /**
   * A second unit that must also have a reading that day before it counts as
   * done ("≥ 2 reviews, and hours logged"). Its value doesn't matter. Only
   * with a 'day' period.
   */
  alsoLoggedUnitId: Types.ObjectId | null
  since: string
}

const limitSchema = new Schema(
  {
    unitId: { type: Schema.Types.ObjectId, ref: 'TrackingUnit', required: true },
    direction: { type: String, enum: taskLimitDirections, required: true, default: 'atMost' },
    target: { type: Number, required: true, min: 0 },
    period: { type: String, enum: taskLimitPeriods, required: true },
    measure: { type: String, enum: taskLimitMeasures, required: true, default: 'total' },
    alsoLoggedUnitId: { type: Schema.Types.ObjectId, ref: 'TrackingUnit', default: null },
    since: {
      type: String,
      required: true,
      match: [DAY_PATTERN, 'since must be formatted as YYYY-MM-DD'],
    },
  },
  { _id: false },
)

/**
 * A Task belongs to exactly one Goal and has no due date of its own beyond
 * what its frequency implies. Whether it was done on a given day lives in
 * Completion.
 */
const taskSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    goalId: { type: Schema.Types.ObjectId, ref: 'Goal', required: true, index: true },
    archived: { type: Boolean, default: false },
    /** Global row position on the day screen; lower sorts first. */
    order: { type: Number, required: true, default: 0, index: true },
    frequency: { type: frequencySchema, required: true, default: () => ({ type: 'daily' }) },
    /**
     * Tangible things this task measures. Ticking it off asks for a value for
     * each, which is recorded as a Measurement carrying this task's id.
     * Entering one is optional - the sheet can be skipped.
     */
    unitIds: { type: [{ type: Schema.Types.ObjectId, ref: 'TrackingUnit' }], default: [] },
    dayResolution: {
      type: String,
      enum: taskDayResolutions,
      required: true,
      default: 'open',
    },
    /**
     * The last day the auto-resolver has already dealt with (YYYY-MM-DD), or
     * null if it never has. It never looks at a day at or before this.
     *
     * That watermark is what keeps the resolver both cheap - it walks only the
     * days that have appeared since it last ran - and non-intrusive: a day
     * whose automatic answer you cleared by hand is never revisited, so it
     * can't come back on the next request.
     */
    autoResolvedThrough: {
      type: String,
      default: null,
      match: [DAY_PATTERN, 'autoResolvedThrough must be formatted as YYYY-MM-DD'],
    },
    /** Judged from a unit's readings instead of ticked - see TaskLimit. */
    limit: { type: limitSchema, default: null },
  },
  {
    timestamps: true,
    toJSON: {
      versionKey: false,
      transform(_doc, ret: Record<string, unknown>) {
        ret.id = String(ret._id)
        ret.goalId = String(ret.goalId)
        if (Array.isArray(ret.unitIds)) ret.unitIds = ret.unitIds.map(String)
        const limit = ret.limit as { unitId?: unknown; alsoLoggedUnitId?: unknown } | null | undefined
        if (limit?.unitId) limit.unitId = String(limit.unitId)
        if (limit?.alsoLoggedUnitId) limit.alsoLoggedUnitId = String(limit.alsoLoggedUnitId)
        delete ret._id
        return ret
      },
    },
  },
)

taskSchema.index({ goalId: 1, createdAt: 1 })

// InferSchemaType can't express frequency as a real discriminated union (it
// infers every field optional), and widens an enum to plain string - override
// both with the hand-authored types.
export type Task = Omit<
  InferSchemaType<typeof taskSchema>,
  'frequency' | 'dayResolution' | 'limit'
> & {
  frequency: TaskFrequency
  dayResolution: TaskDayResolution
  limit: TaskLimit | null
}
export type TaskDocument = HydratedDocument<Task>

// Passed explicitly so every query (find/findById/...) returns documents
// typed against our hand-authored Task union, not the schema's raw inference.
export const TaskModel = model<Task>('Task', taskSchema)
