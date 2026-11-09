import { useRef, useState } from 'react'
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  type DragEndEvent,
  closestCenter,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQueryClient } from '@tanstack/react-query'
import type { SeriesPoint, TrackingUnit } from '../api/trackingUnits'
import { trackingUnitsApi } from '../api/trackingUnits'
import { measurementsApi } from '../api/measurements'
import {
  trackingUnitKeys,
  useReorderTrackingUnits,
  useTrackingUnits,
  useUnitSeriesMany,
} from '../hooks/useTrackingUnits'
import { measurementKeys } from '../hooks/useMeasurements'
import { useFabAction } from '../hooks/useFabAdd'
import { DayNav } from '../components/DayNav'
import { PushLink } from '../components/PushLink'
import { ReadingSheet } from '../components/ReadingSheet'
import { Sparkline } from '../components/Sparkline'
import { UnitSheet } from '../components/UnitSheet'
import { ChartIcon, PlusIcon } from '../components/icons'
import { formatDayShort, todayKey } from '../lib/date'
import { formatFigure, formatMeasurement } from '../lib/units'

/** The day's figure: a sum unit's total, a latest unit's reading - or null
 *  when nothing was logged that day (never a made-up 0). */
function dayFigure(unit: TrackingUnit): number | null {
  if (!unit.summary.dayLatest) return null
  return unit.aggregation === 'sum' ? unit.summary.dayTotal : unit.summary.dayLatest.value
}

/**
 * One unit as an Apple Health card: its name (which opens its page), the
 * figure for the day in view, the trend leading up to it, and a quiet + to
 * log against that day - logging stays one tap.
 */
function UnitCard({
  unit,
  date,
  points,
  onAdd,
}: {
  unit: TrackingUnit
  date: string
  points: SeriesPoint[] | undefined
  onAdd: () => void
}) {
  const queryClient = useQueryClient()
  const { listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: unit.id })
  const style = {
    transform:
      [CSS.Transform.toString(transform), isDragging ? 'scale(1.02)' : null].filter(Boolean).join(' ') ||
      undefined,
    transition,
  }

  const figure = dayFigure(unit)
  const before = (points ?? []).filter((point) => point.date < date).at(-1)

  // On pointer-down, before the finger lifts: the unit's page wants its
  // series (usually cached already) and its readings.
  function prefetch() {
    void queryClient.prefetchQuery({
      queryKey: trackingUnitKeys.series(unit.id, undefined),
      queryFn: () => trackingUnitsApi.series(unit.id),
    })
    void queryClient.prefetchQuery({
      queryKey: measurementKeys.list(unit.id, undefined),
      queryFn: () => measurementsApi.list({ unitId: unit.id }),
    })
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="health-card"
      data-dragging={isDragging || undefined}
      {...listeners}
    >
      <div className="health-card-head">
        <PushLink to={`/tracking/${unit.id}`} className="health-card-title" onPrefetch={prefetch}>
          <span className="health-card-name">{unit.name}</span>
        </PushLink>
        <button
          type="button"
          className="round-add"
          aria-label={`Add a ${unit.name} reading`}
          onClick={onAdd}
        >
          <PlusIcon />
        </button>
      </div>

      <div className="health-card-body">
        <div className="health-card-figure">
          {figure !== null ? (
            <>
              <span className="health-card-value">{formatFigure(figure, unit.decimals)}</span>
              {unit.symbol && <span className="health-card-unit"> {unit.symbol}</span>}
            </>
          ) : (
            <span className="health-card-empty">
              {before ? `Last ${formatMeasurement(before.value, unit)}` : '—'}
            </span>
          )}
        </div>
        {points && points.length > 0 && (
          <Sparkline
            points={points}
            endDay={date}
            aggregation={unit.aggregation}
            target={unit.target}
            label={`${unit.name}, the ${unit.aggregation === 'sum' ? '14' : '30'} days to ${formatDayShort(date)}`}
          />
        )}
      </div>
    </li>
  )
}

/**
 * The units being tracked, as Health cards for whichever day the header is
 * browsing - the same day nav Today uses, so a unit's figure is always "what
 * was recorded that day", never a fixed "now". Press and hold a card to
 * reorder; its name opens the unit's own page with the chart and readings.
 */
export function TrackingPage() {
  const [date, setDate] = useState(todayKey)
  const [addingUnit, setAddingUnit] = useState(false)
  useFabAction(() => setAddingUnit(true))
  // Held as an id rather than the unit: logging refreshes the list, and a
  // sheet handed a snapshot would show figures its own edit just changed.
  const [readingFor, setReadingFor] = useState<string | null>(null)

  const { data, isPending, isError, error } = useTrackingUnits(date)
  const reorderUnits = useReorderTrackingUnits(date)
  const units = data ?? []
  const { series } = useUnitSeriesMany(units.map((unit) => unit.id))
  const readingUnit = units.find((unit) => unit.id === readingFor)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  )
  const suppressClick = useRef(false)
  function endDrag() {
    window.setTimeout(() => {
      suppressClick.current = false
    }, 0)
  }

  function handleDragEnd(event: DragEndEvent) {
    endDrag()
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = units.findIndex((unit) => unit.id === active.id)
    const newIndex = units.findIndex((unit) => unit.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return
    reorderUnits.mutate(arrayMove(units, oldIndex, newIndex).map((unit) => unit.id))
  }

  const comparable = units.filter((unit) => unit.summary.entryCount > 0).length >= 2

  return (
    <div className="tracking ios-page">
      <header className="today-header">
        <DayNav date={date} onChange={setDate} />
        {comparable && (
          <div className="page-toolbar">
            <PushLink to="/tracking/compare" className="pill-button">
              <ChartIcon /> Compare
            </PushLink>
          </div>
        )}
      </header>

      {isPending && <p className="today-empty">Loading units…</p>}
      {isError && <p className="error">Could not load your tracking units: {error.message}</p>}
      {data && units.length === 0 && (
        <p className="today-empty">
          Nothing tracked yet - add a unit like “Weight” in kg, then log it here or by ticking a task.
        </p>
      )}

      {units.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => {
            suppressClick.current = true
            navigator.vibrate?.(8)
          }}
          onDragEnd={handleDragEnd}
          onDragCancel={endDrag}
        >
          <SortableContext items={units.map((unit) => unit.id)} strategy={verticalListSortingStrategy}>
            <ul
              className="health-list"
              onClickCapture={(event) => {
                if (!suppressClick.current) return
                event.preventDefault()
                event.stopPropagation()
              }}
            >
              {units.map((unit, index) => (
                <UnitCard
                  key={unit.id}
                  unit={unit}
                  date={date}
                  points={series[index]}
                  onAdd={() => setReadingFor(unit.id)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}


      {addingUnit && <UnitSheet onClose={() => setAddingUnit(false)} />}

      {readingUnit && (
        <ReadingSheet
          key={`${readingUnit.id}-${date}`}
          unit={readingUnit}
          date={date}
          onClose={() => setReadingFor(null)}
        />
      )}
    </div>
  )
}
