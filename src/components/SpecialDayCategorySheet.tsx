import { useId, useState, type FormEvent } from 'react'
import {
  specialDayHues,
  specialDayIcons,
  type SpecialDayCategory,
  type SpecialDayHue,
  type SpecialDayIcon,
} from '../api/specialDays'
import {
  useCreateSpecialDayCategory,
  useDeleteSpecialDayCategory,
  useUpdateSpecialDayCategory,
} from '../hooks/useSpecialDays'
import { useSheet, useSheetDirty } from '../hooks/useSheet'
import { ActionSheet } from './ActionSheet'
import { ButtonRow, FormSection, SwatchRow, SwitchRow, TextFieldRow } from './FormRows'
import { Sheet, SheetBody, SheetButton, SheetCancelButton, SheetHeader } from './Sheet'
import { SpecialDayGlyph } from './specialDayGlyphs'

/** What each glyph is called, for the icon picker's accessible names. */
const ICON_LABELS: Record<SpecialDayIcon, string> = {
  flag: 'Flag',
  sun: 'Sun',
  gift: 'Gift',
  star: 'Star',
  heart: 'Heart',
  music: 'Music',
  thermometer: 'Thermometer',
  plane: 'Paper plane',
  briefcase: 'Briefcase',
  sparkle: 'Sparkle',
  graduation: 'Graduation cap',
  home: 'House',
  ticket: 'Ticket',
  leaf: 'Leaf',
  trophy: 'Trophy',
  moon: 'Moon',
}

const HUE_LABELS: Record<SpecialDayHue, string> = {
  red: 'Red',
  orange: 'Orange',
  amber: 'Amber',
  green: 'Green',
  teal: 'Teal',
  blue: 'Blue',
  indigo: 'Indigo',
  pink: 'Pink',
  brown: 'Brown',
  slate: 'Graphite',
}

/** What the switches mean for the days computed into a built-in category. */
const BUILTIN_NOTES: Record<NonNullable<SpecialDayCategory['builtin']>, string> = {
  holidays:
    "Your region's public holidays are always in here, and the law decides which of them are days off. These switches are for days you add yourself.",
  observances:
    'Muttertag and Vatertag are always in here. These switches are for days you add yourself.',
}

/**
 * Makes or edits a special-day category - its name, colour and glyph, and what
 * its days do to the rest of the app. Shaped like Reminders' list sheet: the
 * tile on top shows the result as it's picked.
 *
 * Mounted only while open. `category` null makes a new one; `onSaved` hears
 * about it, so the day being entered underneath can be filed under it.
 */
export function SpecialDayCategorySheet({
  category,
  dayCount,
  onSaved,
  onDeleted,
  onClose,
}: {
  category: SpecialDayCategory | null
  /** How many stored days it holds - said before they're deleted with it. */
  dayCount: number
  onSaved?: (category: SpecialDayCategory) => void
  onDeleted?: (id: string) => void
  onClose: () => void
}) {
  return (
    <Sheet label={category ? `Edit ${category.name}` : 'New category'} onClose={onClose}>
      <CategoryForm category={category} dayCount={dayCount} onSaved={onSaved} onDeleted={onDeleted} />
    </Sheet>
  )
}

function CategoryForm({
  category,
  dayCount,
  onSaved,
  onDeleted,
}: {
  category: SpecialDayCategory | null
  dayCount: number
  onSaved?: (category: SpecialDayCategory) => void
  onDeleted?: (id: string) => void
}) {
  const sheet = useSheet()
  const createCategory = useCreateSpecialDayCategory()
  const updateCategory = useUpdateSpecialDayCategory()
  const deleteCategory = useDeleteSpecialDayCategory()

  const [name, setName] = useState(category?.name ?? '')
  const [color, setColor] = useState<SpecialDayHue>(category?.color ?? 'blue')
  const [icon, setIcon] = useState<SpecialDayIcon>(category?.icon ?? 'star')
  const [dayOff, setDayOff] = useState(category?.dayOff ?? false)
  const [pausesHabits, setPausesHabits] = useState(category?.pausesHabits ?? false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const draft = { name: name.trim(), color, icon, dayOff, pausesHabits }
  const changed = category
    ? draft.name !== category.name ||
      color !== category.color ||
      icon !== category.icon ||
      dayOff !== category.dayOff ||
      pausesHabits !== category.pausesHabits
    : Boolean(draft.name)
  useSheetDirty(changed)

  const saving = createCategory.isPending || updateCategory.isPending
  const error = createCategory.error ?? updateCategory.error ?? deleteCategory.error

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.name || saving) return
    const done = (saved: SpecialDayCategory) => {
      sheet.setDirty(false)
      onSaved?.(saved)
      void sheet.close()
    }
    if (category) updateCategory.mutate({ id: category.id, ...draft }, { onSuccess: done })
    else createCategory.mutate(draft, { onSuccess: done })
  }

  return (
    <>
      <form className="sheet-form" onSubmit={handleSubmit}>
        <SheetHeader
          title={category ? 'Category' : 'New Category'}
          leading={<SheetCancelButton />}
          trailing={
            <SheetButton
              type="submit"
              bold
              disabled={!draft.name || saving || (category !== null && !changed)}
            >
              Done
            </SheetButton>
          }
        />
        <SheetBody>
          <div className="category-hero" data-hue={color} aria-hidden="true">
            <SpecialDayGlyph icon={icon} />
          </div>

          <FormSection footer={error ? error.message : undefined}>
            <TextFieldRow
              value={name}
              onChange={setName}
              placeholder="Name"
              maxLength={40}
              enterKeyHint="done"
              autoFocus={!category}
            />
          </FormSection>

          <FormSection header="Colour">
            <SwatchRow
              label="Colour"
              palette="hue"
              value={color}
              onChange={setColor}
              options={specialDayHues.map((hue) => ({ value: hue, label: HUE_LABELS[hue] }))}
            />
          </FormSection>

          <FormSection header="Icon">
            <IconGrid value={icon} color={color} onChange={setIcon} />
          </FormSection>

          <FormSection
            header="Its days"
            footer={category?.builtin ? BUILTIN_NOTES[category.builtin] : undefined}
          >
            <SwitchRow
              label="Day off"
              subtitle="Tinted, and not counted as working days"
              checked={dayOff}
              onChange={setDayOff}
            />
            <SwitchRow
              label="Pauses habits"
              subtitle="Recurring tasks aren't due, so nothing fails"
              checked={pausesHabits}
              onChange={setPausesHabits}
            />
          </FormSection>

          {category && !category.builtin && (
            <FormSection>
              <ButtonRow
                label="Delete Category"
                tone="destructive"
                disabled={deleteCategory.isPending}
                onClick={() => setConfirmingDelete(true)}
              />
            </FormSection>
          )}
        </SheetBody>
      </form>

      {confirmingDelete && category && (
        <ActionSheet
          title={`Delete ${category.name}?`}
          message={
            dayCount > 0
              ? `Its ${dayCount} ${dayCount === 1 ? 'day' : 'days'} will be deleted too.`
              : 'It has no days in it.'
          }
          actions={[
            {
              label: 'Delete Category',
              destructive: true,
              onSelect: () =>
                deleteCategory.mutate(category.id, {
                  onSuccess: () => {
                    onDeleted?.(category.id)
                    sheet.setDirty(false)
                    void sheet.close()
                  },
                }),
            },
          ]}
          onClose={() => setConfirmingDelete(false)}
        />
      )}
    </>
  )
}

/** The glyphs as a grid of tiles over native radios; the chosen one takes the colour. */
function IconGrid({
  value,
  color,
  onChange,
}: {
  value: SpecialDayIcon
  color: SpecialDayHue
  onChange: (icon: SpecialDayIcon) => void
}) {
  const name = useId()
  return (
    <div className="form-row icon-grid" role="radiogroup" aria-label="Icon" data-hue={color}>
      {specialDayIcons.map((icon) => (
        <label key={icon} className="icon-choice" title={ICON_LABELS[icon]}>
          <input
            type="radio"
            className="visually-hidden"
            name={name}
            value={icon}
            checked={value === icon}
            aria-label={ICON_LABELS[icon]}
            onChange={() => onChange(icon)}
          />
          <span className="icon-choice-tile" aria-hidden="true">
            <SpecialDayGlyph icon={icon} />
          </span>
        </label>
      ))}
    </div>
  )
}
