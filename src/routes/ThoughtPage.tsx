import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { Thought } from '../api/thoughts'
import { useThoughts, useUpdateThought } from '../hooks/useThoughts'
import { useTracker } from '../hooks/useTracker'
import { LargeTitle, NavBarButton } from '../components/LargeTitle'
import { MakeFromThought } from '../components/MakeFromThought'
import { PushLink } from '../components/PushLink'
import { ThoughtSheet } from '../components/ThoughtSheet'
import { ChevronRightIcon, GoalIcon, PinIcon, ShareIcon, TaskIcon } from '../components/icons'
import { outcomeTarget, thoughtBody, thoughtHeadline } from '../lib/thoughts'
import { showToast } from '../lib/toast'

const stampFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})
const dayFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long' })
const dayYearFormat = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
const weekdayTimeFormat = new Intl.DateTimeFormat(undefined, { weekday: 'long', hour: 'numeric', minute: '2-digit' })

/**
 * One thought, read like a journal entry: a title - its own, or else the day
 * it was written, since most thoughts are just a sentence and that sentence
 * is the text, not a heading - then the whole text (selectable, however
 * long) and its tags. Below, Contacts-style action tiles turn it into a task
 * or a goal, pin it, or share it. Everything else is in Edit - including
 * Delete.
 */
export function ThoughtPage() {
  const { thoughtId = '' } = useParams()
  // The list is what's cached; a single thought is never fetched on its own.
  const { data, isPending } = useThoughts()
  const thought = data?.find((candidate) => candidate.id === thoughtId)

  if (!thought) {
    return (
      <div className="ios-page thought-page">
        <LargeTitle title={isPending ? '' : 'Not found'} back={{ label: 'Think Tank', to: '/think-tank' }} />
        <p className="today-empty">{isPending ? 'Loading…' : 'This thought doesn’t exist any more.'}</p>
      </div>
    )
  }

  return <ThoughtDetail key={thought.id} thought={thought} />
}

function ThoughtDetail({ thought }: { thought: Thought }) {
  const navigate = useNavigate()
  const updateThought = useUpdateThought()
  const { data: tracker } = useTracker()
  const [editing, setEditing] = useState(false)
  const [making, setMaking] = useState<'task' | 'goal' | null>(null)

  const target = outcomeTarget(thought, tracker)
  const created = new Date(thought.createdAt)
  const titled = Boolean(thought.title.trim())
  const body = thoughtBody(thought)
  const thisYear = created.getFullYear() === new Date().getFullYear()

  async function share() {
    const text = [thought.title, thought.text].filter(Boolean).join('\n\n')
    if (navigator.share) {
      // Dismissing the share sheet rejects - that's not an error worth showing.
      await navigator.share({ title: thoughtHeadline(thought), text }).catch(() => undefined)
      return
    }
    try {
      await navigator.clipboard.writeText(text)
      showToast('Copied')
    } catch {
      showToast('Couldn’t copy it')
    }
  }

  return (
    <div className="ios-page thought-page">
      <LargeTitle
        title={titled ? thought.title.trim() : (thisYear ? dayFormat : dayYearFormat).format(created)}
        eyebrow={titled ? stampFormat.format(created) : weekdayTimeFormat.format(created)}
        back={{ label: 'Think Tank', to: '/think-tank' }}
        actions={<NavBarButton onClick={() => setEditing(true)}>Edit</NavBarButton>}
      />

      {body && (
        <article className="ios-card thought-body">
          <p className="thought-text">{body}</p>
        </article>
      )}

      {thought.tags.length > 0 && (
        <div className="chip-wrap" aria-label="Tags">
          {thought.tags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="chip"
              onClick={() => navigate(`/think-tank?tag=${encodeURIComponent(tag)}`)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {thought.outcome &&
        (target ? (
          <PushLink to={target.to} className="ios-card outcome-banner">
            <span>
              Became a {thought.outcome.kind} in <strong>{target.label}</strong>
            </span>
            <span className="ios-chevron" aria-hidden="true">
              <ChevronRightIcon />
            </span>
          </PushLink>
        ) : (
          <p className="ios-card outcome-banner" data-gone>
            Became the {thought.outcome.kind} “{thought.outcome.title}”, which has since been deleted.
          </p>
        ))}

      <div className="action-tiles">
        <button type="button" className="action-tile" onClick={() => setMaking('task')}>
          <TaskIcon />
          <span>Make Task</span>
        </button>
        <button type="button" className="action-tile" onClick={() => setMaking('goal')}>
          <GoalIcon />
          <span>Make Goal</span>
        </button>
        <button
          type="button"
          className="action-tile"
          aria-pressed={thought.pinned}
          disabled={updateThought.isPending}
          onClick={() => updateThought.mutate({ id: thought.id, pinned: !thought.pinned })}
        >
          <PinIcon />
          <span>{thought.pinned ? 'Unpin' : 'Pin'}</span>
        </button>
        <button type="button" className="action-tile" onClick={() => void share()}>
          <ShareIcon />
          <span>Share</span>
        </button>
      </div>

      {editing && (
        <ThoughtSheet
          thought={thought}
          onClose={() => setEditing(false)}
          onDeleted={() => navigate('/think-tank', { replace: true })}
        />
      )}

      {making && <MakeFromThought thought={thought} kind={making} onClose={() => setMaking(null)} />}
    </div>
  )
}
