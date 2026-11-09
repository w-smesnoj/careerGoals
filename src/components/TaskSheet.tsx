import { useState, type FormEvent, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Goal } from '../api/goals'
import {
  dayResolutionLabels,
  taskDayResolutions,
  tasksApi,
  type Task,
  type TaskDayResolution,
  type TaskInput,
  type TaskLimitDirection,
  type TaskLimitInput,
  type TaskLimitMeasure,
  type TaskLimitPeriod,
} from '../api/tasks'
import type { DayTask, TrackerTask } from '../api/tracker'
import { useDeleteTask, useSaveTask } from '../hooks/useTasks'
import { useTrackingUnits } from '../hooks/useTrackingUnits'
import { useDraft } from '../hooks/useDraft'
import { useSheet, useSheetDirty } from '../hooks/useSheet'
import {
  buildFrequency,
  draftFromFrequency,
  emptyFrequencyDraft,
  isFrequencyValid,
  type FrequencyDraft,
} from '../lib/frequencyDraft'
import { counted, frequencySummary, limitSummary, resolutionSummary } from '../lib/taskLabels'
import { decimalText, parseDecimal } from '../lib/units'
import { formatDayLong, todayKey } from '../lib/date'
import { hideTask, refetchEverything } from '../lib/optimistic'
import { undoable } from '../lib/toast'
import { ActionSheet } from './ActionSheet'
import { FrequencyFields } from './FrequencyFields'
import {
  ButtonRow,
  ChoiceList,
  DateRow,
  FormSection,
  MultiChoiceList,
  NavRow,
  NumberRow,
  SelectRow,
  SwitchRow,
  TextFieldRow,
} from './FormRows'
import {
  Sheet,
  SheetBackButton,
  SheetBody,
  SheetButton,
  SheetCancelButton,
  SheetHeader,
  SheetPages,
} from './Sheet'

/** Either shape a task reaches the sheet in: Today's row, or the grid's. */
export type TaskSource = DayTask | TrackerTask

interface TaskDraft {
  title: string
  goalId: string
  frequency: FrequencyDraft
  unitIds: string[]
  dayResolution: TaskDayResolution
  limitOn: boolean
  limitUnitId: string
  limitDirection: TaskLimitDirection
  limitTarget: string
  limitPeriod: TaskLimitPeriod
  limitMeasure: TaskLimitMeasure
  /** A second unit the day must also have a reading for; '' for none. */
  limitAlsoLoggedId: string
  /** Judge every day since the task started too. Never "changed" on its own. */
  limitFromStart: boolean
  /** New once task only: it was already done, on `doneOn`. */
  alreadyDone: boolean
  doneOn: string
}

const LIMIT_KEYS: (keyof TaskDraft)[] = [
  'limitOn',
  'limitUnitId',
  'limitDirection',
  'limitTarget',
  'limitPeriod',
  'limitMeasure',
  'limitAlsoLoggedId',
  'limitFromStart',
]

/** Today's DayTask and the grid's TrackerTask, into one draft. */
function toTaskDraft(
  task: TaskSource | null | undefined,
  defaults: { goalId: string; title?: string; once?: boolean },
): TaskDraft {
  const limit = task?.limit ?? null
  return {
    title: task?.title ?? defaults.title ?? '',
    goalId: task?.goalId ?? defaults.goalId,
    frequency: task
      ? draftFromFrequency(task.frequency)
      : { ...emptyFrequencyDraft, type: defaults.once ? 'once' : 'daily' },
    unitIds: task ? ('units' in task ? task.units.map((unit) => unit.id) : task.unitIds) : [],
    dayResolution: task?.dayResolution ?? 'open',
    limitOn: Boolean(limit),
    limitUnitId: limit ? ('unit' in limit ? limit.unit.id : limit.unitId) : '',
    limitDirection: limit?.direction ?? 'atMost',
    limitTarget: limit ? decimalText(limit.target) : '',
    limitPeriod: limit?.period ?? 'day',
    limitMeasure: limit?.measure ?? 'total',
    limitAlsoLoggedId: limit
      ? (('unit' in limit ? limit.alsoLogged?.unit.id : limit.alsoLoggedUnitId) ?? '')
      : '',
    limitFromStart: false,
    alreadyDone: false,
    doneOn: todayKey(),
  }
}

const directionOptions: { value: TaskLimitDirection; label: string }[] = [
  { value: 'atMost', label: 'At most' },
  { value: 'atLeast', label: 'At least' },
]

/** Period and measure as one choice: an average is only ever taken over a week. */
type LimitSpan = TaskLimitPeriod | 'weekAverage'

const spanOptions: { value: LimitSpan; label: string; hint: string }[] = [
  { value: 'day', label: 'Per day', hint: 'Each day is judged on its own total.' },
  {
    value: 'week',
    label: 'Per week',
    hint: 'Monday to Sunday added up; every day of the week shares the verdict.',
  },
  {
    value: 'weekAverage',
    label: 'Daily average per week',
    hint: 'Each logged day, averaged from Monday to Sunday; days with nothing logged are left out. Judged once the week is over.',
  },
]

type Page = 'repeat' | 'units' | 'limit' | 'resolution'

const PAGE_TITLES: Record<Page, string> = {
  repeat: 'Repeat',
  units: 'Tracking Units',
  limit: 'Limit or Target',
  resolution: 'If Not Ticked',
}

export interface TaskSheetProps {
  /** The task being edited; absent for a new one. */
  task?: TaskSource | null
  /** Where a task can live. An existing task's own goal is always offered. */
  goals: Goal[]
  defaultGoalId?: string
  /** A new task's starting title - Make Task from a thought. */
  initialTitle?: string
  /** A new task that starts as Repeat = Once. */
  initialOnce?: boolean
  onClose: () => void
  /** After a successful save, before the sheet has finished leaving. */
  onSaved?: (task: Task) => void
}

/**
 * "New Task" and "Edit Task": one sheet, the same rows. Title and goal on the
 * root; how often it repeats, what it asks for, how it's judged and what a
 * missed day becomes each one level deeper, on their own pushed page. Every
 * page edits the same draft, and one Save commits it all.
 *
 * Replaces the four separate dialogs the title menu used to open, and the old
 * add-task form - and works from anywhere a task is shown, on any day, not
 * just from Today on a day the task is due.
 */
export function TaskSheet({ onClose, ...props }: TaskSheetProps) {
  return (
    <Sheet label={props.task ? `Edit ${props.task.title}` : 'New task'} size="large" onClose={onClose}>
      <TaskForm {...props} />
    </Sheet>
  )
}

function TaskForm({ task, goals, defaultGoalId, initialTitle, initialOnce, onSaved }: Omit<TaskSheetProps, 'onClose'>) {
  const sheet = useSheet()
  const queryClient = useQueryClient()
  const editing = Boolean(task)
  const { draft, set, dirty, isChanged, original } = useDraft(() =>
    toTaskDraft(task, {
      goalId: defaultGoalId ?? goals[0]?.id ?? '',
      title: initialTitle,
      once: initialOnce,
    }),
  )
  const [page, setPage] = useState<Page | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const { data: units } = useTrackingUnits()
  const saveTask = useSaveTask()
  const deleteTask = useDeleteTask()

  useSheetDirty(dirty)

  const goal = goals.find((candidate) => candidate.id === draft.goalId)
  const goalOptions = goals.map((candidate) => ({ value: candidate.id, label: candidate.title }))
  if (task && !goalOptions.some((option) => option.value === task.goalId)) {
    goalOptions.unshift({ value: task.goalId, label: 'goalTitle' in task ? task.goalTitle : 'Current goal' })
  }

  const once = draft.frequency.type === 'once'
  const limitUnits = units ?? []
  const limitUnitId =
    draft.limitUnitId || limitUnits.find((unit) => unit.aggregation === 'sum')?.id || limitUnits[0]?.id || ''
  const limitUnit = limitUnits.find((unit) => unit.id === limitUnitId)
  // A unit that keeps one reading a day (sleep, weight) has a day's figure and
  // a weekly average of those, but no week's total to add up.
  const noWeekTotal = limitUnit?.aggregation === 'latest'
  const limitMeasure: TaskLimitMeasure =
    noWeekTotal && draft.limitPeriod === 'week' ? 'average' : draft.limitMeasure
  const limitPeriod: TaskLimitPeriod = limitMeasure === 'average' ? 'week' : draft.limitPeriod
  const alsoLoggedId =
    limitPeriod === 'day' && draft.limitAlsoLoggedId !== limitUnitId ? draft.limitAlsoLoggedId : ''
  const limitSpan: LimitSpan = limitMeasure === 'average' ? 'weekAverage' : limitPeriod
  const limitTarget = parseDecimal(draft.limitTarget)
  const limitValid =
    !draft.limitOn ||
    once ||
    (limitUnitId !== '' && limitTarget !== null && !Number.isNaN(limitTarget) && limitTarget >= 0)

  const goalStart = goal ? (goal.startDate ?? goal.createdAt).slice(0, 10) : undefined
  const today = todayKey()
  const doneOnValid =
    !draft.alreadyDone || (draft.doneOn <= today && (!goalStart || draft.doneOn >= goalStart))

  const valid =
    Boolean(draft.title.trim()) &&
    Boolean(draft.goalId) &&
    isFrequencyValid(draft.frequency) &&
    limitValid &&
    doneOnValid

  function limitInput(): TaskLimitInput {
    return {
      unitId: limitUnitId,
      direction: draft.limitDirection,
      target: limitTarget ?? 0,
      period: limitPeriod,
      measure: limitMeasure,
      alsoLoggedUnitId: alsoLoggedId || null,
      fromStart: draft.limitFromStart,
    }
  }

  function finish(saved: Task) {
    onSaved?.(saved)
    sheet.setDirty(false)
    void sheet.close()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || saveTask.isPending) return

    if (task) {
      const patch: Partial<TaskInput> = {}
      if (isChanged('title')) patch.title = draft.title.trim()
      if (isChanged('goalId')) patch.goalId = draft.goalId
      if (isChanged('frequency')) patch.frequency = buildFrequency(draft.frequency)
      if (isChanged('unitIds')) patch.unitIds = draft.unitIds
      if (isChanged('dayResolution')) patch.dayResolution = draft.dayResolution
      // A once task can't be judged by a limit (the server refuses), so
      // switching to Once takes an existing limit off with it.
      const limitTouched = LIMIT_KEYS.some((key) => isChanged(key)) || (once && original.limitOn)
      if (limitTouched) {
        if (draft.limitOn && !once) patch.limit = limitInput()
        else if (original.limitOn) patch.limit = null
      }
      if (Object.keys(patch).length === 0) {
        void sheet.close()
        return
      }
      saveTask.mutate({ kind: 'update', id: task.id, patch }, { onSuccess: finish })
      return
    }

    const backdated = once && draft.alreadyDone
    saveTask.mutate(
      {
        kind: 'create',
        input: {
          title: draft.title.trim(),
          goalId: draft.goalId,
          frequency: buildFrequency(draft.frequency),
          unitIds: draft.unitIds,
          dayResolution: draft.dayResolution,
          // Started the day it was done, or the day would sit before the
          // task existed and read as upcoming rather than done.
          ...(backdated && draft.doneOn < today ? { startDay: draft.doneOn } : {}),
        },
        limit: draft.limitOn && !once ? limitInput() : undefined,
        doneOn: backdated ? draft.doneOn : undefined,
      },
      { onSuccess: finish },
    )
  }

  async function handleArchive() {
    if (!task) return
    sheet.setDirty(false)
    await sheet.close()
    undoable({
      message: `Archived “${task.title}”`,
      apply: () => hideTask(queryClient, task.id),
      run: (options) =>
        tasksApi.update(task.id, { archived: true }, options).finally(() => refetchEverything(queryClient)),
      undo: () => refetchEverything(queryClient),
      failure: 'Couldn’t archive it',
    })
  }

  const rootTitle = editing ? 'Edit Task' : 'New Task'
  const unitNames = (units ?? []).filter((unit) => draft.unitIds.includes(unit.id)).map((unit) => unit.name)

  const root = (
    <>
      <SheetHeader
        title={rootTitle}
        leading={<SheetCancelButton />}
        trailing={
          <SheetButton type="submit" bold disabled={!valid || saveTask.isPending || (editing && !dirty)}>
            {saveTask.isPending ? 'Saving…' : editing ? 'Save' : 'Add'}
          </SheetButton>
        }
      />
      <SheetBody>
        <FormSection footer={saveTask.isError ? saveTask.error.message : undefined}>
          <TextFieldRow
            value={draft.title}
            onChange={(title) => set({ title })}
            placeholder="Title"
            autoFocus={!editing}
            maxLength={140}
            enterKeyHint="done"
          />
          <SelectRow
            label="Goal"
            value={draft.goalId}
            onChange={(goalId) => set({ goalId })}
            options={goalOptions}
          />
        </FormSection>

        <FormSection>
          <NavRow label="Repeat" detail={frequencySummary(draft.frequency)} onClick={() => setPage('repeat')} />
          <NavRow
            label="Tracking Units"
            detail={unitNames.length === 0 ? 'None' : unitNames.length === 1 ? unitNames[0] : counted(unitNames.length, 'unit')}
            onClick={() => setPage('units')}
          />
          {!once && (
            <NavRow
              label="Limit or Target"
              detail={
                draft.limitOn && limitTarget !== null && !Number.isNaN(limitTarget)
                  ? limitSummary({
                      direction: draft.limitDirection,
                      target: limitTarget,
                      period: limitPeriod,
                      measure: limitMeasure,
                      unit: limitUnit,
                    })
                  : 'Off'
              }
              onClick={() => setPage('limit')}
            />
          )}
          <NavRow
            label="If Not Ticked"
            detail={resolutionSummary(draft.dayResolution)}
            onClick={() => setPage('resolution')}
          />
        </FormSection>

        {!editing && once && (
          <FormSection
            footer={
              draft.alreadyDone
                ? doneOnValid
                  ? `Logged as done on ${formatDayLong(draft.doneOn)}.`
                  : 'Pick a day between the goal’s start and today.'
                : 'For something you’ve already done - it goes straight to Done on that day.'
            }
          >
            <SwitchRow
              label="Already done"
              checked={draft.alreadyDone}
              onChange={(alreadyDone) => set({ alreadyDone })}
            />
            {draft.alreadyDone && (
              <DateRow
                label="Done on"
                value={draft.doneOn}
                min={goalStart}
                max={today}
                onChange={(doneOn) => set({ doneOn })}
              />
            )}
          </FormSection>
        )}

        {task && (
          <FormSection
            footer="Archiving takes it off Today and the goal but keeps its history. Deleting erases that too."
          >
            <ButtonRow label="Archive Task" onClick={() => void handleArchive()} />
            <ButtonRow
              label="Delete Task"
              tone="destructive"
              disabled={deleteTask.isPending}
              onClick={() => setConfirmingDelete(true)}
            />
          </FormSection>
        )}
      </SheetBody>
    </>
  )

  function pageHeader(key: Page) {
    return (
      <SheetHeader
        title={PAGE_TITLES[key]}
        leading={<SheetBackButton label={rootTitle} onClick={() => setPage(null)} />}
      />
    )
  }

  const pages: Record<Page, ReactNode> = {
    repeat: (
      <>
        {pageHeader('repeat')}
        <SheetBody>
          <FrequencyFields
            value={draft.frequency}
            onChange={(frequency) => set({ frequency })}
            anchorHint={
              editing
                ? 'Counting starts on the first such day from today.'
                : 'Counting starts on the first such day from when the goal begins.'
            }
          />
          {editing && (
            <p className="sheet-note">
              A new repeat applies from today onwards. Days already gone by keep whatever you
              recorded on them, though how they score can change.
            </p>
          )}
        </SheetBody>
      </>
    ),
    units: (
      <>
        {pageHeader('units')}
        <SheetBody>
          {units && units.length === 0 ? (
            <p className="sheet-note">No units yet - add one on the Tracking tab first.</p>
          ) : (
            <FormSection
              header="Ask for a value when it's ticked"
              footer={
                editing
                  ? 'Removing a unit also deletes the readings this task recorded for it.'
                  : 'At most six.'
              }
            >
              <MultiChoiceList
                name="Tracking units"
                values={draft.unitIds}
                onToggle={(id) =>
                  set({
                    unitIds: draft.unitIds.includes(id)
                      ? draft.unitIds.filter((existing) => existing !== id)
                      : [...draft.unitIds, id],
                  })
                }
                options={(units ?? []).map((unit) => ({
                  value: unit.id,
                  label: unit.name,
                  hint: unit.symbol || undefined,
                }))}
              />
            </FormSection>
          )}
        </SheetBody>
      </>
    ),
    limit: (
      <>
        {pageHeader('limit')}
        <SheetBody>
          <FormSection
            footer={
              limitUnits.length === 0
                ? 'This needs a tracking unit, like coffees, steps or sleep. Create one on the Tracking tab first.'
                : 'Judged from what you log on the Tracking tab - no ticking.'
            }
          >
            <SwitchRow
              label="Judge from a unit's readings"
              checked={draft.limitOn}
              disabled={limitUnits.length === 0}
              onChange={(limitOn) => set({ limitOn, limitUnitId: limitUnitId })}
            />
          </FormSection>

          {draft.limitOn && limitUnits.length > 0 && (
            <>
              <FormSection
                footer={
                  limitMeasure === 'average'
                    ? 'Judged once the week is over, on the average of the days you logged. Nothing logged leaves it open.'
                    : draft.limitDirection === 'atMost'
                      ? `Going over fails it right away; staying under counts once the ${limitPeriod} is over. Nothing logged leaves it open, so log a 0 on clean days.`
                      : `Reaching it counts right away; falling short fails once the ${limitPeriod} is over. Nothing logged leaves it open.`
                }
              >
                <SelectRow
                  label="Unit"
                  value={limitUnitId}
                  onChange={(limitUnitId) => set({ limitUnitId })}
                  options={limitUnits.map((unit) => ({
                    value: unit.id,
                    label: unit.symbol ? `${unit.name} (${unit.symbol})` : unit.name,
                  }))}
                />
                <SelectRow
                  label="Judged as"
                  value={draft.limitDirection}
                  onChange={(limitDirection) => set({ limitDirection })}
                  options={directionOptions}
                />
                <NumberRow
                  label="Target"
                  symbol={limitUnit?.symbol}
                  value={draft.limitTarget}
                  invalid={limitTarget !== null && (Number.isNaN(limitTarget) || limitTarget < 0)}
                  onChange={(limitTarget) => set({ limitTarget })}
                />
              </FormSection>

              <FormSection
                header="Period"
                footer={
                  noWeekTotal && limitUnit
                    ? `${limitUnit.name} keeps one reading a day, so it has no week total.`
                    : undefined
                }
              >
                <ChoiceList
                  name="Period"
                  value={limitSpan}
                  onChange={(span) =>
                    set(
                      span === 'weekAverage'
                        ? { limitPeriod: 'week', limitMeasure: 'average' }
                        : { limitPeriod: span, limitMeasure: 'total' },
                    )
                  }
                  options={spanOptions.map((option) => ({
                    ...option,
                    disabled: noWeekTotal && option.value === 'week',
                  }))}
                />
              </FormSection>

              {limitPeriod === 'day' && (
                <FormSection footer="The day only counts as done once this has a reading too, whatever its value. A day that ends without one fails.">
                  <SelectRow
                    label="Also needs logged"
                    value={alsoLoggedId}
                    onChange={(limitAlsoLoggedId) => set({ limitAlsoLoggedId })}
                    options={[
                      { value: '', label: 'Nothing else' },
                      ...limitUnits
                        .filter((unit) => unit.id !== limitUnitId)
                        .map((unit) => ({
                          value: unit.id,
                          label: unit.symbol ? `${unit.name} (${unit.symbol})` : unit.name,
                        })),
                    ]}
                  />
                </FormSection>
              )}

              <FormSection footer="From when the task started. Their old ticks are replaced, and days with nothing logged become unanswered. Off, it applies from today.">
                <SwitchRow
                  label="Judge past days too"
                  checked={draft.limitFromStart}
                  onChange={(limitFromStart) => set({ limitFromStart })}
                />
              </FormSection>
            </>
          )}
        </SheetBody>
      </>
    ),
    resolution: (
      <>
        {pageHeader('resolution')}
        <SheetBody>
          <FormSection
            footer={
              editing
                ? 'Applies from today onwards. Days already gone by keep whatever they have now.'
                : undefined
            }
          >
            <ChoiceList
              name="If not ticked"
              value={draft.dayResolution}
              onChange={(dayResolution) => set({ dayResolution })}
              options={taskDayResolutions.map((resolution) => ({
                value: resolution,
                label: dayResolutionLabels[resolution].label,
                hint: dayResolutionLabels[resolution].hint,
              }))}
            />
          </FormSection>
        </SheetBody>
      </>
    ),
  }

  return (
    <form className="sheet-form" onSubmit={handleSubmit}>
      <SheetPages page={page} root={root} pages={pages} />

      {confirmingDelete && task && (
        <ActionSheet
          title={`Delete “${task.title}”?`}
          message="Its whole history goes with it - every day answered, every note and reading. This can't be undone."
          actions={[
            {
              label: 'Delete Task',
              destructive: true,
              onSelect: () =>
                deleteTask.mutate(task.id, {
                  onSuccess: () => {
                    sheet.setDirty(false)
                    void sheet.close()
                  },
                }),
            },
          ]}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </form>
  )
}
