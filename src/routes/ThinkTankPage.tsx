import { useDeferredValue, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { thoughtsApi, type Thought } from '../api/thoughts'
import { useThoughts, useThoughtTags } from '../hooks/useThoughts'
import { useTracker } from '../hooks/useTracker'
import { useFabAction } from '../hooks/useFabAdd'
import { useSheet } from '../hooks/useSheet'
import { ChoiceList, FormSection } from '../components/FormRows'
import { LargeTitle } from '../components/LargeTitle'
import { MakeFromThought } from '../components/MakeFromThought'
import { PushLink } from '../components/PushLink'
import { SwipeRow } from '../components/DayRowControls'
import { Sheet, SheetBody, SheetButton, SheetHeader } from '../components/Sheet'
import { ThoughtSheet } from '../components/ThoughtSheet'
import { FilterIcon, SearchIcon } from '../components/icons'
import { dayCount, shiftDay, toDayKey, todayKey } from '../lib/date'
import { deleteAction, makeTaskAction } from '../lib/swipeActions'
import { outcomeTarget, readSnoozed, thoughtBody, writeSnoozed } from '../lib/thoughts'
import { hideThought, refetchEverything } from '../lib/optimistic'
import { undoable } from '../lib/toast'
import { counted } from '../lib/taskLabels'
import { readStored, writeStored } from '../lib/storage'

/** How old an untouched thought gets before it's brought back up. */
const REVISIT_AFTER_DAYS = 21
const SNOOZE_DAYS = 30
const ACTED_EXPANDED_KEY = 'thinkTank.actedExpanded'

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const weekdayFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const dateFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'numeric', year: '2-digit' })

/** Notes-style: today a time, this week a weekday, before that a date. */
function rowDate(iso: string, today: string): string {
  const date = new Date(iso)
  const day = toDayKey(date)
  const age = dayCount(day, today) - 1
  if (age <= 0) return timeFormat.format(date)
  if (age === 1) return 'Yesterday'
  if (age < 7) return weekdayFormat.format(date)
  return dateFormat.format(date)
}

/**
 * What a thought says, as a list shows it. Most thoughts are just a sentence,
 * so that sentence is set as plain text over two lines rather than dressed up
 * as a title; only a thought that was given a title gets a bold one, with its
 * text greyed under it.
 */
function ThoughtSummary({ thought, lines, note }: { thought: Thought; lines?: 1 | 3; note?: string }) {
  const title = thought.title.trim()
  const body = thoughtBody(thought)
  return (
    <span className="thought-summary" data-lines={lines}>
      {title && <span className="thought-summary-title">{title}</span>}
      {body && <span className="thought-summary-body">{body}</span>}
      {note && <span className="thought-summary-note">{note}</span>}
    </span>
  )
}

function ThoughtRow({
  thought,
  today,
  onMakeTask,
  onDelete,
}: {
  thought: Thought
  today: string
  onMakeTask: () => void
  onDelete: () => void
}) {
  return (
    <li className="ios-row">
      <SwipeRow
        enabled
        leading={makeTaskAction(onMakeTask)}
        trailing={deleteAction(onDelete)}
        className="swipe-content"
      >
        <PushLink to={`/think-tank/${thought.id}`} className="ios-row-link thought-row">
          <ThoughtSummary thought={thought} />
          <span className="thought-row-date">{rowDate(thought.createdAt, today)}</span>
        </PushLink>
      </SwipeRow>
    </li>
  )
}

/** "Tags": the filter, one tap behind the button beside the search field. */
function TagFilterSheet({
  tags,
  value,
  onChoose,
  onClose,
}: {
  tags: string[]
  value: string | null
  onChoose: (tag: string | null) => void
  onClose: () => void
}) {
  return (
    <Sheet label="Filter by tag" onClose={onClose}>
      <TagFilterList tags={tags} value={value} onChoose={onChoose} />
    </Sheet>
  )
}

function TagFilterList({
  tags,
  value,
  onChoose,
}: {
  tags: string[]
  value: string | null
  onChoose: (tag: string | null) => void
}) {
  const sheet = useSheet()
  return (
    <>
      <SheetHeader
        title="Tags"
        trailing={
          <SheetButton bold onClick={() => void sheet.close()}>
            Done
          </SheetButton>
        }
      />
      <SheetBody>
        <FormSection>
          <ChoiceList
            name="Tag"
            value={value ?? ''}
            options={[
              { value: '', label: 'All Thoughts' },
              ...tags.map((name) => ({ value: name, label: `#${name}` })),
            ]}
            onChange={(next) => {
              onChoose(next || null)
              void sheet.close()
            }}
          />
        </FormSection>
      </SheetBody>
    </>
  )
}

/**
 * The think tank as an inbox that turns thoughts into action. The floating +
 * opens a new thought, like every other page's; the list is just what each
 * thought says, newest first, with pinned ones above; swiping right makes a
 * thought a task, left lets it go; an old one now and then comes back up to
 * be decided on. Whatever was acted on folds away under "Turned into action".
 */
export function ThinkTankPage() {
  const today = todayKey()
  const queryClient = useQueryClient()
  const reduceMotion = useReducedMotion()
  const [searchParams, setSearchParams] = useSearchParams()
  const tag = searchParams.get('tag')
  const [search, setSearch] = useState('')
  // The list lags the box by a render rather than firing a request per
  // keystroke; the previous results stay up while the new ones land.
  const deferredSearch = useDeferredValue(search)
  const { data, isPending, isError, error } = useThoughts(deferredSearch)
  const { data: tracker } = useTracker()
  const tags = useThoughtTags()

  const [composing, setComposing] = useState(false)
  const [pickingTag, setPickingTag] = useState(false)
  const [making, setMaking] = useState<{ thought: Thought; kind: 'task' | 'goal' } | null>(null)
  const [snoozed, setSnoozed] = useState(readSnoozed)
  const [actedOpen, setActedOpen] = useState(() => readStored(ACTED_EXPANDED_KEY, false))

  const all = data ?? []
  const filtered = tag ? all.filter((thought) => thought.tags.includes(tag)) : all
  const open = filtered.filter((thought) => !thought.outcome)
  const acted = filtered.filter((thought) => thought.outcome)

  // One thought old enough to deserve a decision, oldest first - only while
  // the list isn't being searched or filtered.
  const revisit =
    search || tag
      ? undefined
      : [...open]
          .reverse()
          .find(
            (thought) =>
              !thought.pinned &&
              dayCount(toDayKey(new Date(thought.createdAt)), today) - 1 >= REVISIT_AFTER_DAYS &&
              !(snoozed[thought.id] && snoozed[thought.id] > today),
          )
  // The card is where that one is shown - not a second time in the list.
  const listed = open.filter((thought) => thought !== revisit)
  const pinned = listed.filter((thought) => thought.pinned)
  const rest = listed.filter((thought) => !thought.pinned)

  useFabAction(() => setComposing(true))

  function chooseTag(next: string | null) {
    setSearchParams(next ? { tag: next } : {}, { replace: true })
  }

  function remove(thought: Thought) {
    undoable({
      message: 'Thought deleted',
      apply: () => hideThought(queryClient, thought.id),
      run: (options) => thoughtsApi.remove(thought.id, options).finally(() => refetchEverything(queryClient)),
      undo: () => refetchEverything(queryClient),
      failure: 'Couldn’t delete it',
    })
  }

  function keep(thought: Thought) {
    const next = { ...snoozed, [thought.id]: shiftDay(today, SNOOZE_DAYS) }
    setSnoozed(next)
    writeSnoozed(next)
  }

  function toggleActed() {
    setActedOpen((current) => {
      writeStored(ACTED_EXPANDED_KEY, !current)
      return !current
    })
  }

  function rows(thoughts: Thought[]) {
    return (
      <ul className="ios-list">
        {thoughts.map((thought) => (
          <ThoughtRow
            key={thought.id}
            thought={thought}
            today={today}
            onMakeTask={() => setMaking({ thought, kind: 'task' })}
            onDelete={() => remove(thought)}
          />
        ))}
      </ul>
    )
  }

  // Tags are one button, not a strip of chips: the button names the tag
  // while one is chosen.
  const accessory = (
    <div className="think-tank-search">
      <label className="search-field">
        <SearchIcon />
        <input
          type="search"
          aria-label="Search thoughts"
          placeholder="Search"
          enterKeyHint="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {(tags.length > 0 || tag) && (
        <button
          type="button"
          className="tag-filter-button"
          data-active={tag ? true : undefined}
          aria-label={tag ? `Showing #${tag} - change tag` : 'Filter by tag'}
          onClick={() => setPickingTag(true)}
        >
          {tag ? <span className="tag-filter-name">#{tag}</span> : <FilterIcon />}
        </button>
      )}
    </div>
  )

  return (
    <div className="think-tank ios-page">
      <LargeTitle title="Think Tank" accessory={accessory} />

      {isPending && <p className="today-empty">Loading thoughts…</p>}
      {isError && <p className="error">Could not load your thoughts: {error.message}</p>}
      {data && filtered.length === 0 && (
        <p className="today-empty">
          {search
            ? `Nothing matches “${search}”.`
            : tag
              ? `Nothing tagged #${tag}.`
              : 'Nothing here yet. Tap + to add a thought.'}
        </p>
      )}

      {revisit && (
        <section className="ios-card revisit-card" aria-label="Revisit">
          <span className="revisit-eyebrow">
            From {counted(dayCount(toDayKey(new Date(revisit.createdAt)), today) - 1, 'day')} ago
          </span>
          <PushLink to={`/think-tank/${revisit.id}`} className="revisit-link">
            <ThoughtSummary thought={revisit} lines={3} />
          </PushLink>
          <div className="revisit-actions">
            <button type="button" className="revisit-action" data-bold onClick={() => setMaking({ thought: revisit, kind: 'task' })}>
              Make Task
            </button>
            <button type="button" className="revisit-action" onClick={() => keep(revisit)}>
              Keep
            </button>
            <button type="button" className="revisit-action" data-tone="destructive" onClick={() => remove(revisit)}>
              Let Go
            </button>
          </div>
        </section>
      )}

      {pinned.length > 0 && (
        <section className="ios-section">
          <h2 className="ios-section-title">Pinned</h2>
          {rows(pinned)}
        </section>
      )}

      {rest.length > 0 && (
        <section className="ios-section" aria-label="Thoughts">
          {pinned.length > 0 && <h2 className="ios-section-title">Thoughts</h2>}
          {rows(rest)}
        </section>
      )}

      {acted.length > 0 && (
        <section className="done-group">
          <button type="button" className="done-toggle" aria-expanded={actedOpen} onClick={toggleActed}>
            <span className="done-toggle-label">Turned into action</span>
            <span className="done-toggle-count">{acted.length}</span>
            <svg className="done-toggle-chevron" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <AnimatePresence initial={false}>
            {actedOpen && (
              <motion.div
                className="done-group-body"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={reduceMotion ? { duration: 0 } : { type: 'spring', bounce: 0, duration: 0.35 }}
              >
                <ul className="ios-list">
                  {acted.map((thought) => {
                    const target = outcomeTarget(thought, tracker)
                    const what = thought.outcome?.kind === 'goal' ? 'Goal' : 'Task'
                    return (
                      <li key={thought.id} className="ios-row">
                        <PushLink to={target?.to ?? `/think-tank/${thought.id}`} className="ios-row-link thought-row">
                          <ThoughtSummary
                            thought={thought}
                            lines={1}
                            note={
                              target
                                ? `${what} in ${target.label}`
                                : `${what} “${thought.outcome?.title}” - since deleted`
                            }
                          />
                        </PushLink>
                      </li>
                    )
                  })}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {composing && (
        <ThoughtSheet initialTags={tag ? [tag] : []} onClose={() => setComposing(false)} />
      )}

      {pickingTag && (
        <TagFilterSheet tags={tags} value={tag} onChoose={chooseTag} onClose={() => setPickingTag(false)} />
      )}

      {making && (
        <MakeFromThought
          key={making.thought.id}
          thought={making.thought}
          kind={making.kind}
          onClose={() => setMaking(null)}
        />
      )}
    </div>
  )
}
