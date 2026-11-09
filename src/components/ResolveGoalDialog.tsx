import { useState, type FormEvent } from 'react'
import type { TrackerGoal } from '../api/tracker'
import { outcomeLabels, resolutionOutcomes, type ResolutionOutcome } from '../api/goalResolutions'
import { useReopenGoal, useResolveGoal } from '../hooks/useGoalResolution'
import { useSheet, useSheetDirty } from '../hooks/useSheet'
import { goalStats, toResolutionStats } from '../lib/goalStats'
import { formatDayShort } from '../lib/date'
import { ButtonRow, ChoiceList, FormSection, TextAreaRow } from './FormRows'
import { DeleteGoalPage } from './GoalSheet'
import {
  Sheet,
  SheetBody,
  SheetButton,
  SheetCancelButton,
  SheetHeader,
  SheetPages,
} from './Sheet'

const outcomeHints: Record<ResolutionOutcome, string> = {
  achieved: 'Got there.',
  partial: 'Part of the way.',
  missed: 'Didn’t get there.',
  abandoned: 'Stopped on purpose.',
}

/** One figure in the summary the user is asked to comment on. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="resolve-stat">
      <span className="resolve-stat-value">{value}</span>
      <span className="resolve-stat-label">{label}</span>
    </div>
  )
}

/**
 * Closing the book on a goal: the numbers, and what the user makes of them.
 *
 * Resolving is meant to be the only ending a goal has - deleting is here too,
 * one level down behind a typed confirmation, because it takes the tasks, the
 * day records and the notes with it and there is no undo.
 *
 * Kept under its name and props: Overview's timeline opens it too.
 */
export function ResolveGoalDialog({
  goal,
  onClose,
  onDeleted,
}: {
  goal: TrackerGoal
  onClose: () => void
  /** After a delete, for a caller showing the goal itself. */
  onDeleted?: () => void
}) {
  return (
    <Sheet label={`Resolve ${goal.title}`} size="large" onClose={onClose}>
      <ResolveForm goal={goal} onDeleted={onDeleted} />
    </Sheet>
  )
}

function ResolveForm({ goal, onDeleted }: { goal: TrackerGoal; onDeleted?: () => void }) {
  const sheet = useSheet()
  const stats = goalStats(goal)
  const existing = goal.resolution

  const initialOutcome = existing?.outcome ?? 'achieved'
  const initialNote = existing?.note ?? ''
  const [outcome, setOutcome] = useState<ResolutionOutcome>(initialOutcome)
  const [note, setNote] = useState(initialNote)
  const [page, setPage] = useState<'delete' | null>(null)
  useSheetDirty(outcome !== initialOutcome || note !== initialNote)

  const resolveGoal = useResolveGoal()
  const reopenGoal = useReopenGoal()

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    resolveGoal.mutate(
      {
        goalId: goal.id,
        outcome,
        note: note.trim(),
        // Frozen as of now: tasks can be deleted later, and the figures the
        // note was written about should outlive them.
        stats: toResolutionStats(stats),
      },
      {
        onSuccess: () => {
          sheet.setDirty(false)
          void sheet.close()
        },
      },
    )
  }

  const error = resolveGoal.error ?? reopenGoal.error
  const title = existing ? 'Resolution' : 'Resolve'

  const root = (
    <>
      <SheetHeader
        title={title}
        leading={<SheetCancelButton />}
        trailing={
          <SheetButton type="submit" bold disabled={resolveGoal.isPending}>
            {resolveGoal.isPending ? 'Saving…' : existing ? 'Update' : 'Resolve'}
          </SheetButton>
        }
      />
      <SheetBody>
        <p className="sheet-subject">
          {goal.title}
          <span className="sheet-subject-sub">
            {formatDayShort(stats.startDay)} – {stats.dueDay ? formatDayShort(stats.dueDay) : 'no due date'}
          </span>
        </p>

        <div className="resolve-stats">
          <Stat label="completion" value={`${stats.rate}%`} />
          <Stat label="done" value={stats.done.toLocaleString()} />
          <Stat label="failed" value={stats.failed.toLocaleString()} />
          <Stat label="unanswered" value={stats.missed.toLocaleString()} />
          <Stat label={stats.taskCount === 1 ? 'task' : 'tasks'} value={stats.taskCount.toLocaleString()} />
          <Stat
            label={stats.daysPlanned ? `days of ${stats.daysPlanned}` : 'days in'}
            value={stats.daysElapsed.toLocaleString()}
          />
        </div>

        <FormSection header="How did it end?">
          <ChoiceList
            name="Outcome"
            value={outcome}
            onChange={setOutcome}
            options={resolutionOutcomes.map((value) => ({
              value,
              label: outcomeLabels[value],
              hint: outcomeHints[value],
            }))}
          />
        </FormSection>

        <FormSection header="Your thoughts" footer={error ? error.message : undefined}>
          <TextAreaRow
            value={note}
            onChange={setNote}
            placeholder="What happened, what you learned, what you would do differently…"
            minRows={4}
          />
        </FormSection>

        <FormSection>
          {existing && (
            <ButtonRow
              label="Reopen Goal"
              disabled={reopenGoal.isPending}
              onClick={() =>
                reopenGoal.mutate(goal.id, {
                  onSuccess: () => {
                    sheet.setDirty(false)
                    void sheet.close()
                  },
                })
              }
            />
          )}
          <ButtonRow label="Delete Goal…" tone="destructive" onClick={() => setPage('delete')} />
        </FormSection>
      </SheetBody>
    </>
  )

  return (
    <form className="sheet-form" onSubmit={handleSubmit}>
      <SheetPages
        page={page}
        root={root}
        pages={{
          delete: (
            <DeleteGoalPage
              goal={goal}
              taskCount={stats.taskCount}
              backLabel={title}
              onBack={() => setPage(null)}
              onDeleted={onDeleted}
            />
          ),
        }}
      />
    </form>
  )
}
