import { useState } from 'react'
import type { DayMeasurement, DayTaskUnit, MeasurementInput } from '../api/tracker'
import { parseDecimal } from '../lib/units'

/**
 * The half-typed state of a set of measurement fields.
 *
 * Drafts are strings, not numbers: an empty box and a half-typed "82." both
 * have to be representable and neither is a number. Read back through
 * parseDecimal, so "75,5" off a German decimal keyboard counts. Shared by the
 * log sheet and the fail sheet so the two can't disagree about what an
 * emptied box means.
 *
 * Seeded once from `initial` rather than in an effect - both callers mount the
 * sheet only while it's open and key it by task id, so the state starts fresh
 * anyway.
 */
export function useMeasurementDraft(
  units: DayTaskUnit[],
  initial: Record<string, DayMeasurement>,
) {
  const [seed] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      units
        .filter((unit) => initial[unit.id] !== undefined)
        .map((unit) => [unit.id, String(initial[unit.id].value)]),
    ),
  )
  const [draft, setDraft] = useState(seed)

  function setValue(unitId: string, value: string) {
    setDraft((current) => ({ ...current, [unitId]: value }))
  }

  const parsed = units.map((unit) => ({ unit, value: parseDecimal(draft[unit.id] ?? '') }))

  // A box with something unparseable in it is a typo, not an empty box.
  const badUnitIds = parsed
    .filter(({ value }) => value !== null && Number.isNaN(value))
    .map(({ unit }) => unit.id)
  const hasBadInput = badUnitIds.length > 0

  /**
   * What to send. Blank boxes are simply absent, which the server reads as
   * "delete that reading" - so clearing a box clears its value, which is what
   * it looks like it should do.
   */
  const entries: MeasurementInput[] = hasBadInput
    ? []
    : parsed
        .filter((entry): entry is { unit: DayTaskUnit; value: number } => entry.value !== null)
        .map(({ unit, value }) => ({ unitId: unit.id, value }))

  const dirty = units.some((unit) => (draft[unit.id] ?? '') !== (seed[unit.id] ?? ''))

  return { draft, setValue, entries, hasBadInput, badUnitIds, dirty }
}
