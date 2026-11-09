import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import Timeline, {
  DateHeader,
  SidebarHeader,
  TimelineHeaders,
  TimelineMarkers,
  TodayMarker,
  type ReactCalendarTimelineProps,
} from 'react-calendar-timeline'
import 'react-calendar-timeline/style.css'
import type { SpecialDayHue, SpecialDayOccurrence } from '../api/specialDays'
import type { CompletionStatus, TrackerGoal } from '../api/tracker'
import { useSetRangeCompletion } from '../hooks/useTracker'
import { useDeleteTask } from '../hooks/useTasks'
import { useUpdateGoal } from '../hooks/useGoals'
import { useTimelinePan } from '../hooks/useTimelinePan'
import {
  GOAL_ROW,
  TASK_ROW,
  useTimelineRows,
  type RowGroup,
  type SortOrder,
  type TimelineRowItem,
} from '../hooks/useTimelineRows'
import { SpecialDaysDialog } from './SpecialDaysDialog'
import { dayCount, dayStart, isWeekend, shiftDay, toDayKey, todayKey, weekdayLabel } from '../lib/date'
import { writeTimelineView } from '../lib/timelineView'
import {
  CheckedBoxIcon,
  CheckedRadioIcon,
  PlusIcon,
  UncheckedBoxIcon,
  UncheckedRadioIcon,
} from './icons'
import { AddTaskDialog } from './AddTaskDialog'
import { GoalCategoriesDialog } from './GoalCategoriesDialog'
import { ResolveGoalDialog } from './ResolveGoalDialog'
import { RowMenu } from './RowMenu'

// No right sidebar (the Σ column was dropped) - the space goes to the left one
// instead, wide enough that a goal's title, rate, and actions fit on one line.
export const SIDEBAR = 290

/** A day column exactly as wide as a task row is tall (TASK_ROW), so a tick cell
 *  comes out square. Keep the two in step. It's also the floor the wrapper's
 *  minimum width is built from: a viewport too narrow for the window scrolls
 *  sideways rather than squashing the cells out of square. OverviewPage sizes
 *  the opening window against it. */
export const DAY_WIDTH = TASK_ROW

/** A tinted day column: a work-free public holiday, or time off in its category's hue. */
interface DayTint {
  holiday: boolean
  hue: SpecialDayHue
}

function tintOf(tint: DayTint | undefined): 'holiday' | 'band' | undefined {
  if (!tint) return undefined
  return tint.holiday ? 'holiday' : 'band'
}

/** The library sets its blue-bar look as inline style, so a class can't win
 *  against it. Hoisted: itemRenderer runs per item on every relayout. */
const TICK_STYLE: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'inherit',
  fontSize: 'inherit',
  cursor: 'default',
  // Must stay above .rct-hl-* (z-index 40) or the row background intercepts
  // the click before it reaches the tick.
  zIndex: 80,
}

/** Merged over the positioning the library hands its marker renderer. */
const TODAY_LINE_STYLE: CSSProperties = {
  width: 2,
  background: 'var(--accent)',
  opacity: 0.55,
}

/** Same rationale as TICK_STYLE - overrides the library's inline blue-bar look.
 *  This one spans its goal's whole stack of rows, so it lies *under* the ticks
 *  (z-index 80) and above the row and column backgrounds (40), and never takes
 *  a pointer: every tick in the goal is behind it otherwise. */
const GOAL_SPAN_STYLE: CSSProperties = {
  background: 'none',
  border: 'none',
  cursor: 'default',
  zIndex: 50,
  pointerEvents: 'none',
}

/** Same again for the special-days row. The chip itself is styled in CSS; this
 *  only strips the wrapper the library insists on colouring inline. */
const SPECIAL_STYLE: CSSProperties = {
  background: 'none',
  border: 'none',
  color: 'inherit',
  fontSize: 'inherit',
  cursor: 'default',
}

type TimelineProps = ReactCalendarTimelineProps<TimelineRowItem, RowGroup>
type ItemRendererProps = Parameters<NonNullable<TimelineProps['itemRenderer']>>[0]

export function TrackerTimeline({
  goals,
  days,
  from,
  to,
  viewFrom,
  viewTo,
  sortOrder,
  isStatusVisible,
  occurrences,
}: {
  goals: TrackerGoal[]
  days: string[]
  from: string
  to: string
  /** The window to actually show on load. `from`/`to` cover everything there
   *  is - the fetch is no longer tied to the view - so this is purely where
   *  the canvas opens before the user pans it. */
  viewFrom: string
  viewTo: string
  sortOrder: SortOrder
  /** The sidebar's task-status filter, evaluated against each task's status
   *  today - the timeline's one visible "day" - to decide which task rows show. */
  isStatusVisible: (status: CompletionStatus | null) => boolean
  /** Holidays, birthdays, vacations and occasions for the loaded range - the
   *  independent row that sits above every task row. */
  occurrences: SpecialDayOccurrence[]
}) {
  const today = todayKey()
  const [managingSpecialDays, setManagingSpecialDays] = useState(false)
  const [addingTaskFor, setAddingTaskFor] = useState<TrackerGoal | null>(null)
  const [resolvingGoal, setResolvingGoal] = useState<TrackerGoal | null>(null)
  const [retaggingGoal, setRetaggingGoal] = useState<TrackerGoal | null>(null)
  const setCompletion = useSetRangeCompletion()
  const updateGoal = useUpdateGoal()
  const deleteTask = useDeleteTask()

  const { groups, items, statsByGoal } = useTimelineRows(
    goals,
    days,
    today,
    sortOrder,
    isStatusVisible,
    occurrences,
  )

  /**
   * Which days to tint, and in whose hue. Built once per change rather than
   * inside `verticalLineClassNamesForTime`, which runs per column on every
   * relayout.
   *
   * A holiday outranks time off on the same day: Christmas during a week off
   * is still Christmas. Bank days (`partial`) are deliberately absent - they're
   * shown as chips but never claimed to be days off.
   */
  const dayTints = useMemo(() => {
    const tints = new Map<string, DayTint>()
    for (const occurrence of occurrences) {
      const holiday = occurrence.source === 'holidays' && occurrence.workFree
      if (!holiday && !occurrence.band) continue
      const tint: DayTint = { holiday, hue: occurrence.category.color }
      for (
        let day = occurrence.startDate;
        day <= occurrence.endDate;
        day = shiftDay(day, 1)
      ) {
        if (holiday || !tints.has(day)) tints.set(day, tint)
      }
    }
    return tints
  }, [occurrences])

  // Today as a range: the day renderers below run per column per relayout,
  // where formatting a key to compare strings is pure overhead.
  const todayStart = dayStart(today)
  const tomorrowStart = dayStart(shiftDay(today, 1))

  // The full fetched extent - how far out the canvas can zoom, so it never
  // shows blank space past what's actually loaded.
  const dataStart = dayStart(days[0] ?? from)
  const dataEnd = dayStart(shiftDay(days[days.length - 1] ?? to, 1))
  // What's shown on load, free to travel from there: dragging pans it into
  // past or future days.
  const viewStart = dayStart(viewFrom)
  const viewEnd = dayStart(shiftDay(viewTo, 1))

  // Written on every window shown - initial load, pan, or wheel-zoom - so a
  // reload picks up wherever the canvas was left rather than snapping back
  // to the default. `viewEnd` is exclusive (midnight of the day after), so
  // it's stepped back a day before being turned into the label the range
  // actually ends on.
  const persistView = useCallback((start: number, end: number) => {
    writeTimelineView({
      from: toDayKey(new Date(start)),
      to: shiftDay(toDayKey(new Date(end)), -1),
    })
  }, [])

  const { timeline, setWrap, showWindow } = useTimelinePan<TimelineRowItem, RowGroup>(
    viewStart,
    viewEnd,
    persistView,
  )

  // Sized from the opening *view*, not from everything fetched. The canvas
  // always draws its current window across the full element width, so measuring
  // this against the whole loaded span would smear four weeks of days over a
  // element thousands of pixels wide.
  const minWidth = SIDEBAR + dayCount(viewFrom, viewTo) * DAY_WIDTH

  const toggle = useCallback(
    (item: Extract<TimelineRowItem, { kind: 'tick' }>) => {
      // A limit's days are judged from its readings; a click would only be refused.
      if (item.disabled || item.locked) return
      // Cycles unanswered -> done -> cleared. Failures are recorded on the Today
      // screen, where there's room to ask why, but they show up here.
      setCompletion.mutate({
        taskId: item.taskId,
        date: item.day,
        status: item.status ? null : 'done',
      })
    },
    [setCompletion],
  )

  const itemRenderer = useCallback(
    ({ item, getItemProps }: ItemRendererProps) => {
      if (item.kind === 'special') {
        const { key, ref, ...props } = getItemProps({
          className: 'tl-special',
          style: SPECIAL_STYLE,
        })

        return (
          <div {...props} ref={ref} key={key}>
            <div
              className="special-chip"
              data-hue={item.hue}
              data-work-free={item.workFree || undefined}
              data-partial={item.partial || undefined}
              title={item.title as string}
            >
              <span className="special-chip-label">{item.label}</span>
            </div>
          </div>
        )
      }

      if (item.kind === 'goalSpan') {
        const { key, ref, ...props } = getItemProps({
          className: 'tl-goal-span',
          style: {
            ...GOAL_SPAN_STYLE,
            // The library centres an item on the shared lineHeight rather than
            // on its own row: top = groupTop + (TASK_ROW - height) / 2. This
            // block is as tall as the goal's task rows, so that formula floats
            // it far above them - push it back down by that offset plus the
            // header row it starts under, landing its top edge on the first
            // tick row.
            transform: `translateY(${GOAL_ROW + (item.blockHeight - TASK_ROW) / 2}px)`,
          },
        })

        return (
          <div
            {...props}
            ref={ref}
            key={key}
            data-open-ended={item.openEnded || undefined}
            data-resolved={item.resolved || undefined}
          >
            {/* A rail, not a labelled block: the start and due dates read once,
                from the tooltip and the sidebar, rather than being drawn across
                the canvas above every tick in the goal. */}
            <div className="goal-span-bar" title={item.title as string} />
          </div>
        )
      }

      const { key, ref, ...props } = getItemProps({
        className: 'tl-tick',
        style: TICK_STYLE,
      })

      return (
        <div {...props} ref={ref} key={key} data-status={item.status ?? undefined}>
          <button
            type="button"
            className="tick"
            aria-label={`${item.taskTitle} on ${item.day}`}
            disabled={item.disabled}
            data-status={item.status ?? undefined}
            // Nobody actually answered this day - the resolver did. Marked so a
            // stretch of automatic fails doesn't read as a stretch of deliberate ones.
            data-auto={item.auto || undefined}
            data-paused={item.paused || undefined}
            data-locked={item.locked || undefined}
            aria-disabled={item.locked || undefined}
            // The library's own click path selects the item first and only fires
            // onItemClick on the second click, so the button owns this.
            onClick={() => toggle(item)}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {item.status === 'done' ? (
              item.once ? <CheckedRadioIcon /> : <CheckedBoxIcon />
            ) : item.status === 'failed' ? (
              '✕'
            ) : item.disabled || item.locked ? null : item.paused ? (
              // On vacation: nothing owed, so no empty box asking for an
              // answer - just a dash. Still clickable, since a tick counts.
              '–'
            ) : (
              // Unanswered but markable: the same empty box the Today screen
              // offers. A day still in the future gets nothing here - CSS draws
              // it as a dot instead, which says "scheduled, pending" without
              // spending a box on it. There are hundreds of them. A once task
              // gets a radio instead: it's answered one time, not every day.
              item.once ? <UncheckedRadioIcon /> : <UncheckedBoxIcon />
            )}
          </button>
        </div>
      )
    },
    [toggle],
  )

  const groupRenderer = useCallback(
    ({ group }: { group: RowGroup }) => {
      if (group.kind === 'special') {
        return (
          <div className="special-head">
            <span className="special-head-title">Special days</span>
            <button
              type="button"
              className="link-button special-head-add"
              aria-label="Add a birthday, vacation or occasion"
              title="Add a birthday, vacation or occasion"
              onClick={() => setManagingSpecialDays(true)}
            >
              <PlusIcon />
            </button>
          </div>
        )
      }

      if (group.kind === 'goal') {
        const stats = statsByGoal.get(group.goal.id)
        const resolved = group.goal.resolution !== null

        return (
          <div
            className="goal-head"
            data-resolved={resolved || undefined}
            data-overdue={stats?.overdue || undefined}
          >
            {/* Due date and full title live in the tooltip - a percentage next
                to "due 30.9.2026" left no room for the title on one line. */}
            <span
              className="goal-title"
              title={`${group.goal.title} — ${stats?.dueLabel ?? 'no due date'}`}
            >
              {group.goal.title}
            </span>
            <div className="goal-sub">
              <RowMenu
                label={`Actions for ${group.goal.title}`}
                items={[
                  { label: '+ Add task', onSelect: () => setAddingTaskFor(group.goal) },
                  { label: 'Edit categories', onSelect: () => setRetaggingGoal(group.goal) },
                  {
                    label: resolved ? 'Edit resolution' : 'Resolve',
                    onSelect: () => setResolvingGoal(group.goal),
                  },
                  // Only offered once it's resolved: archiving is how a
                  // finished goal leaves the screen, not how an active one does.
                  ...(resolved
                    ? [
                        {
                          label: 'Archive',
                          onSelect: () =>
                            updateGoal.mutate({ id: group.goal.id, status: 'archived' as const }),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
          </div>
        )
      }

      return (
        <div className="task-cell" data-resolved={group.goal.resolution !== null || undefined}>
          <span className="task-titles">
            <span className="task-title" title={group.task.title}>
              {group.task.title}
            </span>
          </span>
          <button
            type="button"
            className="link-button"
            aria-label={`Delete task ${group.task.title}`}
            onClick={() => deleteTask.mutate(group.task.id)}
          >
            ×
          </button>
        </div>
      )
    },
    [statsByGoal, updateGoal, deleteTask],
  )

  const verticalLineClassNamesForTime = useCallback(
    (start: number) => {
      const classes: string[] = []
      const weekday = new Date(start).getDay()
      if (isWeekend(weekday)) classes.push('tl-weekend')
      // The grid's only vertical rule. A line per day was three separator
      // systems deep (day, row, weekend tint) for one job; one line a week
      // gives the canvas its rhythm and lets the marks carry the rest.
      if (weekday === 1) classes.push('tl-week-start')
      const tint = dayTints.get(toDayKey(new Date(start)))
      if (tint) classes.push(tint.holiday ? 'tl-holiday' : 'tl-band', `hue-${tint.hue}`)
      if (start >= todayStart && start < tomorrowStart) classes.push('tl-today')
      return classes
    },
    [todayStart, tomorrowStart, dayTints],
  )

  // Only bail out when there's genuinely nothing to draw. The special-days row
  // belongs to no goal, so having no goals is no reason to hide someone's
  // birthdays - but an empty timeline with an empty row is just noise.
  if (goals.length === 0 && occurrences.length === 0) {
    return <p className="muted">No goals yet — add one from the sidebar, then give it some tasks.</p>
  }

  return (
    <>
      <div className="tracker-scroll">
        <div className="tl-wrap" ref={setWrap} style={{ minWidth }}>
          <Timeline<TimelineRowItem, RowGroup>
            ref={timeline}
            groups={groups}
            items={items}
            itemRenderer={itemRenderer}
            groupRenderer={groupRenderer}
            verticalLineClassNamesForTime={verticalLineClassNamesForTime}
            sidebarWidth={SIDEBAR}
            rightSidebarWidth={0}
            lineHeight={TASK_ROW}
            itemHeightRatio={1}
            stackItems={false}
            // Ticks are toggled by the button inside itemRenderer; letting the
            // library select them would also arm interact.js dragging.
            canMove={false}
            canResize={false}
            canChangeGroup={false}
            canSelect={false}
            defaultTimeStart={viewStart}
            defaultTimeEnd={viewEnd}
            maxZoom={dataEnd - dataStart}
            // Wheel and zoom move the window without going through the pan
            // handler, so the record of it is updated here.
            onTimeChange={(start, end) => showWindow(start, end)}
          >
            <TimelineHeaders className="tl-headers">
              <SidebarHeader>
                {({ getRootProps }) => (
                  <div {...getRootProps()} className="tl-corner">
                    Task
                  </div>
                )}
              </SidebarHeader>
              <DateHeader
                unit="day"
                height={40}
                intervalRenderer={({ getIntervalProps, intervalContext }) => {
                  // Straight off the timestamp: formatting a date here would run
                  // per column every time the header rebuilds.
                  const start = intervalContext.interval.startTime.valueOf()
                  const date = new Date(start)
                  const weekday = date.getDay()
                  const { key, ...intervalProps } = getIntervalProps()
                  return (
                    <div
                      {...intervalProps}
                      key={key}
                      className="day-head"
                      data-weekend={isWeekend(weekday) || undefined}
                      data-week-start={weekday === 1 || undefined}
                      data-tint={tintOf(dayTints.get(toDayKey(date)))}
                      data-hue={dayTints.get(toDayKey(date))?.hue}
                      data-today={
                        (start >= todayStart && start < tomorrowStart) || undefined
                      }
                    >
                      <span className="day-number">{date.getDate()}</span>
                      <span className="day-weekday">{weekdayLabel(weekday)}</span>
                    </div>
                  )
                }}
              />
            </TimelineHeaders>

            <TimelineMarkers>
              {/* The library's default renderer inline-styles this line 2px
                  black, which is invisible against the dark theme - hence its
                  own renderer rather than a class that can't outrank an inline
                  style. It's what marks today now that the column tint is gone. */}
              <TodayMarker>
                {({ styles }) => <div style={{ ...styles, ...TODAY_LINE_STYLE }} />}
              </TodayMarker>
            </TimelineMarkers>
          </Timeline>
        </div>
      </div>

      {managingSpecialDays && (
        <SpecialDaysDialog onClose={() => setManagingSpecialDays(false)} />
      )}

      {addingTaskFor && (
        <AddTaskDialog
          key={addingTaskFor.id}
          goals={[addingTaskFor]}
          onClose={() => setAddingTaskFor(null)}
        />
      )}

      {retaggingGoal && (
        <GoalCategoriesDialog
          key={retaggingGoal.id}
          goal={retaggingGoal}
          onClose={() => setRetaggingGoal(null)}
        />
      )}

      {resolvingGoal && (
        <ResolveGoalDialog
          key={resolvingGoal.id}
          goal={resolvingGoal}
          onClose={() => setResolvingGoal(null)}
        />
      )}
    </>
  )
}
