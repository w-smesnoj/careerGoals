import { useState, type FormEvent } from 'react'
import { unitAggregations, type TrackingUnit, type UnitAggregation } from '../api/trackingUnits'
import {
  useCreateTrackingUnit,
  useDeleteTrackingUnit,
  useUpdateTrackingUnit,
} from '../hooks/useTrackingUnits'
import { useTracker } from '../hooks/useTracker'
import { useDraft } from '../hooks/useDraft'
import { useSheet, useSheetDirty } from '../hooks/useSheet'
import { decimalText, parseDecimal } from '../lib/units'
import { ActionSheet } from './ActionSheet'
import { ButtonRow, FormSection, NumberRow, SelectRow, TextFieldRow } from './FormRows'
import { Sheet, SheetBody, SheetButton, SheetCancelButton, SheetHeader } from './Sheet'

const DECIMAL_OPTIONS = ['0', '1', '2', '3'].map((value) => ({ value, label: value }))

const AGGREGATION_LABELS: Record<UnitAggregation, string> = {
  latest: 'Latest reading',
  sum: 'Day’s total',
}

export interface UnitSheetProps {
  /** The unit being edited; absent for a new one. */
  unit?: TrackingUnit | null
  onClose: () => void
  onSaved?: (unit: TrackingUnit) => void
  /** After a delete - the unit's page has nothing left to show. */
  onDeleted?: () => void
}

/**
 * "New Unit" and "Edit Unit": what's measured, in what, how precisely, how a
 * day's readings combine, and where you want it to end up. Its readings live
 * on the unit's page now, not in here.
 */
export function UnitSheet({ onClose, ...props }: UnitSheetProps) {
  return (
    <Sheet label={props.unit ? `Edit ${props.unit.name}` : 'New tracking unit'} onClose={onClose}>
      <UnitForm {...props} />
    </Sheet>
  )
}

function UnitForm({ unit, onSaved, onDeleted }: Omit<UnitSheetProps, 'onClose'>) {
  const sheet = useSheet()
  const editing = Boolean(unit)
  const { draft, set, dirty } = useDraft(() => ({
    name: unit?.name ?? '',
    symbol: unit?.symbol ?? '',
    decimals: String(unit?.decimals ?? 1),
    aggregation: unit?.aggregation ?? ('latest' as UnitAggregation),
    target: decimalText(unit?.target),
  }))
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  useSheetDirty(dirty)

  const createUnit = useCreateTrackingUnit()
  const updateUnit = useUpdateTrackingUnit()
  const deleteUnit = useDeleteTrackingUnit()
  const mutation = editing ? updateUnit : createUnit

  // A weekly total adds a unit's readings up; switching it to "latest" would
  // leave that limit judging nothing - so it can't be switched while one does.
  // A day's figure or a weekly average works on either, so they don't hold the unit.
  const { data: tracker } = useTracker()
  const judgedBy = unit
    ? (tracker?.goals ?? [])
        .flatMap((goal) => goal.tasks)
        .filter(
          (task) =>
            task.limit?.unitId === unit.id && task.limit.period === 'week' && task.limit.measure !== 'average',
        )
    : []
  const aggregationLocked = judgedBy.length > 0

  const target = parseDecimal(draft.target)
  const targetInvalid = target !== null && Number.isNaN(target)
  const valid = Boolean(draft.name.trim()) && !targetInvalid

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || mutation.isPending) return
    const input = {
      name: draft.name.trim(),
      symbol: draft.symbol.trim(),
      decimals: Number(draft.decimals),
      aggregation: draft.aggregation,
      target,
    }
    const done = {
      onSuccess: (saved: TrackingUnit) => {
        onSaved?.(saved)
        sheet.setDirty(false)
        void sheet.close()
      },
    }
    if (unit) updateUnit.mutate({ id: unit.id, ...input }, done)
    else createUnit.mutate(input, done)
  }

  return (
    <form className="sheet-form" onSubmit={handleSubmit}>
      <SheetHeader
        title={editing ? 'Edit Unit' : 'New Unit'}
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
            value={draft.name}
            onChange={(name) => set({ name })}
            placeholder="Name - e.g. Weight"
            autoFocus={!editing}
            maxLength={60}
          />
          <TextFieldRow
            label="Symbol"
            value={draft.symbol}
            onChange={(symbol) => set({ symbol })}
            placeholder="kg (optional)"
            maxLength={12}
            autoCapitalize="none"
          />
          <SelectRow
            label="Decimal places"
            value={draft.decimals}
            onChange={(decimals) => set({ decimals })}
            options={DECIMAL_OPTIONS}
          />
        </FormSection>

        <FormSection
          footer={
            aggregationLocked
              ? `A limit adds this unit up (${judgedBy.map((task) => task.title).join(', ')}), so it stays a day’s total while that limit exists.`
              : 'Weight is the latest reading; coffees or steps add up over a day.'
          }
        >
          <SelectRow
            label="Combine"
            value={draft.aggregation}
            onChange={(aggregation) => set({ aggregation })}
            disabled={aggregationLocked}
            options={unitAggregations.map((option) => ({
              value: option,
              label: AGGREGATION_LABELS[option],
            }))}
          />
        </FormSection>

        <FormSection footer="Drawn as a dashed line on its charts. Leave empty for none.">
          <NumberRow
            label="Target"
            symbol={draft.symbol}
            placeholder="None"
            value={draft.target}
            invalid={targetInvalid}
            onChange={(value) => set({ target: value })}
          />
        </FormSection>

        {unit && (
          <FormSection>
            <ButtonRow
              label={deleteUnit.isPending ? 'Deleting…' : 'Delete Unit'}
              tone="destructive"
              disabled={deleteUnit.isPending}
              onClick={() => setConfirmingDelete(true)}
            />
          </FormSection>
        )}
      </SheetBody>

      {confirmingDelete && unit && (
        <ActionSheet
          title={`Delete “${unit.name}”?`}
          message="Only a unit nothing points at can go - no readings, and no task asking for it."
          actions={[
            {
              label: 'Delete Unit',
              destructive: true,
              onSelect: () =>
                deleteUnit.mutate(unit.id, {
                  onSuccess: async () => {
                    sheet.setDirty(false)
                    await sheet.close()
                    onDeleted?.()
                  },
                  // A 409 names what's still holding on to it.
                  onError: (error) => setRefusal(error.message),
                }),
            },
          ]}
          onClose={() => setConfirmingDelete(false)}
        />
      )}

      {refusal && (
        <ActionSheet
          title="Can’t Delete This Unit"
          message={refusal}
          actions={[]}
          cancelLabel="OK"
          onClose={() => setRefusal(null)}
        />
      )}
    </form>
  )
}
