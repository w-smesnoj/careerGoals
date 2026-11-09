import { useMemo, useState, type FormEvent } from 'react'
import type { SpecialDay, SpecialDayCategory } from '../api/specialDays'
import {
  useCategoryIndex,
  useCreateSpecialDay,
  useDeleteSpecialDay,
  useSpecialDays,
  useUpdateSpecialDay,
} from '../hooks/useSpecialDays'
import { usePrefs } from '../hooks/usePrefs'
import { useSheet, useSheetDirty } from '../hooks/useSheet'
import { bundeslaender } from '../lib/holidays'
import { formatDayShort, shiftDay, todayKey } from '../lib/date'
import { lastAnnualEnd } from '../lib/specialDays'
import {
  ButtonRow,
  DateRow,
  FormSection,
  NavRow,
  SelectRow,
  SwitchRow,
  TextFieldRow,
} from './FormRows'
import { Sheet, SheetBody, SheetButton, SheetHeader } from './Sheet'
import { SpecialDayCategorySheet } from './SpecialDayCategorySheet'
import { SpecialDayGlyph } from './specialDayGlyphs'
import { TrashIcon } from './icons'

/** The category picker's last entry, which makes a category rather than picking one. */
const NEW_CATEGORY = '__new'

/** The tile a category is drawn as: its glyph on its colour. */
function CategoryTile({ category }: { category: SpecialDayCategory }) {
  return (
    <span className="ios-icon-tile" data-hue={category.color}>
      <SpecialDayGlyph icon={category.icon} />
    </span>
  )
}

/**
 * How a new day in a category starts out: the way its latest day was entered,
 * so a second birthday already repeats and a second trip already spans days.
 * A category with nothing in it yet starts on a single, one-off day.
 */
function shapeOf(latest: SpecialDay | undefined) {
  return {
    multiDay: latest ? latest.startDate !== latest.endDate : false,
    annual: latest?.recurrence === 'annual',
    countYears: latest?.recurrence === 'annual' ? latest.yearKnown : false,
  }
}

/**
 * Everything about days that simply happen: which Bundesland's holidays to
 * show, the days entered by hand, and the categories they're filed under -
 * each of which is a filter on the calendar.
 *
 * The region picker lives here rather than in the sidebar because it's set once
 * and then forgotten, and because it belongs with the other things that decide
 * what this row contains.
 */
export function SpecialDaysDialog({ onClose }: { onClose: () => void }) {
  return (
    <Sheet label="Special days" size="large" onClose={onClose}>
      <SpecialDays />
    </Sheet>
  )
}

function SpecialDays() {
  const sheet = useSheet()
  const { bundesland, setBundesland } = usePrefs()
  const { data: specialDays, isPending } = useSpecialDays()
  const categories = useCategoryIndex()

  const createSpecialDay = useCreateSpecialDay()
  const updateSpecialDay = useUpdateSpecialDay()
  const deleteSpecialDay = useDeleteSpecialDay()

  const [editing, setEditing] = useState<SpecialDay | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [startDate, setStartDate] = useState(todayKey)
  const [endDate, setEndDate] = useState(todayKey)
  // Null until set by hand or by editing: until then, the category's own shape.
  const [multiDayChoice, setMultiDay] = useState<boolean | null>(null)
  const [annualChoice, setAnnual] = useState<boolean | null>(null)
  const [countYearsChoice, setCountYears] = useState<boolean | null>(null)
  const [note, setNote] = useState('')
  // The category sheet over this one: `category` null makes a new one, and
  // `pick` files the day being entered under it once it's made.
  const [categorySheet, setCategorySheet] = useState<{
    category: SpecialDayCategory | null
    pick?: boolean
  } | null>(null)

  // Built once: it parses the package's country data to get the sixteen names.
  const states = useMemo(() => bundeslaender(), [])

  // Stored days per category, in the order they start - for the grouped list,
  // the counts, and the shape a new day takes.
  const daysByCategory = useMemo(() => {
    const grouped = new Map<string, SpecialDay[]>()
    for (const day of specialDays ?? []) {
      const list = grouped.get(day.categoryId)
      if (list) list.push(day)
      else grouped.set(day.categoryId, [day])
    }
    return grouped
  }, [specialDays])

  // Holidays are mostly computed, so a new day goes into the first category of
  // your own unless one was picked.
  const fallback = categories.list.find((candidate) => !candidate.builtin) ?? categories.list[0]
  const category = (categoryId ? categories.byId.get(categoryId) : undefined) ?? fallback
  const shape = shapeOf(
    category &&
      (daysByCategory.get(category.id) ?? []).reduce<SpecialDay | undefined>(
        (latest, day) => (!latest || day.createdAt > latest.createdAt ? day : latest),
        undefined,
      ),
  )
  const multiDay = multiDayChoice ?? shape.multiDay
  const annual = annualChoice ?? shape.annual
  const countYears = countYearsChoice ?? shape.countYears

  // Something typed but not yet added is worth asking about before it's lost.
  useSheetDirty(Boolean(title.trim()) || editing !== null)

  function resetForm() {
    setEditing(null)
    setTitle('')
    setStartDate(todayKey())
    setEndDate(todayKey())
    setMultiDay(null)
    setAnnual(null)
    setCountYears(null)
    setNote('')
  }

  function startEditing(day: SpecialDay) {
    setEditing(day)
    setCategoryId(day.categoryId)
    setTitle(day.title)
    setStartDate(day.startDate)
    setEndDate(day.endDate)
    setMultiDay(day.startDate !== day.endDate)
    setAnnual(day.recurrence === 'annual')
    setCountYears(day.recurrence === 'annual' && day.yearKnown)
    setNote(day.note)
  }

  function chooseCategory(id: string) {
    setCategoryId(id)
    // A day being edited keeps what it is; a new one takes the category's shape.
    if (editing) return
    setMultiDay(null)
    setAnnual(null)
    setCountYears(null)
  }

  function changeMultiDay(on: boolean) {
    setMultiDay(on)
    // Switched on, it should already read as a range rather than a one-day
    // span or whatever stale end the form was holding before the start moved.
    if (on && endDate <= startDate) setEndDate(shiftDay(startDate, 1))
  }

  function forgetCategory(id: string) {
    if (editing?.categoryId === id) resetForm()
    if (categoryId === id) setCategoryId(null)
  }

  // A repeating range has to end before its next year's copy begins.
  const latestEnd = annual ? lastAnnualEnd(startDate) : undefined
  const isValid =
    category !== undefined &&
    Boolean(title.trim()) &&
    (!multiDay || (endDate >= startDate && (!latestEnd || endDate <= latestEnd)))

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isValid || !category) return

    const input = {
      categoryId: category.id,
      title: title.trim(),
      startDate,
      // A single day stores its end equal to its start, so every consumer
      // reads one shape whether or not it's a range.
      endDate: multiDay ? endDate : startDate,
      recurrence: (annual ? 'annual' : 'none') as 'annual' | 'none',
      // Only a repeating day has years to count; a one-off keeps the default.
      yearKnown: annual ? countYears : true,
      note: note.trim(),
    }

    if (editing) updateSpecialDay.mutate({ id: editing.id, ...input }, { onSuccess: resetForm })
    else createSpecialDay.mutate(input, { onSuccess: resetForm })
  }

  const saving = createSpecialDay.isPending || updateSpecialDay.isPending
  const error = createSpecialDay.error ?? updateSpecialDay.error ?? deleteSpecialDay.error

  return (
    <>
      <SheetHeader
        title="Special Days"
        trailing={
          <SheetButton
            bold
            onClick={() => {
              sheet.setDirty(false)
              void sheet.close()
            }}
          >
            Done
          </SheetButton>
        }
      />
      <SheetBody>
        <FormSection
          header="Public holidays"
          footer="Only days that are actually work-free where you are get highlighted. Heiliger Abend and Silvester are shown, but they aren't public holidays."
        >
          <SelectRow
            label="Region"
            value={bundesland}
            onChange={setBundesland}
            options={[
              { value: '', label: 'Germany - nationwide' },
              ...states.map((state) => ({ value: state.code, label: state.name })),
            ]}
          />
        </FormSection>

        <form onSubmit={handleSubmit}>
          <FormSection header={editing ? 'Edit Day' : 'New Day'}>
            {category ? (
              <SelectRow
                label="Category"
                icon={<CategoryTile category={category} />}
                value={category.id}
                onChange={(value) => {
                  if (value === NEW_CATEGORY) setCategorySheet({ category: null, pick: true })
                  else chooseCategory(value)
                }}
                options={[
                  ...categories.list.map((option) => ({ value: option.id, label: option.name })),
                  { value: NEW_CATEGORY, label: 'New Category…' },
                ]}
              />
            ) : (
              <ButtonRow
                label="New Category…"
                onClick={() => setCategorySheet({ category: null, pick: true })}
              />
            )}
          </FormSection>

          <FormSection>
            <TextFieldRow
              value={title}
              onChange={setTitle}
              maxLength={140}
              enterKeyHint="done"
              placeholder="Title"
            />
            <SwitchRow label="Multiple days" checked={multiDay} onChange={changeMultiDay} />
            <DateRow
              label={multiDay ? 'From' : 'Date'}
              value={startDate}
              onChange={(value) => {
                setStartDate(value)
                // Keep a range from inverting the moment its start moves past its end.
                if (value > endDate) setEndDate(value)
              }}
            />
            {multiDay && (
              <DateRow label="To" value={endDate} min={startDate} max={latestEnd} onChange={setEndDate} />
            )}
            <SwitchRow label="Every year" checked={annual} onChange={setAnnual} />
            {annual && (
              <SwitchRow
                label="Count years"
                subtitle="From the year in the date - the age it turns, the anniversary"
                checked={countYears}
                onChange={setCountYears}
              />
            )}
            <TextFieldRow value={note} onChange={setNote} maxLength={500} placeholder="Note (optional)" />
          </FormSection>

          <FormSection footer={error ? error.message : undefined}>
            <button
              type="submit"
              className="form-row form-row-button form-action"
              data-tone="accent"
              disabled={!isValid || saving}
            >
              {saving ? 'Saving…' : editing ? 'Save Changes' : 'Add'}
            </button>
            {editing && <ButtonRow label="Cancel Editing" onClick={resetForm} />}
          </FormSection>
        </form>

        <FormSection header="Categories" footer="Each category is a filter on the calendar.">
          {categories.list.map((option) => {
            const count = daysByCategory.get(option.id)?.length ?? 0
            return (
              <NavRow
                key={option.id}
                icon={<CategoryTile category={option} />}
                label={option.name}
                detail={count === 0 && option.builtin ? 'Automatic' : count}
                onClick={() => setCategorySheet({ category: option })}
              />
            )
          })}
          <ButtonRow label="Add Category" onClick={() => setCategorySheet({ category: null })} />
        </FormSection>

        {isPending && <p className="sheet-note">Loading…</p>}

        {categories.list.map((group) => {
          const days = daysByCategory.get(group.id)
          if (!days?.length) return null
          return (
            <FormSection key={group.id} header={group.name}>
              {days.map((day) => (
                <div key={day.id} className="form-row special-row">
                  <button
                    type="button"
                    className="special-row-main"
                    onClick={() => startEditing(day)}
                    aria-label={`Edit ${day.title}`}
                  >
                    <CategoryTile category={group} />
                    <span className="form-label form-label-stack">
                      <span className="ellipsis">{day.title}</span>
                      <span className="form-sublabel">
                        {day.startDate === day.endDate
                          ? formatDayShort(day.startDate)
                          : `${formatDayShort(day.startDate)} – ${formatDayShort(day.endDate)}`}
                        {day.recurrence === 'annual' && ' · every year'}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="row-icon-button"
                    data-tone="destructive"
                    aria-label={`Delete ${day.title}`}
                    onClick={() => {
                      // The row being edited is about to stop existing, so the
                      // form can't stay pointed at it.
                      if (editing?.id === day.id) resetForm()
                      deleteSpecialDay.mutate(day.id)
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </FormSection>
          )
        })}
      </SheetBody>

      {categorySheet && (
        <SpecialDayCategorySheet
          category={categorySheet.category}
          dayCount={
            categorySheet.category ? (daysByCategory.get(categorySheet.category.id)?.length ?? 0) : 0
          }
          // A category made from the picker is the one the day goes into.
          onSaved={(saved) => {
            if (categorySheet.pick) chooseCategory(saved.id)
          }}
          onDeleted={forgetCategory}
          onClose={() => setCategorySheet(null)}
        />
      )}
    </>
  )
}
