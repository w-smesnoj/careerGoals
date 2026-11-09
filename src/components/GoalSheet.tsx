import { useState, type FormEvent } from 'react'
import {
  goalColorLabels,
  goalColors,
  type Goal,
  type GoalColor,
  type GoalInput,
} from '../api/goals'
import { useCategorySuggestions, useCreateGoal, useDeleteGoal, useUpdateGoal } from '../hooks/useGoals'
import { useDraft } from '../hooks/useDraft'
import { useSheet, useSheetDirty } from '../hooks/useSheet'
import { usePush } from '../lib/navigation'
import { counted } from '../lib/taskLabels'
import { todayKey } from '../lib/date'
import {
  ButtonRow,
  DateRow,
  FormSection,
  SwatchRow,
  TextAreaRow,
  TextFieldRow,
  TokensRow,
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

interface GoalDraft {
  title: string
  description: string
  startDate: string
  dueOn: boolean
  targetDate: string
  categories: string[]
  color: GoalColor
}

function toGoalDraft(goal: Goal | null | undefined, initial: { title?: string; plan?: string }): GoalDraft {
  const today = todayKey()
  return {
    title: goal?.title ?? initial.title ?? '',
    description: goal?.description ?? initial.plan ?? '',
    startDate: (goal?.startDate ?? goal?.createdAt ?? today).slice(0, 10),
    dueOn: Boolean(goal?.targetDate),
    targetDate: goal?.targetDate?.slice(0, 10) ?? today,
    categories: goal?.categories ?? [],
    color: goal?.color ?? 'purple',
  }
}

export interface GoalSheetProps {
  /** The goal being edited; absent for a new one. */
  goal?: (Goal & { tasks?: unknown[] }) | null
  /** A new goal's starting name and plan - Make Goal from a thought. */
  initialTitle?: string
  initialPlan?: string
  onClose: () => void
  onSaved?: (goal: Goal) => void
  /** A new goal opens its own page once saved; off when the caller goes elsewhere. */
  openWhenCreated?: boolean
  /** After a delete - the goal page has nothing left to show. */
  onDeleted?: () => void
}

/**
 * "New Goal" and "Edit Goal": one sheet, the same rows - name, plan, when it
 * runs, its categories and its colour. The plan is the goal's `description`,
 * which held real multi-paragraph plans that no screen used to show or edit.
 *
 * Deleting sits one level down behind the typed-name confirmation the resolve
 * sheet always had: it takes every task, day and note with it.
 */
export function GoalSheet({ onClose, ...props }: GoalSheetProps) {
  return (
    <Sheet label={props.goal ? `Edit ${props.goal.title}` : 'New goal'} size="large" onClose={onClose}>
      <GoalForm {...props} />
    </Sheet>
  )
}

function GoalForm({
  goal,
  initialTitle,
  initialPlan,
  onSaved,
  openWhenCreated = true,
  onDeleted,
}: Omit<GoalSheetProps, 'onClose'>) {
  const sheet = useSheet()
  const push = usePush()
  const editing = Boolean(goal)
  const { draft, set, dirty, isChanged } = useDraft(() =>
    toGoalDraft(goal, { title: initialTitle, plan: initialPlan }),
  )
  const [page, setPage] = useState<'delete' | null>(null)
  const suggestions = useCategorySuggestions()
  const createGoal = useCreateGoal()
  const updateGoal = useUpdateGoal()
  const mutation = editing ? updateGoal : createGoal

  useSheetDirty(dirty)

  const datesValid = !draft.dueOn || draft.targetDate >= draft.startDate
  const valid = Boolean(draft.title.trim()) && Boolean(draft.startDate) && datesValid

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || mutation.isPending) return

    if (goal) {
      const patch: Partial<GoalInput> = {}
      if (isChanged('title')) patch.title = draft.title.trim()
      if (isChanged('description')) patch.description = draft.description.trim()
      if (isChanged('startDate')) patch.startDate = draft.startDate
      if (isChanged('dueOn') || isChanged('targetDate')) patch.targetDate = draft.dueOn ? draft.targetDate : null
      if (isChanged('categories')) patch.categories = draft.categories
      if (isChanged('color')) patch.color = draft.color === 'purple' ? null : draft.color
      if (Object.keys(patch).length === 0) {
        void sheet.close()
        return
      }
      updateGoal.mutate(
        { id: goal.id, ...patch },
        {
          onSuccess: (saved) => {
            onSaved?.(saved)
            sheet.setDirty(false)
            void sheet.close()
          },
        },
      )
      return
    }

    const created = await createGoal
      .mutateAsync({
        title: draft.title.trim(),
        description: draft.description.trim() || undefined,
        categories: draft.categories.length ? draft.categories : undefined,
        startDate: draft.startDate,
        targetDate: draft.dueOn ? draft.targetDate : null,
        color: draft.color === 'purple' ? null : draft.color,
      })
      .catch(() => null)
    if (!created) return
    onSaved?.(created)
    sheet.setDirty(false)
    // Out first, then in: the sheet finishes leaving before the new goal's
    // page slides in, so the two never animate over each other.
    await sheet.close()
    if (openWhenCreated) push(`/goals/${created.id}`)
  }

  const rootTitle = editing ? 'Edit Goal' : 'New Goal'
  const taskCount = goal?.tasks?.length ?? 0

  const root = (
    <>
      <SheetHeader
        title={rootTitle}
        leading={<SheetCancelButton />}
        trailing={
          <SheetButton type="submit" bold disabled={!valid || mutation.isPending || (editing && !dirty)}>
            {mutation.isPending ? 'Saving…' : editing ? 'Save' : 'Add'}
          </SheetButton>
        }
      />
      <SheetBody>
        <FormSection footer={mutation.isError ? mutation.error.message : undefined}>
          <TextFieldRow
            value={draft.title}
            onChange={(title) => set({ title })}
            placeholder="Name"
            autoFocus={!editing}
            maxLength={140}
            enterKeyHint="done"
          />
        </FormSection>

        <FormSection header="Plan" footer="What you're going for and how - for your future self.">
          <TextAreaRow
            value={draft.description}
            onChange={(description) => set({ description })}
            placeholder="The plan"
            maxLength={2000}
            minRows={4}
          />
        </FormSection>

        <FormSection footer={datesValid ? undefined : 'The due date can’t be before the start.'}>
          <DateRow label="Starts" value={draft.startDate} onChange={(startDate) => set({ startDate })} />
          <DateRow
            label="Due"
            value={draft.targetDate}
            min={draft.startDate}
            onChange={(targetDate) => set({ targetDate })}
            optional={{ enabled: draft.dueOn, onToggle: (dueOn) => set({ dueOn }) }}
          />
        </FormSection>

        <FormSection header="Categories" footer="Return or a comma adds one.">
          <TokensRow
            label="Add category"
            placeholder="Categories"
            tokens={draft.categories}
            onChange={(categories) => set({ categories })}
            suggestions={suggestions}
          />
        </FormSection>

        <FormSection header="Colour" footer="Marks the goal's rings and calendar.">
          <SwatchRow
            label="Colour"
            value={draft.color}
            onChange={(color) => set({ color })}
            options={goalColors.map((color) => ({ value: color, label: goalColorLabels[color] }))}
          />
        </FormSection>

        {goal && (
          <FormSection>
            <ButtonRow label="Delete Goal" tone="destructive" onClick={() => setPage('delete')} />
          </FormSection>
        )}
      </SheetBody>
    </>
  )

  const pages = goal
    ? {
        delete: (
          <DeleteGoalPage
            goal={goal}
            taskCount={taskCount}
            backLabel={rootTitle}
            onBack={() => setPage(null)}
            onDeleted={onDeleted}
          />
        ),
      }
    : {}

  return (
    <form className="sheet-form" onSubmit={(event) => void handleSubmit(event)}>
      <SheetPages page={page} root={root} pages={pages} />
    </form>
  )
}

/**
 * The way a goal is deleted for good: a pushed page that names what goes with
 * it and wants the goal's name typed back. Resolving or archiving is the
 * normal ending; this is the escape hatch.
 */
export function DeleteGoalPage({
  goal,
  taskCount,
  backLabel,
  onBack,
  onDeleted,
}: {
  goal: { id: string; title: string }
  taskCount: number
  backLabel: string
  onBack: () => void
  onDeleted?: () => void
}) {
  const sheet = useSheet()
  const [typedTitle, setTypedTitle] = useState('')
  const deleteGoal = useDeleteGoal()

  return (
    <>
      <SheetHeader title="Delete Goal" leading={<SheetBackButton label={backLabel} onClick={onBack} />} />
      <SheetBody>
        <p className="sheet-note">
          This deletes “{goal.title}”, its {counted(taskCount, 'task')}, every day they recorded and
          every note on them. There is no undo - resolving or archiving keeps the history. Type the
          goal&apos;s name to confirm.
        </p>
        <FormSection footer={deleteGoal.isError ? deleteGoal.error.message : undefined}>
          <TextFieldRow
            value={typedTitle}
            onChange={setTypedTitle}
            placeholder={goal.title}
            autoCapitalize="none"
          />
          <ButtonRow
            label={deleteGoal.isPending ? 'Deleting…' : 'Delete Goal Permanently'}
            tone="destructive"
            disabled={typedTitle.trim() !== goal.title || deleteGoal.isPending}
            onClick={() =>
              deleteGoal.mutate(goal.id, {
                onSuccess: async () => {
                  sheet.setDirty(false)
                  await sheet.close()
                  onDeleted?.()
                },
              })
            }
          />
        </FormSection>
      </SheetBody>
    </>
  )
}
