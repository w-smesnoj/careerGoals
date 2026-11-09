import type { FormEvent } from 'react'
import type { DayMeasurement, DayTaskUnit, DayUnitReading, MeasurementInput } from '../api/tracker'
import { useMeasurementDraft } from '../hooks/useMeasurementDraft'
import { useSheet, useSheetDirty } from '../hooks/useSheet'
import { ButtonRow, FormSection } from './FormRows'
import { MeasurementFields } from './MeasurementFields'
import { Sheet, SheetBody, SheetButton, SheetCancelButton, SheetHeader } from './Sheet'

interface LogMeasurementsDialogProps {
  taskId: string
  taskTitle: string
  /** What to ask for - the units attached to the task. */
  units: DayTaskUnit[]
  /** Already-recorded values, keyed by unit id, when reopening a done row. */
  initial: Record<string, DayMeasurement>
  /** Every reading recorded today, keyed by unit id - so a 'sum' unit's field
   *  can show what else already counts toward the total. */
  unitReadings: Record<string, DayUnitReading[]>
  /** Labels the skip: "Skip" the first time, "Clear values" once there are some. */
  canClear: boolean
  /** The sheet closes itself after either; `onClose` runs once it's gone. */
  onSave: (measurements: MeasurementInput[]) => void
  onSkip: () => void
  onClose: () => void
}

/**
 * Asks for a task's tangible values as it's ticked off.
 *
 * Mounted only while open and keyed by task id by the caller, so the fields
 * start from the right values without an effect to reset them.
 */
export function LogMeasurementsDialog({ onClose, ...props }: LogMeasurementsDialogProps) {
  return (
    <Sheet label={`Log - ${props.taskTitle}`} onClose={onClose}>
      <LogForm {...props} />
    </Sheet>
  )
}

function LogForm({
  taskId,
  taskTitle,
  units,
  initial,
  unitReadings,
  canClear,
  onSave,
  onSkip,
}: Omit<LogMeasurementsDialogProps, 'onClose'>) {
  const sheet = useSheet()
  const { draft, setValue, entries, hasBadInput, badUnitIds, dirty } = useMeasurementDraft(
    units,
    initial,
  )
  useSheetDirty(dirty)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (hasBadInput) return
    onSave(entries)
    void sheet.close()
  }

  return (
    <form className="sheet-form" onSubmit={handleSubmit}>
      <SheetHeader
        title="Done"
        leading={<SheetCancelButton />}
        trailing={
          <SheetButton type="submit" bold disabled={hasBadInput}>
            Save
          </SheetButton>
        }
      />
      <SheetBody>
        <p className="sheet-subject">{taskTitle}</p>
        <MeasurementFields
          units={units}
          draft={draft}
          onChange={setValue}
          autoFocusFirst
          taskId={taskId}
          unitReadings={unitReadings}
          badUnitIds={badUnitIds}
        />
        <FormSection
          footer={
            canClear
              ? 'Marks the day done without any numbers against it.'
              : 'Marks the day done without recording anything.'
          }
        >
          <ButtonRow
            label={canClear ? 'Clear Values' : 'Done Without Numbers'}
            onClick={() => {
              onSkip()
              void sheet.close()
            }}
          />
        </FormSection>
      </SheetBody>
    </form>
  )
}
