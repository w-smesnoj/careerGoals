import type { SpecialDayOccurrence } from '../api/specialDays'
import { useSheet } from '../hooks/useSheet'
import { formatDayLong, formatDayShort } from '../lib/date'
import { ButtonRow, FormSection } from './FormRows'
import { Sheet, SheetBody, SheetButton, SheetHeader } from './Sheet'
import { SpecialDayGlyph } from './specialDayGlyphs'

const dayWithYear = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

function asDate(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date)
}

/** "Monday, 25 May" - with the year once it isn't this one. */
function sheetTitle(day: string, today: string): string {
  return day.slice(0, 4) === today.slice(0, 4) ? formatDayLong(day) : dayWithYear.format(asDate(day))
}

/** What's on one day, read-only - a calendar cell only has room for one name. */
export function SpecialDaySheet({
  day,
  today,
  events,
  onEdit,
  onClose,
}: {
  day: string
  today: string
  events: SpecialDayOccurrence[]
  onEdit: () => void
  onClose: () => void
}) {
  const title = sheetTitle(day, today)
  return (
    <Sheet label={title} onClose={onClose}>
      <DaySheetBody day={day} title={title} today={today} events={events} onEdit={onEdit} />
    </Sheet>
  )
}

function DaySheetBody({
  day,
  title,
  today,
  events,
  onEdit,
}: {
  day: string
  title: string
  today: string
  events: SpecialDayOccurrence[]
  onEdit: () => void
}) {
  const sheet = useSheet()

  return (
    <>
      <SheetHeader
        title={title}
        trailing={
          <SheetButton bold onClick={() => void sheet.close()}>
            Done
          </SheetButton>
        }
      />
      <SheetBody>
        {events.length === 0 ? (
          // Only after an edit underneath took the day's last event away.
          <p className="sheet-note">Nothing on this day.</p>
        ) : (
          <FormSection>
            {events.map((event) => (
              <DayEventRow key={event.id} event={event} past={day < today} />
            ))}
          </FormSection>
        )}
        <FormSection>
          <ButtonRow label="Edit Special Days" onClick={onEdit} />
        </FormSection>
      </SheetBody>
    </>
  )
}

/** The same icon-tile row Today's day-info block uses, with the facts behind it. */
function DayEventRow({ event, past }: { event: SpecialDayOccurrence; past: boolean }) {
  const details = [event.category.name]
  if (event.age !== null) details.push(`${past ? 'Turned' : 'Turns'} ${event.age}`)
  if (event.startDate !== event.endDate) {
    details.push(`${formatDayShort(event.startDate)} – ${formatDayShort(event.endDate)}`)
  }
  if (event.note) details.push(event.note)

  return (
    <div className="form-row">
      <span className="ios-icon-tile" data-hue={event.category.color}>
        <SpecialDayGlyph icon={event.category.icon} />
      </span>
      <span className="form-label form-label-stack">
        <span className="ellipsis">{event.title}</span>
        <span className="form-sublabel">{details.join(' · ')}</span>
      </span>
      {event.workFree && <span className="form-detail">Work-free</span>}
    </div>
  )
}
