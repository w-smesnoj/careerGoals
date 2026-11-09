import type { FormEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { thoughtsApi, type Thought, type ThoughtInput } from '../api/thoughts'
import { useCreateThought, useThoughtTags, useUpdateThought } from '../hooks/useThoughts'
import { useDraft } from '../hooks/useDraft'
import { useSheet, useSheetDirty } from '../hooks/useSheet'
import { hideThought, refetchEverything } from '../lib/optimistic'
import { undoable } from '../lib/toast'
import { ButtonRow, FormSection, SwitchRow, TextAreaRow, TextFieldRow, TokensRow } from './FormRows'
import { Sheet, SheetBody, SheetButton, SheetCancelButton, SheetHeader } from './Sheet'

export interface ThoughtSheetProps {
  /** The thought being edited; absent for a new one. */
  thought?: Thought | null
  /** A new thought's start, when it arrives with text already. */
  initialText?: string
  initialTags?: string[]
  onClose: () => void
  onSaved?: (thought: Thought) => void
  /** After Delete - the thought's page has nothing left to show. */
  onDeleted?: () => void
}

/**
 * "New Thought" and "Edit Thought": a title, the text, its tags and whether
 * it's pinned. Everything about a thought can change here - the old inline
 * editor only reached the text.
 */
export function ThoughtSheet({ onClose, ...props }: ThoughtSheetProps) {
  return (
    <Sheet label={props.thought ? 'Edit thought' : 'New thought'} size="large" onClose={onClose}>
      <ThoughtForm {...props} />
    </Sheet>
  )
}

function ThoughtForm({ thought, initialText, initialTags, onSaved, onDeleted }: Omit<ThoughtSheetProps, 'onClose'>) {
  const sheet = useSheet()
  const queryClient = useQueryClient()
  const editing = Boolean(thought)
  const { draft, set, dirty, isChanged } = useDraft(() => ({
    title: thought?.title ?? '',
    text: thought?.text ?? initialText ?? '',
    tags: thought?.tags ?? initialTags ?? [],
    pinned: thought?.pinned ?? false,
  }))
  // A thought arriving with text already is something to lose.
  useSheetDirty(dirty || (!editing && Boolean(draft.text.trim())))

  const suggestions = useThoughtTags()
  const createThought = useCreateThought()
  const updateThought = useUpdateThought()
  const mutation = editing ? updateThought : createThought
  const valid = Boolean(draft.text.trim())

  function finish(saved: Thought) {
    onSaved?.(saved)
    sheet.setDirty(false)
    void sheet.close()
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || mutation.isPending) return
    if (thought) {
      const patch: Partial<ThoughtInput> = {}
      if (isChanged('title')) patch.title = draft.title.trim()
      if (isChanged('text')) patch.text = draft.text.trim()
      // An emptied list is a real edit - the server keeps [] on update.
      if (isChanged('tags')) patch.tags = draft.tags
      if (isChanged('pinned')) patch.pinned = draft.pinned
      if (Object.keys(patch).length === 0) {
        void sheet.close()
        return
      }
      updateThought.mutate({ id: thought.id, ...patch }, { onSuccess: finish })
    } else {
      createThought.mutate(
        {
          title: draft.title.trim() || undefined,
          text: draft.text.trim(),
          tags: draft.tags,
          pinned: draft.pinned,
        },
        { onSuccess: finish },
      )
    }
  }

  async function handleDelete() {
    if (!thought) return
    sheet.setDirty(false)
    await sheet.close()
    onDeleted?.()
    undoable({
      message: 'Thought deleted',
      apply: () => hideThought(queryClient, thought.id),
      run: (options) => thoughtsApi.remove(thought.id, options).finally(() => refetchEverything(queryClient)),
      undo: () => refetchEverything(queryClient),
      failure: 'Couldn’t delete it',
    })
  }

  return (
    <form className="sheet-form" onSubmit={handleSubmit}>
      <SheetHeader
        title={editing ? 'Edit Thought' : 'New Thought'}
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
            value={draft.title}
            onChange={(title) => set({ title })}
            placeholder="Title (optional)"
            maxLength={140}
          />
          <TextAreaRow
            value={draft.text}
            onChange={(text) => set({ text })}
            placeholder="What's on your mind?"
            autoFocus={!editing}
            maxLength={10000}
            minRows={7}
          />
        </FormSection>

        <FormSection header="Tags" footer="Return or a comma adds one.">
          <TokensRow
            label="Add tag"
            placeholder="Tags"
            tokens={draft.tags}
            onChange={(tags) => set({ tags })}
            suggestions={suggestions}
          />
        </FormSection>

        <FormSection>
          <SwitchRow label="Pinned" subtitle="Kept at the top of the list" checked={draft.pinned} onChange={(pinned) => set({ pinned })} />
        </FormSection>

        {thought && (
          <FormSection>
            <ButtonRow label="Delete Thought" tone="destructive" onClick={() => void handleDelete()} />
          </FormSection>
        )}
      </SheetBody>
    </form>
  )
}
