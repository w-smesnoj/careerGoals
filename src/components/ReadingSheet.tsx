import { useState, type FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { measurementsApi, type Measurement } from '../api/measurements'
import type { UnitAggregation } from '../api/trackingUnits'
import {
  useCreateMeasurement,
  useDayReadings,
  useUpdateMeasurement,
} from '../hooks/useMeasurements'
import { useDraft } from '../hooks/useDraft'
import { useSheet, useSheetDirty } from '../hooks/useSheet'
import { formatDayLong, formatDayShort, todayKey } from '../lib/date'
import { decimalText, formatMeasurement, parseDecimal } from '../lib/units'
import { hideMeasurement, refetchEverything } from '../lib/optimistic'
import { undoable } from '../lib/toast'
import { ButtonRow, DateRow, FormRow, FormSection, NumberRow, TextFieldRow } from './FormRows'
import { ChevronRightIcon } from './icons'
import {
  Sheet,
  SheetBackButton,
  SheetBody,
  SheetButton,
  SheetCancelButton,
  SheetHeader,
  SheetPages,
} from './Sheet'

/** Only what the sheet reads of a unit - a TrackingUnit or a day row's unit. */
export interface ReadingUnit {
  id: string
  name: string
  symbol: string
  decimals: number
  aggregation: UnitAggregation
}

/** A reading being edited. A full Measurement satisfies it. */
export interface EditableReading {
  id: string
  value: number
  date: string
  note?: string
  /** Set when ticking a task produced it. */
  taskTitle?: string | null
}

export interface ReadingSheetProps {
  unit: ReadingUnit
  /** The day in view - where a new reading lands unless the date is changed. */
  date: string
  /** The reading to edit. Absent: add one (for a 'latest' unit, the day's
   *  existing reading is opened instead, if it has one). */
  reading?: EditableReading
  onClose: () => void
}

/**
 * "Add Data" and "Edit Reading" - one number, on one day, with an optional note.
 *
 *  - A unit that adds up (coffees, steps) also lists what's already logged on
 *    that day, with its total; tapping one slides to editing it, while Save on
 *    the root adds the new entry. That's everything the old day sheet did.
 *  - A unit whose latest reading counts (weight) opens straight on the day's
 *    reading when there is one, rather than stacking a second.
 *  - Editing, the date is read-only: the server can't move a reading between
 *    days (a task-borne one could collide with the one already there).
 */
export function ReadingSheet({ onClose, ...props }: ReadingSheetProps) {
  const adding = !props.reading
  return (
    <Sheet
      label={adding ? `Add ${props.unit.name}` : `Edit ${props.unit.name}`}
      size={adding && props.unit.aggregation === 'sum' ? 'large' : 'auto'}
      onClose={onClose}
    >
      <ReadingRoot {...props} />
    </Sheet>
  )
}

function ReadingRoot({ unit, date, reading }: Omit<ReadingSheetProps, 'onClose'>) {
  const opensExisting = !reading && unit.aggregation === 'latest'
  const { data: dayReadings, isPending } = useDayReadings(unit.id, date, { enabled: opensExisting })

  if (opensExisting) {
    if (isPending) {
      return (
        <>
          <SheetHeader title={unit.name} leading={<SheetCancelButton />} />
          <SheetBody>
            <p className="sheet-note">Loading…</p>
          </SheetBody>
        </>
      )
    }
    // Newest first from the server, so this is the one that counts.
    const latest = dayReadings?.[0]
    return <ReadingForm key={latest?.id ?? 'new'} unit={unit} date={date} reading={latest} />
  }
  return <ReadingForm unit={unit} date={date} reading={reading} />
}

function ReadingForm({ unit, date, reading }: Omit<ReadingSheetProps, 'onClose'>) {
  const sheet = useSheet()
  const queryClient = useQueryClient()
  const editing = Boolean(reading)
  const today = todayKey()
  const { draft, set, dirty, isChanged } = useDraft(() => ({
    value: reading ? decimalText(reading.value) : '',
    date: reading?.date ?? (date > today ? today : date),
    note: reading?.note ?? '',
  }))
  const [page, setPage] = useState<Measurement | null>(null)
  useSheetDirty(dirty)

  const createMeasurement = useCreateMeasurement()
  const updateMeasurement = useUpdateMeasurement()
  const mutation = editing ? updateMeasurement : createMeasurement

  // The day's other entries, for a unit that adds up - whichever day is picked.
  const listsDay = !editing && unit.aggregation === 'sum'
  const { data: dayReadings } = useDayReadings(unit.id, draft.date, { enabled: listsDay })
  const entries = listsDay ? (dayReadings ?? []) : []
  const dayTotal = entries.reduce((sum, entry) => sum + entry.value, 0)

  const value = parseDecimal(draft.value)
  const valid = value !== null && !Number.isNaN(value) && draft.date <= today

  function finish() {
    sheet.setDirty(false)
    void sheet.close()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // Return on the pushed entry page is about that entry, not the new one.
    if (page || !valid || value === null || mutation.isPending) return
    if (reading) {
      const patch: { value?: number; note?: string } = {}
      if (isChanged('value')) patch.value = value
      if (isChanged('note')) patch.note = draft.note.trim()
      if (Object.keys(patch).length === 0) {
        finish()
        return
      }
      updateMeasurement.mutate({ id: reading.id, ...patch }, { onSuccess: finish })
    } else {
      createMeasurement.mutate(
        { unitId: unit.id, value, date: draft.date, note: draft.note.trim() || undefined },
        { onSuccess: finish },
      )
    }
  }

  async function remove(target: EditableReading) {
    sheet.setDirty(false)
    await sheet.close()
    undoable({
      message: `Deleted ${formatMeasurement(target.value, unit)} from ${formatDayShort(target.date)}`,
      apply: () => hideMeasurement(queryClient, target.id),
      run: (options) =>
        measurementsApi.remove(target.id, options).finally(() => refetchEverything(queryClient)),
      undo: () => refetchEverything(queryClient),
      failure: 'Couldn’t delete it',
    })
  }

  const title = editing ? 'Edit Reading' : 'Add Data'

  const root = (
    <>
      <SheetHeader
        title={title}
        leading={<SheetCancelButton />}
        trailing={
          <SheetButton type="submit" bold disabled={!valid || mutation.isPending || (editing && !dirty)}>
            {mutation.isPending ? 'Saving…' : editing ? 'Save' : 'Add'}
          </SheetButton>
        }
      />
      <SheetBody>
        <p className="sheet-subject">
          {unit.name}
          {reading?.taskTitle && <span className="sheet-subject-sub">From “{reading.taskTitle}”</span>}
        </p>
        <FormSection footer={mutation.isError ? mutation.error.message : undefined}>
          <NumberRow
            label="Value"
            symbol={unit.symbol}
            value={draft.value}
            autoFocus
            invalid={value !== null && Number.isNaN(value)}
            onChange={(next) => set({ value: next })}
          />
          {editing ? (
            <FormRow label="Date">
              <span className="form-value">{formatDayLong(draft.date)}</span>
            </FormRow>
          ) : (
            <DateRow label="Date" value={draft.date} max={today} onChange={(next) => set({ date: next })} />
          )}
          <TextFieldRow
            value={draft.note}
            onChange={(note) => set({ note })}
            placeholder="Note (optional)"
            maxLength={500}
          />
        </FormSection>

        {listsDay && entries.length > 0 && (
          <FormSection
            header={draft.date === today ? 'Logged today' : `Logged ${formatDayShort(draft.date)}`}
            footer={`${formatMeasurement(dayTotal, unit)} so far${
              value !== null && !Number.isNaN(value)
                ? ` - ${formatMeasurement(dayTotal + value, unit)} with this one`
                : ''
            }.`}
          >
            {entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="form-row form-row-button"
                onClick={() => setPage(entry)}
              >
                <span className="form-label form-label-stack">
                  <span className="tabular">{formatMeasurement(entry.value, unit)}</span>
                  {(entry.taskTitle || entry.note) && (
                    <span className="form-sublabel">
                      {[
                        entry.taskTitle && `from “${entry.taskTitle}”`,
                        entry.note,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </span>
                <span className="form-chevron" aria-hidden="true">
                  <ChevronRightIcon />
                </span>
              </button>
            ))}
          </FormSection>
        )}

        {reading && (
          <FormSection>
            <ButtonRow label="Delete Reading" tone="destructive" onClick={() => void remove(reading)} />
          </FormSection>
        )}
      </SheetBody>
    </>
  )

  return (
    <form className="sheet-form" onSubmit={handleSubmit}>
      <SheetPages
        page={page ? 'entry' : null}
        root={root}
        pages={{
          entry: page && (
            <EntryPage
              key={page.id}
              unit={unit}
              entry={page}
              backLabel={title}
              onBack={() => setPage(null)}
              onDelete={() => void remove(page)}
            />
          ),
        }}
      />
    </form>
  )
}

/** One of the day's entries, edited in its own pushed page. */
function EntryPage({
  unit,
  entry,
  backLabel,
  onBack,
  onDelete,
}: {
  unit: ReadingUnit
  entry: Measurement
  backLabel: string
  onBack: () => void
  onDelete: () => void
}) {
  const [value, setValue] = useState(decimalText(entry.value))
  const [note, setNote] = useState(entry.note)
  const updateMeasurement = useUpdateMeasurement()
  const parsed = parseDecimal(value)
  const valid = parsed !== null && !Number.isNaN(parsed)
  const changed = value !== decimalText(entry.value) || note !== entry.note

  function save() {
    if (!valid || parsed === null) return
    updateMeasurement.mutate(
      { id: entry.id, value: parsed, note: note.trim() },
      { onSuccess: onBack },
    )
  }

  return (
    <>
      <SheetHeader
        title="Edit Reading"
        leading={<SheetBackButton label={backLabel} onClick={onBack} />}
        trailing={
          <SheetButton bold disabled={!valid || !changed || updateMeasurement.isPending} onClick={save}>
            Save
          </SheetButton>
        }
      />
      <SheetBody>
        <FormSection
          footer={
            updateMeasurement.isError
              ? updateMeasurement.error.message
              : entry.taskTitle
                ? `Recorded by ticking “${entry.taskTitle}”.`
                : undefined
          }
        >
          <NumberRow
            label="Value"
            symbol={unit.symbol}
            value={value}
            invalid={parsed !== null && Number.isNaN(parsed)}
            onChange={setValue}
          />
          <FormRow label="Date">
            <span className="form-value">{formatDayLong(entry.date)}</span>
          </FormRow>
          <TextFieldRow value={note} onChange={setNote} placeholder="Note (optional)" maxLength={500} />
        </FormSection>
        <FormSection>
          <ButtonRow label="Delete Reading" tone="destructive" onClick={onDelete} />
        </FormSection>
      </SheetBody>
    </>
  )
}
