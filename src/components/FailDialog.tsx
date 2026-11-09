import { useState, type FormEvent } from 'react'
import type { DayMeasurement, DayTaskUnit, DayUnitReading, MeasurementInput } from '../api/tracker'
import { useMeasurementDraft } from '../hooks/useMeasurementDraft'
import { useSheet, useSheetDirty } from '../hooks/useSheet'
import { ButtonRow, FormSection, TextAreaRow } from './FormRows'
import { MeasurementFields } from './MeasurementFields'
import { Sheet, SheetBody, SheetButton, SheetCancelButton, SheetHeader } from './Sheet'

interface FailDialogProps {
  taskId: string
  taskTitle: string
  initialNote: string
  /** Units the task tracks; a failed day can still carry their values. */
  units: DayTaskUnit[]
  /** Already-recorded values, keyed by unit id. */
  initialMeasurements: Record<string, DayMeasurement>
  /** Every reading recorded today, keyed by unit id - so a 'sum' unit's field
   *  can show what else already counts toward the total. */
  unitReadings: Record<string, DayUnitReading[]>
  /** Shown only when the task is already marked failed. */
  canClear: boolean
  /** `measurements` is undefined for a task that tracks nothing. The sheet
   *  closes itself afterwards; `onClose` runs once it's gone. */
  onSave: (note: string, measurements?: MeasurementInput[]) => void
  onClear: () => void
  onClose: () => void
}

/**
 * Why a day didn't happen. Only mounted while open, and keyed by task id by
 * the caller - so the note starts fresh each time instead of being reset from
 * an effect.
 *
 * Failing a day doesn't mean there's nothing to record: you can miss a review
 * and still have logged your hours, so this asks for the same values the log
 * sheet does whenever the task tracks any.
 */
export function FailDialog({ onClose, ...props }: FailDialogProps) {
  return (
    <Sheet label={`Failed - ${props.taskTitle}`} onClose={onClose}>
      <FailForm {...props} />
    </Sheet>
  )
}

function FailForm({
  taskId,
  taskTitle,
  initialNote,
  units,
  initialMeasurements,
  unitReadings,
  canClear,
  onSave,
  onClear,
}: Omit<FailDialogProps, 'onClose'>) {
  const sheet = useSheet()
  const [note, setNote] = useState(initialNote)
  const { draft, setValue, entries, hasBadInput, badUnitIds, dirty } = useMeasurementDraft(
    units,
    initialMeasurements,
  )
  useSheetDirty(dirty || note !== initialNote)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (hasBadInput) return
    // Omitted rather than empty for a task that tracks nothing: "leave the
    // day's readings alone" is the safer of the two, and there are none anyway.
    onSave(note.trim(), units.length > 0 ? entries : undefined)
    void sheet.close()
  }

  return (
    <form className="sheet-form" onSubmit={handleSubmit}>
      <SheetHeader
        title="Failed"
        leading={<SheetCancelButton />}
        trailing={
          <SheetButton type="submit" bold disabled={hasBadInput}>
            Save
          </SheetButton>
        }
      />
      <SheetBody>
        <p className="sheet-subject">{taskTitle}</p>
        <FormSection header="What got in the way?">
          <TextAreaRow
            autoFocus
            value={note}
            onChange={setNote}
            placeholder="e.g. Work ran late, no time in the evening"
          />
        </FormSection>

        <MeasurementFields
          units={units}
          draft={draft}
          onChange={setValue}
          taskId={taskId}
          unitReadings={unitReadings}
          badUnitIds={badUnitIds}
        />

        {canClear && (
          <FormSection footer="Back to unanswered - no fail, no reason.">
            <ButtonRow
              label="Clear Day"
              tone="destructive"
              onClick={() => {
                onClear()
                void sheet.close()
              }}
            />
          </FormSection>
        )}
      </SheetBody>
    </form>
  )
}
