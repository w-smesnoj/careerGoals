import type { DayTaskUnit, DayUnitReading } from '../api/tracker'
import { formatMeasurement, parseDecimal } from '../lib/units'
import { FormSection, NumberRow } from './FormRows'

/**
 * One number row per unit a task tracks. Rendered by both sheets that can
 * record values - the log sheet when a task is ticked, and the fail sheet,
 * since missing a review and logging your hours anyway is an ordinary Tuesday.
 *
 * For a unit that adds up, the footnote says what else already counts toward
 * the day's total - typed on the tracking page, or captured by another task.
 *
 * State lives in the caller, via useMeasurementDraft.
 */
export function MeasurementFields({
  units,
  draft,
  onChange,
  autoFocusFirst = false,
  taskId,
  unitReadings = {},
  badUnitIds = [],
}: {
  units: DayTaskUnit[]
  draft: Record<string, string>
  onChange: (unitId: string, value: string) => void
  /** The log sheet opens straight onto its first box; the fail sheet focuses its note. */
  autoFocusFirst?: boolean
  /** This task's id - its own reading is excluded from a 'sum' unit's "already
   *  logged today" list, since that reading is what the field itself edits. */
  taskId?: string
  /** Every reading recorded today, keyed by unit id. */
  unitReadings?: Record<string, DayUnitReading[]>
  /** Fields holding something that isn't a number. */
  badUnitIds?: string[]
}) {
  if (units.length === 0) return null

  const notes = units
    .filter((unit) => unit.aggregation === 'sum')
    .map((unit) => {
      const others = (unitReadings[unit.id] ?? []).filter((reading) => reading.taskId !== taskId)
      if (others.length === 0) return null
      const own = parseDecimal(draft[unit.id] ?? '')
      const total = others.reduce(
        (sum, reading) => sum + reading.value,
        own !== null && !Number.isNaN(own) ? own : 0,
      )
      const listed = others
        .map((reading) => `${formatMeasurement(reading.value, unit)} (${reading.taskTitle ?? 'tracking'})`)
        .join(', ')
      return `${unit.name}: ${listed} already logged today - ${formatMeasurement(total, unit)} in all.`
    })
    .filter((line): line is string => line !== null)

  return (
    <FormSection
      header="Numbers"
      footer={
        badUnitIds.length > 0
          ? 'Enter a number, or leave it blank.'
          : notes.length > 0
            ? notes.join(' ')
            : undefined
      }
    >
      {units.map((unit, index) => (
        <NumberRow
          key={unit.id}
          label={unit.name}
          symbol={unit.symbol}
          value={draft[unit.id] ?? ''}
          autoFocus={autoFocusFirst && index === 0}
          invalid={badUnitIds.includes(unit.id)}
          onChange={(value) => onChange(unit.id, value)}
        />
      ))}
    </FormSection>
  )
}
