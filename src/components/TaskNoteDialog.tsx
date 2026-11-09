import { useState, type FormEvent } from 'react'
import { useSheet, useSheetDirty } from '../hooks/useSheet'
import { ButtonRow, FormSection, TextAreaRow } from './FormRows'
import { Sheet, SheetBody, SheetButton, SheetCancelButton, SheetHeader } from './Sheet'

interface TaskNoteDialogProps {
  heading: string
  initialText: string
  /** Shown only when editing a note that already exists. */
  canClear: boolean
  /** The sheet closes itself after either; `onClose` runs once it's gone. */
  onSave: (text: string) => void
  onClear: () => void
  onClose: () => void
}

/** Add or edit a freeform task note, mounted only while open and keyed by note
 *  id so its text starts fresh. */
export function TaskNoteDialog({ onClose, ...props }: TaskNoteDialogProps) {
  return (
    <Sheet label={props.heading} onClose={onClose}>
      <NoteForm {...props} />
    </Sheet>
  )
}

function NoteForm({
  heading,
  initialText,
  canClear,
  onSave,
  onClear,
}: Omit<TaskNoteDialogProps, 'onClose'>) {
  const sheet = useSheet()
  const [text, setText] = useState(initialText)
  useSheetDirty(text !== initialText)

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = text.trim()
    if (!trimmed) return
    onSave(trimmed)
    void sheet.close()
  }

  return (
    <form className="sheet-form" onSubmit={handleSubmit}>
      <SheetHeader
        title={canClear ? 'Edit Note' : 'Add Note'}
        leading={<SheetCancelButton />}
        trailing={
          <SheetButton type="submit" bold disabled={!text.trim()}>
            Save
          </SheetButton>
        }
      />
      <SheetBody>
        <p className="sheet-subject">{heading}</p>
        <FormSection>
          <TextAreaRow
            autoFocus
            value={text}
            onChange={setText}
            placeholder="A thought, an idea, anything else"
          />
        </FormSection>
        {canClear && (
          <FormSection>
            <ButtonRow
              label="Delete Note"
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
