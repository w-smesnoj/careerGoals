import type { TaskFrequencyType } from '../api/tasks'
import type { FrequencyDraft } from '../lib/frequencyDraft'
import { WEEKDAYS_MONDAY_FIRST } from '../lib/taskLabels'
import { parseDecimal } from '../lib/units'
import { ChoiceList, FormSection, MultiChoiceList, NumberRow, SelectRow } from './FormRows'

const MONTH_DAYS = Array.from({ length: 31 }, (_, index) => index + 1)

const TYPE_OPTIONS: { value: TaskFrequencyType; label: string; hint: string }[] = [
  { value: 'once', label: 'Once', hint: 'Done when it’s done.' },
  { value: 'daily', label: 'Daily', hint: 'Every day.' },
  { value: 'weekly', label: 'Weekly', hint: 'On the weekdays you pick.' },
  { value: 'monthly', label: 'Monthly', hint: 'On the days of the month you pick.' },
  { value: 'everyNDays', label: 'Every few days', hint: 'Every 2nd, 3rd, 10th day…' },
]

function toggle(list: number[], value: number): number[] {
  return list.includes(value)
    ? list.filter((entry) => entry !== value)
    : [...list, value].sort((a, b) => a - b)
}

interface FrequencyFieldsProps {
  value: FrequencyDraft
  onChange: (draft: FrequencyDraft) => void
  /**
   * How to describe where an 'everyNDays' cadence will start. Creating, it runs
   * from the task's start day; editing, never from a day already gone by.
   */
  anchorHint: string
}

/**
 * The repeat controls - the task sheet's Repeat page, for a new task and an
 * existing one alike, so the two can't drift. Holds no state of its own: the
 * draft lives with the sheet that saves it.
 */
export function FrequencyFields({ value, onChange, anchorHint }: FrequencyFieldsProps) {
  const set = (patch: Partial<FrequencyDraft>) => onChange({ ...value, ...patch })

  return (
    <>
      <FormSection>
        <ChoiceList
          name="Repeat"
          value={value.type}
          onChange={(type) => set({ type })}
          options={TYPE_OPTIONS}
        />
      </FormSection>

      {value.type === 'weekly' && (
        <FormSection
          header="On"
          footer={value.daysOfWeek.length === 0 ? 'Pick at least one day.' : undefined}
        >
          <MultiChoiceList
            name="Days of the week"
            values={value.daysOfWeek.map(String)}
            onToggle={(day) => set({ daysOfWeek: toggle(value.daysOfWeek, Number(day)) })}
            options={WEEKDAYS_MONDAY_FIRST.map((day) => ({
              value: String(day.index),
              label: `Every ${day.long}`,
            }))}
          />
        </FormSection>
      )}

      {value.type === 'monthly' && (
        <FormSection
          header="On day"
          footer={
            value.daysOfMonth.length === 0
              ? 'Pick at least one day.'
              : 'A month without the day (the 31st in April) skips it.'
          }
        >
          {/* The calendar-grid picker iOS uses for "Each month on…" - native
              checkboxes underneath, one per day. */}
          <div className="form-row month-grid" role="group" aria-label="Days of the month">
            {MONTH_DAYS.map((day) => (
              <label key={day} className="month-day" data-checked={value.daysOfMonth.includes(day) || undefined}>
                <input
                  type="checkbox"
                  className="visually-hidden"
                  checked={value.daysOfMonth.includes(day)}
                  onChange={() => set({ daysOfMonth: toggle(value.daysOfMonth, day) })}
                />
                {day}
              </label>
            ))}
          </div>
        </FormSection>
      )}

      {value.type === 'everyNDays' && (
        <FormSection footer={anchorHint}>
          <NumberRow
            label="Every"
            symbol="days"
            integer
            // Empty and half-typed values land as NaN; keeping them in the
            // draft rather than coercing lets the field be cleared and retyped,
            // and isFrequencyValid holds Save until it's a real one (2-365).
            value={Number.isNaN(value.intervalDays) ? '' : String(value.intervalDays)}
            invalid={
              !Number.isInteger(value.intervalDays) ||
              value.intervalDays < 2 ||
              value.intervalDays > 365
            }
            onChange={(text) => {
              const parsed = parseDecimal(text)
              set({ intervalDays: parsed === null ? NaN : Math.trunc(parsed) })
            }}
          />
          {/* Single choice, unlike the weekly page: a cadence has one starting
              point, not a set of them. */}
          <SelectRow
            label="Starting on a"
            value={String(value.startWeekday)}
            onChange={(day) => set({ startWeekday: Number(day) })}
            options={WEEKDAYS_MONDAY_FIRST.map((day) => ({
              value: String(day.index),
              label: day.long,
            }))}
          />
        </FormSection>
      )}
    </>
  )
}
