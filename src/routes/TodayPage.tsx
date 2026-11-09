import { type ReactNode, useMemo, useRef, useState } from 'react'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  type DragEndEvent,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { SpecialDayOccurrence } from '../api/specialDays'
import type { DayTask, DayUnitReading, DueTask, UpcomingTask } from '../api/tracker'
import type { TaskNote } from '../api/taskNotes'
import { tasksApi } from '../api/tasks'
import { useDay, useReorderDayTasks, useSetDayCompletion } from '../hooks/useDay'
import { useGoals } from '../hooks/useGoals'
import { usePrefs } from '../hooks/usePrefs'
import {
  useCreateTaskNote,
  useDeleteTaskNote,
  useTaskNotes,
  useUpdateTaskNote,
} from '../hooks/useTaskNotes'
import { useFabAction } from '../hooks/useFabAdd'
import { useSpecialDayOccurrences } from '../hooks/useSpecialDayOccurrences'
import { occurrencesOn, specialLabel } from '../lib/specialDays'
import { TaskCheck, DayRing, LimitGauge, SwipeRow } from '../components/DayRowControls'
import { SpecialDayGlyph } from '../components/specialDayGlyphs'
import { FailDialog } from '../components/FailDialog'
import { LogMeasurementsDialog } from '../components/LogMeasurementsDialog'
import { TaskSheet } from '../components/TaskSheet'
import { TitleMenu } from '../components/TitleMenu'
import { TaskNoteDialog } from '../components/TaskNoteDialog'
import { LimitDetail } from '../components/LimitDetail'
import { DayNav } from '../components/DayNav'
import {
  WEEK_START,
  todayKey,
  dayCount,
  dayStart,
  formatDayLong,
  formatRelativeDays,
  formatWeekday,
  shiftDay,
} from '../lib/date'
import { formatMeasurement } from '../lib/units'
import { readStored, writeStored } from '../lib/storage'
import { counted, frequencyLabel, limitVerdict } from '../lib/taskLabels'
import { doneAction, failedAction } from '../lib/swipeActions'
import { usePush } from '../lib/navigation'
import { hideTask, refetchEverything } from '../lib/optimistic'
import { undoable } from '../lib/toast'

/** A `?date=` worth opening on: a real day key (the goal calendar links here). */
function dateParam(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : null
}

/**
 * A due row on its way to the fail or log sheet. Nothing was ever recorded on
 * a day that was never answered, so it arrives as an empty day - and it
 * answers its own date rather than the one on screen.
 */
function asAnswerTarget(task: DueTask): { task: DayTask; date: string } {
  return {
    task: { ...task, dayResolution: 'carry', status: null, note: '', measurements: {} },
    date: task.dueDate,
  }
}

/**
 * A one-off task's countdown to its goal's due date, counted from the day on
 * screen like everything else on it. Quiet while there's time, orange in the
 * last two days, red once it's due - or past it, for a task left open after
 * its date (only an 'open' resolution keeps it on the list that long).
 */
function DeadlineLabel({ deadline, from }: { deadline: string; from: string }) {
  // `dayCount` counts inclusively and bottoms out at 0, so the overdue side
  // counts the other way round.
  const daysLeft = deadline >= from ? dayCount(from, deadline) - 1 : 1 - dayCount(deadline, from)
  const text =
    daysLeft < 0
      ? `${counted(-daysLeft, 'day')} overdue`
      : daysLeft === 0
        ? 'Due today'
        : `${counted(daysLeft, 'day')} left`

  return (
    <span
      className="deadline-label"
      data-urgency={daysLeft <= 0 ? 'now' : daysLeft <= 2 ? 'soon' : undefined}
      title={`Due ${formatDayLong(deadline)}`}
    >
      {text}
    </span>
  )
}

/**
 * One task on the day, on one line: the check, the title, and - only when
 * there's something worth a glance - a short detail at the trailing edge.
 * Everything else about the task (its goal, how often it repeats) lives one
 * tap away in the title's menu, so the list reads as a list of things to do.
 *
 * Open rows are reordered by pressing and holding anywhere on them, and
 * answered by swiping; answered rows sit in the Done group, where they're
 * neither.
 */
function TaskRow({
  task,
  date,
  notes,
  unitReadings,
  answered,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onAddNote,
  onEditTask,
  onShowGoal,
  onArchive,
  onNoteClick,
  onCheck,
  onCross,
  onReset,
  onMeasure,
}: {
  task: DayTask
  /** The day on screen - what a deadline counts down from. */
  date: string
  notes: TaskNote[]
  /** Every reading recorded today, keyed by unit id - a 'sum' unit's value
   *  totals these up instead of showing just this task's own reading. */
  unitReadings: Record<string, DayUnitReading[]>
  /** In the Done group: not sortable, not swipeable. */
  answered: boolean
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onAddNote: () => void
  onEditTask: () => void
  onShowGoal: () => void
  onArchive: () => void
  onNoteClick: (note: TaskNote) => void
  onCheck: () => void
  onCross: () => void
  onReset: () => void
  onMeasure: () => void
}) {
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: answered,
  })

  // Picked up, a row lifts slightly towards the finger - the same cue iOS
  // gives a list row being reordered.
  const style = {
    transform:
      [CSS.Transform.toString(transform), isDragging ? 'scale(1.02)' : null]
        .filter(Boolean)
        .join(' ') || undefined,
    transition,
  }

  // The title menu is portalled out of the row, so it needs the button itself
  // to position against.
  const titleButtonRef = useRef<HTMLButtonElement>(null)

  const freqLabel = frequencyLabel(task.frequency)
  // Ticked once and gone, rather than a habit that comes round again.
  const once = task.frequency.type === 'once'
  // Its goal has been resolved: the row stays, dimmed, until it's archived.
  const resolved = task.goalStatus === 'completed'
  // Judged from a unit's readings (see LimitDetail): never ticked, so none of
  // the answer controls apply - the verdict just shows up as the row's detail.
  const limit = task.limit ?? null
  const isOpen = !limit && task.status !== 'done' && task.status !== 'failed'
  // On vacation and not yet answered: shown, still tickable, but not owed.
  const pausedOpen = Boolean(task.paused) && isOpen

  // Only units that actually have a reading; an attached-but-empty one would
  // otherwise render as a bare symbol. A 'sum' unit shows the whole day's
  // total - readings typed by hand on the tracking page, or by ticking a
  // different task, count too - while 'latest' shows this task's own value,
  // falling back to the day's most recent reading from anywhere (e.g. last
  // night's sleep typed on the tracking page).
  const recorded = task.units
    .map((unit) => {
      const readings = unitReadings[unit.id] ?? []
      if (unit.aggregation === 'sum') {
        if (readings.length === 0) return null
        const total = readings.reduce((sum, reading) => sum + reading.value, 0)
        return formatMeasurement(total, unit)
      }
      const value = task.measurements[unit.id]?.value ?? readings.at(-1)?.value
      return value === undefined ? null : formatMeasurement(value, unit)
    })
    .filter((text): text is string => text !== null)

  const state = task.status === 'done' ? 'done' : task.status === 'failed' ? 'failed' : 'open'

  // What the menu says about the task before offering anything - the context
  // the row no longer spells out. A once task names itself, since its circle
  // is the only other hint, and gives the date its label only counts to.
  const menuCaption = [
    task.goalTitle,
    once ? 'Once' : freqLabel,
    task.deadline ? `due ${formatDayLong(task.deadline)}` : null,
    resolved ? 'goal resolved' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  // At most one trailing detail, in order of what matters most.
  let detail: ReactNode = null
  if (limit) {
    detail = <LimitDetail limit={limit} />
  } else if (!isOpen && task.units.length > 0) {
    // A failed row edits through the fail sheet, which carries the same
    // fields - going via the log sheet would flip the day back to done.
    detail = (
      <button
        type="button"
        className="day-item-detail"
        data-empty={recorded.length === 0 || undefined}
        onClick={task.status === 'failed' ? onCross : onMeasure}
      >
        {recorded.length > 0 ? recorded.join(' · ') : 'Add value'}
      </button>
    )
  } else if (pausedOpen) {
    detail = <span className="day-item-detail">Paused</span>
  } else if (resolved) {
    detail = <span className="day-item-detail">Resolved</span>
  } else if (isOpen && task.deadline) {
    detail = <DeadlineLabel deadline={task.deadline} from={date} />
  }

  const failedNote = !limit && task.status === 'failed' && task.note ? task.note : null

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="ios-row day-item"
      data-status={task.status ?? 'open'}
      data-resolved={resolved || undefined}
      data-paused={pausedOpen || undefined}
      data-dragging={isDragging || undefined}
    >
      <SwipeRow
        enabled={isOpen && !answered}
        lifted={isDragging}
        trailing={doneAction(onCheck)}
        leading={failedAction(onCross)}
        contentProps={answered ? undefined : listeners}
      >
        <div className="day-item-row">
          {limit ? (
            <LimitGauge fraction={limitVerdict(limit).fill} bad={limitVerdict(limit).bad} />
          ) : (
            <TaskCheck
              state={state}
              paused={pausedOpen}
              once={once}
              label={
                state === 'open'
                  ? `Mark ${task.title} done`
                  : state === 'done'
                    ? `Reset ${task.title}`
                    : `Edit ${task.title}`
              }
              onClick={state === 'open' ? onCheck : state === 'done' ? onReset : onCross}
            />
          )}

          <div className="day-item-text">
            <div className="day-item-title-row">
              <button
                ref={titleButtonRef}
                type="button"
                className="day-item-title-btn"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={onToggleMenu}
              >
                <span className="day-item-title">{task.title}</span>
              </button>
              {menuOpen && (
                <TitleMenu
                  anchorRef={titleButtonRef}
                  heading={task.title}
                  caption={menuCaption}
                  onAddNote={onAddNote}
                  onEditTask={onEditTask}
                  onShowGoal={onShowGoal}
                  onArchive={resolved ? onArchive : undefined}
                  onClose={onCloseMenu}
                />
              )}
            </div>
          </div>

          {detail}
        </div>

        {(failedNote || notes.length > 0) && (
          <div className="day-item-notes">
            {failedNote && (
              <button type="button" className="day-item-note" onClick={onCross}>
                {failedNote}
              </button>
            )}
            {notes.map((note) => (
              <button
                key={note.id}
                type="button"
                className="task-note"
                onClick={() => onNoteClick(note)}
              >
                {note.text}
              </button>
            ))}
          </div>
        )}
      </SwipeRow>
    </li>
  )
}

/**
 * A day a carry-over task never got answered, surfaced on today's screen and
 * answered on its own date. Same gestures as a day row, but no reordering,
 * no title menu and no notes: it belongs to another day, and all that's being
 * asked for here is the answer it never got.
 */
function DueRow({
  task,
  onCheck,
  onCross,
}: {
  task: DueTask
  onCheck: () => void
  onCross: () => void
}) {
  return (
    <li
      className="ios-row day-item due-item"
      data-status="open"
      data-resolved={task.goalStatus === 'completed' || undefined}
    >
      <SwipeRow enabled trailing={doneAction(onCheck)} leading={failedAction(onCross)}>
        <div className="day-item-row">
          <TaskCheck
            state="open"
            label={`Mark ${task.title} done for ${task.dueDate}`}
            onClick={onCheck}
          />
          <div className="day-item-text">
            <div className="day-item-title-row">
              <span className="day-item-title">{task.title}</span>
            </div>
            <span className="due-item-when">
              {formatDayLong(task.dueDate)} · {task.daysLate} {task.daysLate === 1 ? 'day' : 'days'} late
              {task.stacked > 1 && <span className="due-item-stacked"> · {task.stacked} days stacked</span>}
            </span>
          </div>
        </div>
      </SwipeRow>
    </li>
  )
}

/**
 * What today *is*, as opposed to what there is to do on it - a holiday, a
 * birthday, a day of a vacation. Information, never a task: there is nothing
 * to tick, and nothing here counts towards the day's figures.
 */
function DayInfoSection({ occurrences }: { occurrences: SpecialDayOccurrence[] }) {
  if (occurrences.length === 0) return null

  return (
    <section className="ios-section day-info">
      <ul className="ios-list">
        {occurrences.map((occurrence) => (
          <li key={occurrence.id} className="ios-row ios-row-static day-info-item">
            <span
              className="ios-icon-tile"
              data-hue={occurrence.category.color}
              title={occurrence.category.name}
            >
              <SpecialDayGlyph icon={occurrence.category.icon} />
            </span>
            <span className="ios-row-text">
              <span className="ios-row-title">{specialLabel(occurrence)}</span>
              {occurrence.note && <span className="ios-row-subtitle">{occurrence.note}</span>}
            </span>
            {occurrence.workFree && <span className="ios-row-detail">Work-free</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** What a carry-over task still owes, above the day's own list. */
function DueSection({
  due,
  onCheck,
  onCross,
}: {
  due: DueTask[]
  onCheck: (task: DueTask) => void
  onCross: (task: DueTask) => void
}) {
  if (due.length === 0) return null

  return (
    <section className="ios-section due-section">
      <h2 className="ios-section-title">
        Due <span className="ios-section-count">{due.length}</span>
      </h2>
      <ul className="ios-list day-list">
        {due.map((task) => (
          <DueRow
            key={task.id}
            task={task}
            onCheck={() => onCheck(task)}
            onCross={() => onCross(task)}
          />
        ))}
      </ul>
    </section>
  )
}

/**
 * A read-only preview row: no drag handle, no done/failed actions. Without a
 * `daysUntil` it says nothing about when - its day heading already does.
 */
function UpcomingRow({ task, daysUntil }: { task: UpcomingTask; daysUntil?: number }) {
  return (
    <li className="ios-row ios-row-static" data-resolved={task.goalStatus === 'completed' || undefined}>
      <span className="ios-row-text">
        <span className="ios-row-title">{task.title}</span>
      </span>
      {daysUntil !== undefined && (
        <span className="ios-row-detail" title={formatDayLong(task.dueDate)}>
          {formatRelativeDays(daysUntil)}
        </span>
      )}
    </li>
  )
}

/**
 * One of a future day's tasks. The day can't be answered yet - the server
 * refuses to record a day that hasn't happened (see requireTickableDay) - so
 * the row is a preview: no tick, no swipe, no drag handle.
 */
function PlannedRow({ task, date }: { task: DayTask; date: string }) {
  const freqLabel = frequencyLabel(task.frequency)

  return (
    <li className="ios-row ios-row-static" data-resolved={task.goalStatus === 'completed' || undefined}>
      <span className="ios-row-text">
        <span className="ios-row-title">{task.title}</span>
      </span>
      {task.deadline ? (
        <DeadlineLabel deadline={task.deadline} from={date} />
      ) : (
        freqLabel && <span className="ios-row-detail">{freqLabel}</span>
      )}
    </li>
  )
}

/** The same read-only shape as UpcomingRow, for a day that simply happens. */
function UpcomingSpecialRow({
  occurrence,
  daysUntil,
}: {
  occurrence: SpecialDayOccurrence
  daysUntil?: number
}) {
  return (
    <li className="ios-row ios-row-static">
      <span className="ios-icon-tile" data-hue={occurrence.category.color}>
        <SpecialDayGlyph icon={occurrence.category.icon} />
      </span>
      <span className="ios-row-text">
        <span className="ios-row-title">{specialLabel(occurrence)}</span>
      </span>
      {daysUntil !== undefined && (
        <span className="ios-row-detail" title={formatDayLong(occurrence.startDate)}>
          {formatRelativeDays(daysUntil)}
        </span>
      )}
    </li>
  )
}

/** One thing coming up - a task falling due or a special day beginning - on its day. */
type UpcomingEntry = { key: string; day: string; daysUntil: number } & (
  | { task: UpcomingTask; occurrence?: never }
  | { occurrence: SpecialDayOccurrence; task?: never }
)

/** `showWhen` for a row with no day heading above it to say how far off it is. */
function UpcomingEntryRow({ entry, showWhen }: { entry: UpcomingEntry; showWhen?: boolean }) {
  const daysUntil = showWhen ? entry.daysUntil : undefined
  return entry.task ? (
    <UpcomingRow task={entry.task} daysUntil={daysUntil} />
  ) : (
    <UpcomingSpecialRow occurrence={entry.occurrence} daysUntil={daysUntil} />
  )
}

/** Consecutive runs of entries sharing a day, for entries already sorted by day. */
function runsByDay(entries: UpcomingEntry[]) {
  const runs: { day: string; daysUntil: number; entries: UpcomingEntry[] }[] = []
  for (const entry of entries) {
    const last = runs.at(-1)
    if (last?.day === entry.day) last.entries.push(entry)
    else runs.push({ day: entry.day, daysUntil: entry.daysUntil, entries: [entry] })
  }
  return runs
}

/**
 * Weekly/monthly tasks not due today, grouped into This week, Next week and
 * Next month - the two weeks split further by day. Only the nearest group with
 * anything in it shows at first; farther ones reveal behind one "Show more",
 * skipping straight past an empty group.
 */
function UpcomingSection({
  upcoming,
  specials,
  today,
}: {
  upcoming: UpcomingTask[]
  specials: SpecialDayOccurrence[]
  today: string
}) {
  const [revealed, setRevealed] = useState(1)

  // Tasks and special days share the groups rather than getting their own
  // headings: "what's coming" is one question, and splitting it would bury a
  // birthday under a list of tasks.
  const groups = useMemo(() => {
    // `dayCount` counts inclusively, so today is 1 - and anything not in the
    // future belongs to the day screen above, not to Upcoming. Tasks are
    // measured from today too, not from the day in view, so they fall into
    // the same weeks as the special days beside them.
    const until = (day: string) => dayCount(today, day) - 1
    const entries: UpcomingEntry[] = [
      ...specials.map((occurrence) => ({
        key: occurrence.id,
        day: occurrence.startDate,
        daysUntil: until(occurrence.startDate),
        occurrence,
      })),
      ...upcoming.map((task) => ({
        key: task.id,
        day: task.dueDate,
        daysUntil: until(task.dueDate),
        task,
      })),
    ]
      .filter((entry) => entry.daysUntil >= 1)
      // Stable sort, so tasks keep the order the server sent them in within a day.
      .sort((a, b) => a.daysUntil - b.daysUntil)

    // Calendar weeks, Monday to Sunday - so on a Sunday this week is already
    // over, and everything starts at next week.
    const thisWeekEnds = shiftDay(today, (WEEK_START + 6 - new Date(dayStart(today)).getDay()) % 7)
    const nextWeekEnds = shiftDay(thisWeekEnds, 7)
    // As far as the special days are looked up. A task can be due a year out,
    // and "Next month" would be a lie about it.
    const monthEnds = shiftDay(today, 31)

    return [
      { heading: 'This week', byDay: true, entries: entries.filter((e) => e.day <= thisWeekEnds) },
      {
        heading: 'Next week',
        byDay: true,
        entries: entries.filter((e) => e.day > thisWeekEnds && e.day <= nextWeekEnds),
      },
      {
        heading: 'Next month',
        byDay: false,
        entries: entries.filter((e) => e.day > nextWeekEnds && e.day <= monthEnds),
      },
      { heading: 'Later', byDay: false, entries: entries.filter((e) => e.day > monthEnds) },
    ]
  }, [upcoming, specials, today])

  if (groups.every((group) => group.entries.length === 0)) return null

  // Open on the first group that actually has something in it, so a Sunday -
  // with this week already over - isn't just a bare "Show more".
  const shown = Math.max(revealed, groups.findIndex((group) => group.entries.length > 0) + 1)

  function handleShowMore() {
    const next = groups.findIndex((group, index) => index >= shown && group.entries.length > 0)
    setRevealed(next === -1 ? groups.length : next + 1)
  }

  const hasMoreToReveal = groups.slice(shown).some((group) => group.entries.length > 0)

  return (
    <section className="ios-section">
      {groups.slice(0, shown).map(
        (group) =>
          group.entries.length > 0 && (
            <div key={group.heading} className="upcoming-group">
              <h2 className="ios-section-title">{group.heading}</h2>
              {group.byDay ? (
                runsByDay(group.entries).map((run) => (
                  <div key={run.day} className="ios-section-group">
                    <h3 className="ios-group-header" title={formatDayLong(run.day)}>
                      {formatWeekday(run.day)} · {formatRelativeDays(run.daysUntil)}
                    </h3>
                    <ul className="ios-list">
                      {run.entries.map((entry) => (
                        <UpcomingEntryRow key={entry.key} entry={entry} />
                      ))}
                    </ul>
                  </div>
                ))
              ) : (
                <ul className="ios-list">
                  {group.entries.map((entry) => (
                    <UpcomingEntryRow key={entry.key} entry={entry} showWhen />
                  ))}
                </ul>
              )}
            </div>
          ),
      )}

      {hasMoreToReveal && (
        <button type="button" className="ios-link-button" onClick={handleShowMore}>
          Show more
        </button>
      )}
    </section>
  )
}

const DONE_EXPANDED_KEY = 'today.doneExpanded'

/**
 * Answered tasks, out of the way: the to-do list above only holds what's
 * left, and what's finished gathers here behind one row - "Done · 4 done,
 * 1 failed" - as Reminders tucks away completed items. Opens with a
 * critically damped height spring, and remembers whether it was left open.
 */
function DoneGroup({
  done,
  failed,
  children,
}: {
  done: number
  failed: number
  children: ReactNode
}) {
  const [expanded, setExpanded] = useState(() => readStored(DONE_EXPANDED_KEY, false))
  const reduceMotion = useReducedMotion()

  function toggle() {
    setExpanded((current) => {
      writeStored(DONE_EXPANDED_KEY, !current)
      return !current
    })
  }

  const counts = [done > 0 ? `${done} done` : null, failed > 0 ? `${failed} failed` : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <section className="done-group">
      <button type="button" className="done-toggle" aria-expanded={expanded} onClick={toggle}>
        <span className="done-toggle-label">Done</span>
        <span className="done-toggle-count">{counts}</span>
        <svg className="done-toggle-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            className="done-group-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={reduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.35 }}
          >
            <ul className="ios-list">{children}</ul>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/**
 * The line under the ring: what's still open and what went wrong, in that
 * order, and the plain "All done" once nothing is left - completion is worth
 * saying in words, not just in a full ring.
 */
function summaryCaption(left: number, failed: number, paused: number): string {
  const parts: string[] = []
  if (left > 0) parts.push(`${left} left`)
  if (failed > 0) parts.push(`${failed} failed`)
  if (paused > 0) parts.push(`${paused} paused for vacation`)
  if (left === 0 && failed === 0) parts.unshift('All done')
  return parts.join(' · ')
}

export function TodayPage() {
  const [searchParams] = useSearchParams()
  // ?date= opens a chosen day - the goal page's calendar links here.
  const [date, setDate] = useState(() => dateParam(searchParams.get('date')) ?? todayKey())
  const today = todayKey()
  const queryClient = useQueryClient()
  const push = usePush()
  // Both sheets carry the day they're answering: a carried-over row resolves
  // its own past date, not the one on screen.
  const [failing, setFailing] = useState<{ task: DayTask; date: string } | null>(null)
  const [measuring, setMeasuring] = useState<{ task: DayTask; date: string } | null>(null)
  const [editingTask, setEditingTask] = useState<DayTask | null>(null)
  const [menuTaskId, setMenuTaskId] = useState<string | null>(null)
  const [addingNoteFor, setAddingNoteFor] = useState<DayTask | null>(null)
  const [editingNote, setEditingNote] = useState<TaskNote | null>(null)
  const [addingTask, setAddingTask] = useState(false)

  const { isVisible, isStatusVisible, isGoalStatusVisible } = usePrefs()
  const { data, isPending, isError, error, isFetching } = useDay(date)
  const setCompletion = useSetDayCompletion(date)
  const reorderTasks = useReorderDayTasks(date)
  const { data: goals } = useGoals()

  const { data: notes } = useTaskNotes(date)
  const createNote = useCreateTaskNote(date)
  const updateNote = useUpdateTaskNote()
  const deleteNote = useDeleteTaskNote()

  // The category, task-status and goal-status filters are all app-wide, so
  // they narrow this screen too - each row carries its goal's categories and
  // status, and its own completion status, for exactly this.
  const tasks = useMemo(
    () =>
      (data?.tasks ?? []).filter(
        (task) =>
          isVisible(task.categories) &&
          isStatusVisible(task.status) &&
          isGoalStatusVisible(task.goalStatus),
      ),
    [data, isVisible, isStatusVisible, isGoalStatusVisible],
  )
  const upcoming = useMemo(
    () =>
      (data?.upcoming ?? []).filter(
        (task) => isVisible(task.categories) && isGoalStatusVisible(task.goalStatus),
      ),
    [data, isVisible, isGoalStatusVisible],
  )
  // Special days for the day being viewed, plus a month of runway for the
  // Upcoming buckets below. One hook feeds both, so the day block and the
  // preview can't disagree about what's coming.
  const specialOccurrences = useSpecialDayOccurrences(
    date < today ? date : today,
    shiftDay(date > today ? date : today, 31),
  )
  const dayOccurrences = useMemo(
    () => occurrencesOn(specialOccurrences, date),
    [specialOccurrences, date],
  )
  // Upcoming is always measured from today, even while an earlier day is on
  // screen - it's a preview of what's ahead, not of what was ahead back then.
  const upcomingSpecials = useMemo(
    () => specialOccurrences.filter((occurrence) => occurrence.startDate > today),
    [specialOccurrences, today],
  )

  // The task-status filter doesn't apply here - a due row is unanswered by
  // definition, which is the only reason it exists.
  const due = useMemo(
    () =>
      (data?.due ?? []).filter(
        (task) => isVisible(task.categories) && isGoalStatusVisible(task.goalStatus),
      ),
    [data, isVisible, isGoalStatusVisible],
  )

  // Archived goals aren't meaningful targets for a new task.
  const activeGoals = useMemo(
    () => (goals ?? []).filter((goal) => goal.status !== 'archived'),
    [goals],
  )

  // Here the floating add button means "New Task" - once there's a goal to
  // add it to.
  useFabAction(() => {
    if (activeGoals.length > 0) setAddingTask(true)
  })

  function archiveTask(task: DayTask) {
    undoable({
      message: `Archived “${task.title}”`,
      apply: () => hideTask(queryClient, task.id),
      run: (options) =>
        tasksApi.update(task.id, { archived: true }, options).finally(() => refetchEverything(queryClient)),
      undo: () => refetchEverything(queryClient),
      failure: 'Couldn’t archive it',
    })
  }

  // A day that hasn't happened yet: the screen becomes a preview of what's
  // scheduled. Nothing on it can be answered - the server refuses to record a
  // future day - so the rows lose their actions rather than offering a tick
  // that would only come back as an error.
  const isFuture = date > todayKey()

  // A task paused for vacation isn't owed today, so it only enters the tally
  // once it's ticked done anyway - the same rule the stats use (lib/vacation.ts).
  const owed = tasks.filter((task) => !task.paused || task.status === 'done')
  const pausedCount = tasks.length - owed.length
  const done = owed.filter((task) => task.status === 'done').length
  const failed = owed.filter((task) => task.status === 'failed').length

  const notesByTask = new Map<string, TaskNote[]>()
  for (const note of notes ?? []) {
    notesByTask.set(note.taskId, [...(notesByTask.get(note.taskId) ?? []), note])
  }

  // A row is picked up by pressing and holding it, as in any iOS list - a
  // sideways move before then is a swipe, a vertical one is a scroll. Touch
  // gets its own sensor so the page can't start scrolling under a lifted row.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  )

  // Letting go of a lifted row would otherwise land as a click on whatever is
  // under the finger - ticking the task, or opening its menu.
  const suppressClick = useRef(false)
  function endDrag() {
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
  }

  // Open tasks are the list; answered ones go to the Done group. A limit task
  // is never ticked, but the server stores its verdict as an answer all the
  // same (lib/limits.ts): an at-least target is done the moment it's reached,
  // an at-most one fails the moment it goes over and is done only once its
  // day or week has ended - so it joins the group exactly then.
  const isAnswered = (task: DayTask) => task.status === 'done' || task.status === 'failed'
  const openTasks = tasks.filter((task) => !isAnswered(task))
  const answeredTasks = tasks.filter(isAnswered)

  // `on` is the day being answered - the row's own date for a carried-over one.
  function handleCheck(task: DayTask, on: string) {
    // Tapping the tick on an already-done task clears the day again.
    if (task.status === 'done') {
      setCompletion.mutate({ taskId: task.id, date: on, status: null })
      return
    }
    // A task with tangible units asks for them before the day is written at
    // all. The branch lives here rather than on the button so the swipe
    // gesture, which routes through the same handler, asks too.
    if (task.units.length > 0) {
      setMeasuring({ task, date: on })
      return
    }
    // The one moment on this screen worth a haptic: something got done.
    navigator.vibrate?.(10)
    setCompletion.mutate({ taskId: task.id, date: on, status: 'done' })
  }

  function handleReset(task: DayTask) {
    setCompletion.mutate({ taskId: task.id, status: null })
  }

  function handleDragEnd(event: DragEndEvent) {
    endDrag()
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = openTasks.findIndex((task) => task.id === active.id)
    const newIndex = openTasks.findIndex((task) => task.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    // Only the open rows moved. Answered ones keep the slots they hold in the
    // full order, so a task un-ticked tomorrow comes back where it was.
    const reordered = arrayMove(openTasks, oldIndex, newIndex)
    let next = 0
    reorderTasks.mutate(tasks.map((task) => (isAnswered(task) ? task.id : reordered[next++].id)))
  }

  function renderRow(task: DayTask, answered: boolean) {
    return (
      <TaskRow
        key={task.id}
        task={task}
        date={date}
        answered={answered}
        notes={notesByTask.get(task.id) ?? []}
        unitReadings={data?.unitReadings ?? {}}
        menuOpen={menuTaskId === task.id}
        onToggleMenu={() => setMenuTaskId((current) => (current === task.id ? null : task.id))}
        onCloseMenu={() => setMenuTaskId(null)}
        onAddNote={() => {
          setMenuTaskId(null)
          setAddingNoteFor(task)
        }}
        onEditTask={() => {
          setMenuTaskId(null)
          setEditingTask(task)
        }}
        onShowGoal={() => {
          setMenuTaskId(null)
          push(`/goals/${task.goalId}`)
        }}
        onArchive={() => {
          setMenuTaskId(null)
          archiveTask(task)
        }}
        onNoteClick={(note) => setEditingNote(note)}
        onCheck={() => handleCheck(task, date)}
        onCross={() => setFailing({ task, date })}
        onReset={() => handleReset(task)}
        onMeasure={() => setMeasuring({ task, date })}
      />
    )
  }

  return (
    <div className="today">
      <header className="today-header">
        <DayNav date={date} onChange={setDate} allowFuture />

        {tasks.length > 0 && !isFuture && (
          <section className="today-summary-card" aria-label="How the day is going">
            <DayRing done={done} failed={failed} total={owed.length} />
            <div className="today-summary-text">
              <span className="today-summary-figure">
                {done}
                <span className="today-summary-total"> of {owed.length} done</span>
              </span>
              <span className="today-summary-caption">
                {summaryCaption(owed.length - done - failed, failed, pausedCount)}
              </span>
            </div>
          </section>
        )}

        {tasks.length > 0 && isFuture && (
          <section className="today-summary-card today-planned">
            <span className="today-summary-figure">
              {tasks.length}
              <span className="today-summary-total"> {tasks.length === 1 ? 'task' : 'tasks'} planned</span>
            </span>
          </section>
        )}
      </header>

      {isPending && <p className="today-empty">Loading…</p>}
      {isError && <p className="error">Could not load the day: {error.message}</p>}
      {data && tasks.length === 0 && (
        <p className="today-empty">
          {data.tasks.length > 0
            ? 'No tasks match the selected filters.'
            : 'No tasks for this day. Tap + to add one.'}
        </p>
      )}

      {/* What the day *is*, before anything about what to do on it. Not a task:
          there's nothing to tick and nothing counts towards the figures. */}
      <DayInfoSection occurrences={dayOccurrences} />

      {/* Above the day's own list on purpose: the debt is what's overdue, and
          it should be the first thing asked about. */}
      <DueSection
        due={due}
        onCheck={(task) => {
          const target = asAnswerTarget(task)
          handleCheck(target.task, target.date)
        }}
        onCross={(task) => setFailing(asAnswerTarget(task))}
      />

      {tasks.length > 0 && (dayOccurrences.length > 0 || due.length > 0) && (
        <h2 className="ios-section-title today-tasks-title">{isFuture ? 'Planned' : 'Tasks'}</h2>
      )}

      {isFuture ? (
        tasks.length > 0 && (
          <ul className="ios-list">
            {tasks.map((task) => (
              <PlannedRow key={task.id} task={task} date={date} />
            ))}
          </ul>
        )
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => {
            suppressClick.current = true
            // Picking a row up is a physical moment - a light tick says it's held.
            navigator.vibrate?.(8)
          }}
          onDragEnd={handleDragEnd}
          onDragCancel={endDrag}
        >
          <SortableContext items={openTasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
            {openTasks.length > 0 && (
              <ul
                className="ios-list day-list"
                onClickCapture={(event) => {
                  if (!suppressClick.current) return
                  event.preventDefault()
                  event.stopPropagation()
                }}
              >
                {openTasks.map((task) => renderRow(task, false))}
              </ul>
            )}
          </SortableContext>

          {answeredTasks.length > 0 && (
            <DoneGroup
              done={answeredTasks.filter((task) => task.status === 'done').length}
              failed={answeredTasks.filter((task) => task.status === 'failed').length}
            >
              {answeredTasks.map((task) => renderRow(task, true))}
            </DoneGroup>
          )}
        </DndContext>
      )}

      <UpcomingSection upcoming={upcoming} specials={upcomingSpecials} today={today} />

      {isFetching && <p className="today-syncing">Syncing…</p>}

      {failing && (
        <FailDialog
          key={`${failing.task.id}-${failing.date}`}
          taskId={failing.task.id}
          taskTitle={failing.task.title}
          initialNote={failing.task.note}
          units={failing.task.units}
          initialMeasurements={failing.task.measurements}
          // Today's readings say nothing about a day that isn't today.
          unitReadings={failing.date === date ? (data?.unitReadings ?? {}) : {}}
          canClear={failing.task.status === 'failed'}
          onSave={(note, measurements) => {
            setCompletion.mutate({
              taskId: failing.task.id,
              date: failing.date,
              status: 'failed',
              note,
              measurements,
            })
          }}
          onClear={() => {
            setCompletion.mutate({ taskId: failing.task.id, date: failing.date, status: null })
          }}
          onClose={() => setFailing(null)}
        />
      )}

      {measuring && (
        <LogMeasurementsDialog
          key={`${measuring.task.id}-${measuring.date}`}
          taskId={measuring.task.id}
          taskTitle={measuring.task.title}
          units={measuring.task.units}
          initial={measuring.task.measurements}
          unitReadings={measuring.date === date ? (data?.unitReadings ?? {}) : {}}
          canClear={Object.keys(measuring.task.measurements).length > 0}
          onSave={(measurements) => {
            setCompletion.mutate({
              taskId: measuring.task.id,
              date: measuring.date,
              status: 'done',
              measurements,
            })
          }}
          onSkip={() => {
            setCompletion.mutate({
              taskId: measuring.task.id,
              date: measuring.date,
              status: 'done',
              measurements: [],
            })
          }}
          onClose={() => setMeasuring(null)}
        />
      )}

      {addingTask && activeGoals.length > 0 && (
        <TaskSheet goals={activeGoals} onClose={() => setAddingTask(false)} />
      )}

      {editingTask && (
        <TaskSheet
          key={editingTask.id}
          task={editingTask}
          goals={activeGoals}
          onClose={() => setEditingTask(null)}
        />
      )}

      {addingNoteFor && (
        <TaskNoteDialog
          heading={`Add a note - ${addingNoteFor.title}`}
          initialText=""
          canClear={false}
          onSave={(text) => {
            createNote.mutate({ taskId: addingNoteFor.id, text })
          }}
          onClear={() => {}}
          onClose={() => setAddingNoteFor(null)}
        />
      )}

      {editingNote && (
        <TaskNoteDialog
          key={editingNote.id}
          heading="Edit note"
          initialText={editingNote.text}
          canClear
          onSave={(text) => {
            updateNote.mutate({ id: editingNote.id, text })
          }}
          onClear={() => {
            deleteNote.mutate(editingNote.id)
          }}
          onClose={() => setEditingNote(null)}
        />
      )}
    </div>
  )
}
