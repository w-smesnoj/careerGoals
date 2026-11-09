import { useMemo } from 'react'
import type { TimelineGroupBase, TimelineItemBase } from 'react-calendar-timeline'
import type { SpecialDayHue, SpecialDayOccurrence } from '../api/specialDays'
import type { CompletionStatus, TrackerGoal, TrackerTask } from '../api/tracker'
import { dayStart, formatDayShort, shiftDay } from '../lib/date'
import { goalStats, type GoalStats } from '../lib/goalStats'
import { isScheduledOn } from '../lib/schedule'
import { isPausedOn } from '../lib/vacation'

/** `TASK_ROW` doubles as the timeline's `lineHeight`, because item vertical
 *  centring is computed from that, not from the group height. */
export const TASK_ROW = 34
export const GOAL_ROW = 40
/** Shorter than a lane so a chip sits inside its row with air around it. */
export const SPECIAL_ITEM = 24

/** The special-days row is the one row that belongs to no goal, so its id is a
 *  constant rather than derived from anything. */
export const SPECIAL_ROW = 'special'

/** Goals can't nest in a timeline - groups are a flat list - so each goal
 *  contributes a header row followed by its task rows. */
export type RowGroup = TimelineGroupBase &
  (
    | { kind: 'special' }
    | { kind: 'goal'; goal: TrackerGoal }
    | { kind: 'task'; goal: TrackerGoal; task: TrackerTask }
  )

/** One day of one task, as a 24h block. */
export interface TickItem extends TimelineItemBase<number> {
  kind: 'tick'
  taskId: string
  taskTitle: string
  day: string
  status: CompletionStatus | null
  /** Resolved by the task's day resolution rather than answered by hand. */
  auto: boolean
  /** In the future - visible but not markable. */
  disabled: boolean
  /** A vacation day: not owed, though ticking it still counts. */
  paused: boolean
  /** Judged by the task's limit from its readings - shown, never clicked. */
  locked: boolean
  /** A once task - answered a single time, so drawn as a radio, not a checkbox. */
  once: boolean
}

/** One block per goal, spanning its start through its due date horizontally and
 *  its task rows vertically. It's a duration and a grouping, not a set of
 *  check-ins, so it's drawn as the tinted field the ticks sit on rather than as
 *  a row of its own - and it covers the ticks only, leaving the goal's own
 *  header row clear. */
export interface GoalSpanItem extends TimelineItemBase<number> {
  kind: 'goalSpan'
  goalId: string
  /** Height of those task rows, in px. `height` carries it to the library; this
   *  is the same number, typed, for the renderer that has to offset the block
   *  down past the goal's header row. */
  blockHeight: number
  /** No due date - the bar is clipped to the visible range rather than to a
   *  real end, so it's styled to read as open rather than as ending there. */
  openEnded: boolean
  /** The goal has been resolved: the bar is dimmed rather than removed. */
  resolved: boolean
}

/** One special day - a holiday, a birthday, a vacation - on the independent top row. */
export interface SpecialDayItem extends TimelineItemBase<number> {
  kind: 'special'
  /** Its category's colour. */
  hue: SpecialDayHue
  label: string
  /** A guaranteed day off - drawn with the work-free highlight. */
  workFree: boolean
  /** Observed but not a day off (Heiliger Abend, Silvester). */
  partial: boolean
}

export type TimelineRowItem = TickItem | GoalSpanItem | SpecialDayItem

/** 'grouped': goal-header rows with their tasks nested beneath, as today.
 *  'today': goal headers dropped, one flat row per task in the same
 *  cross-goal order the Today tab shows (drag order, tie-broken by created). */
export type SortOrder = 'grouped' | 'today'

function taskRow(goal: TrackerGoal, task: TrackerTask): RowGroup {
  return { id: `task:${task.id}`, title: task.title, height: TASK_ROW, kind: 'task', goal, task }
}

/** Same "status on the day it's shown" the status filter uses on the Today
 *  screen, projected onto the timeline's one visible "day": today. A task
 *  with nothing logged today reads as 'todo', same as an unanswered day
 *  there does. */
function isTaskVisibleToday(
  task: TrackerTask,
  today: string,
  isStatusVisible: (status: CompletionStatus | null) => boolean,
): boolean {
  return isStatusVisible(task.completions[today]?.status ?? null)
}

/** Always group index 0, so it renders directly under the day header and above
 *  every task row - in both sort orders. It sets `stackItems` for itself and
 *  declares no `height`, which is what lets the library grow the row to fit
 *  however many overlap: a vacation, a holiday inside it and a birthday all
 *  land in their own lane. */
function specialRow(): RowGroup {
  return { id: SPECIAL_ROW, title: 'Special days', kind: 'special', stackItems: true }
}

function buildGroups(
  goals: TrackerGoal[],
  sortOrder: SortOrder,
  today: string,
  isStatusVisible: (status: CompletionStatus | null) => boolean,
): RowGroup[] {
  if (sortOrder === 'today') {
    return [
      specialRow(),
      ...goals
        .flatMap((goal) => goal.tasks.map((task) => ({ goal, task })))
        .filter(({ task }) => isTaskVisibleToday(task, today, isStatusVisible))
        .sort(
          (a, b) => a.task.order - b.task.order || a.task.createdAt.localeCompare(b.task.createdAt),
        )
        .map(({ goal, task }) => taskRow(goal, task)),
    ]
  }

  return [
    specialRow(),
    ...goals.flatMap((goal): RowGroup[] => [
      { id: `goal:${goal.id}`, title: goal.title, height: GOAL_ROW, kind: 'goal', goal },
      ...goal.tasks
        .filter((task) => isTaskVisibleToday(task, today, isStatusVisible))
        .map((task) => taskRow(goal, task)),
    ]),
  ]
}

/** One bar per occurrence on the special row. Spans use the same next-midnight
 *  convention as ticks and goal bars - deliberately not `+24h`, since a DST day
 *  isn't 24 hours and the drift compounds across a long vacation. */
function buildSpecialItems(occurrences: SpecialDayOccurrence[]): SpecialDayItem[] {
  return occurrences.map((occurrence) => ({
    id: `special:${occurrence.id}`,
    group: SPECIAL_ROW,
    kind: 'special',
    hue: occurrence.category.color,
    label: occurrence.age === null ? occurrence.title : `${occurrence.title} (${occurrence.age})`,
    workFree: occurrence.workFree,
    partial: occurrence.partial,
    height: SPECIAL_ITEM,
    title:
      occurrence.startDate === occurrence.endDate
        ? `${occurrence.title} — ${formatDayShort(occurrence.startDate)}`
        : `${occurrence.title} — ${formatDayShort(occurrence.startDate)} to ${formatDayShort(occurrence.endDate)}`,
    start_time: dayStart(occurrence.startDate),
    end_time: dayStart(shiftDay(occurrence.endDate, 1)),
  }))
}

/** One item per day the task is due, from its effective start through the
 *  goal's due date if it has one (days outside either bound simply get no
 *  item); future days within that range still get an item but are marked
 *  disabled - visible, not markable. Plus one goal-span bar per goal, on the
 *  goal's own row. */
function buildItems(
  goals: TrackerGoal[],
  days: string[],
  today: string,
  sortOrder: SortOrder,
  isStatusVisible: (status: CompletionStatus | null) => boolean,
): TimelineRowItem[] {
  const items: TimelineRowItem[] = []
  // Laid out once rather than parsed twice per item. Not start + 24h: a DST day
  // isn't 24 hours long, and the drift compounds.
  const starts = days.map(dayStart)
  const ends = starts.slice(1)
  if (days.length > 0) ends.push(dayStart(shiftDay(days[days.length - 1], 1)))
  const lastVisibleDay = days[days.length - 1]

  for (const goal of goals) {
    // The later of the task's own creation and the goal's start (or, absent
    // one, the goal's own creation) - a task can't be markable before either
    // of the things it belongs to existed.
    const goalStartDay = (goal.startDate ?? goal.createdAt).slice(0, 10)
    const goalEndDay = goal.targetDate?.slice(0, 10) ?? null
    // No due date: the bar can't have a real end, so it's clipped to whatever
    // is currently visible and styled (openEnded) to read as ongoing.
    const spanEndDay =
      goalEndDay ?? (lastVisibleDay && lastVisibleDay > goalStartDay ? lastVisibleDay : goalStartDay)

    // The same filter buildGroups uses, so the block covers exactly the rows
    // that end up on screen - a goal whose tasks are filtered out shrinks to
    // its own row rather than tinting empty space.
    const visibleTasks = goal.tasks.filter((task) =>
      isTaskVisibleToday(task, today, isStatusVisible),
    )
    // The task rows only - the goal's own header row stays clear, so the block
    // wraps the ticks rather than the label above them. An explicit `height` on
    // a group pins that row's height, so a block taller than its own row
    // overlays the rows below instead of stretching the goal row to fit.
    const blockHeight = visibleTasks.length * TASK_ROW

    // No goal row exists to host this block in flat 'today' mode, and a goal
    // with no rows under it has no ticks to wrap.
    if (sortOrder === 'grouped' && blockHeight > 0) {
      items.push({
        id: `goalspan:${goal.id}`,
        group: `goal:${goal.id}`,
        kind: 'goalSpan',
        goalId: goal.id,
        height: blockHeight,
        blockHeight,
        openEnded: !goalEndDay,
        resolved: goal.resolution !== null,
        title: goalEndDay
          ? `${goal.title} — ${formatDayShort(goalStartDay)} to ${formatDayShort(goalEndDay)}`
          : `${goal.title} — started ${formatDayShort(goalStartDay)}, no due date`,
        start_time: dayStart(goalStartDay),
        end_time: dayStart(shiftDay(spanEndDay, 1)),
      })
    }

    for (const task of visibleTasks) {
      const createdDay =
        task.createdAt.slice(0, 10) > goalStartDay ? task.createdAt.slice(0, 10) : goalStartDay
      // A once task disappears from every day except the one it was resolved on.
      const onceResolved =
        task.frequency.type === 'once' && Object.keys(task.completions).length > 0

      for (let index = 0; index < days.length; index += 1) {
        const day = days[index]
        if (day < createdDay) continue
        if (goalEndDay && day > goalEndDay) continue
        if (!isScheduledOn(task.frequency, day)) continue
        const entry = task.completions[day]
        if (onceResolved && !entry) continue

        const status = entry?.status ?? null
        const paused = isPausedOn(task, day)
        const locked = task.limit !== null && task.limit !== undefined && day >= task.limit.since

        items.push({
          id: `${task.id}|${day}`,
          group: `task:${task.id}`,
          kind: 'tick',
          taskId: task.id,
          taskTitle: task.title,
          day,
          status,
          auto: entry?.auto ?? false,
          disabled: day > today,
          paused,
          locked,
          once: task.frequency.type === 'once',
          // `title` is what the library hands to the wrapper's title attribute.
          title:
            locked && entry?.note
              ? `${task.title} — ${day}: ${entry.note}`
              : status === 'failed' && entry?.note
              ? `${day} — failed: ${entry.note}`
              : paused && !status
                ? `${task.title} — ${day} (paused, on vacation)`
                : `${task.title} — ${day}`,
          start_time: starts[index],
          end_time: ends[index],
        })
      }
    }
  }

  return items
}

/** The timeline's rows, ticks, special-day bars, and per-goal sidebar figures. */
export function useTimelineRows(
  goals: TrackerGoal[],
  days: string[],
  today: string,
  sortOrder: SortOrder,
  isStatusVisible: (status: CompletionStatus | null) => boolean,
  occurrences: SpecialDayOccurrence[],
) {
  const groups = useMemo(
    () => buildGroups(goals, sortOrder, today, isStatusVisible),
    [goals, sortOrder, today, isStatusVisible],
  )
  const items = useMemo(
    (): TimelineRowItem[] => [
      ...buildSpecialItems(occurrences),
      ...buildItems(goals, days, today, sortOrder, isStatusVisible),
    ],
    [goals, days, today, sortOrder, isStatusVisible, occurrences],
  )

  // Precomputed, not derived in the row renderer: the library re-renders every
  // row whenever the groups change, and walking each task's schedule across the
  // goal's whole life there made a goal row cost O(tasks x days).
  const statsByGoal = useMemo(() => {
    const stats = new Map<string, GoalStats>()
    for (const goal of goals) stats.set(goal.id, goalStats(goal, today))
    return stats
  }, [goals, today])

  return { groups, items, statsByGoal }
}
