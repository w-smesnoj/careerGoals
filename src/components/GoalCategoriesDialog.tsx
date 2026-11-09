import { useState, type FormEvent } from 'react'
import { useCategorySuggestions, useUpdateGoal } from '../hooks/useGoals'
import { useSheet, useSheetDirty } from '../hooks/useSheet'
import { FormSection, TokensRow } from './FormRows'
import { Sheet, SheetBody, SheetButton, SheetCancelButton, SheetHeader } from './Sheet'

interface GoalCategoriesDialogProps {
  goal: { id: string; title: string; categories: string[] }
  onClose: () => void
}

/**
 * Retag a goal - Overview's quick route to it, without the whole goal sheet.
 * The same chip row the goal sheet uses. Mounted only while open, so it opens
 * on the goal's current categories.
 */
export function GoalCategoriesDialog({ goal, onClose }: GoalCategoriesDialogProps) {
  return (
    <Sheet label={`Categories - ${goal.title}`} onClose={onClose}>
      <CategoriesForm goal={goal} />
    </Sheet>
  )
}

function CategoriesForm({ goal }: Pick<GoalCategoriesDialogProps, 'goal'>) {
  const sheet = useSheet()
  const [categories, setCategories] = useState(goal.categories)
  const suggestions = useCategorySuggestions()
  const updateGoal = useUpdateGoal()
  useSheetDirty(categories.join('\n') !== goal.categories.join('\n'))

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateGoal.mutate({ id: goal.id, categories }, { onSuccess: () => void sheet.close() })
  }

  return (
    <form className="sheet-form" onSubmit={handleSubmit}>
      <SheetHeader
        title="Categories"
        leading={<SheetCancelButton />}
        trailing={
          <SheetButton type="submit" bold disabled={updateGoal.isPending}>
            Save
          </SheetButton>
        }
      />
      <SheetBody>
        <p className="sheet-subject">{goal.title}</p>
        <FormSection
          footer={updateGoal.isError ? updateGoal.error.message : 'Return or a comma adds one.'}
        >
          <TokensRow
            label="Add category"
            placeholder="Categories"
            tokens={categories}
            onChange={setCategories}
            suggestions={suggestions}
          />
        </FormSection>
      </SheetBody>
    </form>
  )
}
