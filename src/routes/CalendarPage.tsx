import {
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type UIEvent,
} from 'react'
import { flushSync } from 'react-dom'
import { useNavigate, useNavigationType } from 'react-router-dom'
import { animate, AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { MonthStrip, type MonthRange } from '../components/MonthStrip'
import { SpecialDaysDialog } from '../components/SpecialDaysDialog'
import { ChevronLeftIcon, ChevronRightIcon, CompletionIcon } from '../components/icons'
import { useDayCompletion } from '../hooks/useDayCompletion'
import { useFabAction } from '../hooks/useFabAdd'
import { usePrefs } from '../hooks/usePrefs'
import { useSpecialDayOccurrences } from '../hooks/useSpecialDayOccurrences'
import { useCategoryIndex, useSpecialDays } from '../hooks/useSpecialDays'
import { todayKey } from '../lib/date'
import { fade, prefersReducedMotion, springSnappy } from '../lib/motion'
import { transitionNavigate } from '../lib/navigation'
import {
  clampLead,
  homeLead,
  monthAt,
  monthIndex,
  monthKeyAt,
  MONTH_COUNT,
} from '../lib/plannerMonths'
import { plannerReturn, rememberPlanner, returnLead } from '../lib/plannerReturn'
import { occurrencesByDay } from '../lib/specialDays'

/** ‹ › move by the unit the title names. */
const YEAR = 12
/** How far the strip comes in from after a jump too long to scroll through. */
const JUMP_SHIFT = 24
/** Vertical wheel travel that makes one month, where there's nothing to scroll down to. */
const WHEEL_STEP = 50

/*
 * Months to a screen: a quarter on a phone, half a year on a tablet, the year
 * on a desktop. Set from here onto the page as --planner-per-screen, so the
 * column width in CSS and the scroll maths here can't disagree.
 */
const WIDE = '(min-width: 75rem)'
const MEDIUM = '(min-width: 40rem)'

function readPerScreen(): number {
  if (window.matchMedia(WIDE).matches) return 12
  return window.matchMedia(MEDIUM).matches ? 6 : 3
}

function subscribePerScreen(onChange: () => void): () => void {
  const queries = [window.matchMedia(WIDE), window.matchMedia(MEDIUM)]
  for (const query of queries) query.addEventListener('change', onChange)
  return () => {
    for (const query of queries) query.removeEventListener('change', onChange)
  }
}

const monthLong = new Intl.DateTimeFormat(undefined, { month: 'long' })
const monthLongYear = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

/** The line above the title: which months are on screen, with years once two are. */
function spanLabel(lead: number, perScreen: number): string {
  const first = monthAt(lead)
  const last = monthAt(lead + perScreen - 1)
  const from = new Date(first.year, first.month, 1)
  const to = new Date(last.year, last.month, 1)
  return first.year === last.year
    ? `${monthLong.format(from)} – ${monthLong.format(to)}`
    : `${monthLongYear.format(from)} – ${monthLongYear.format(to)}`
}

/** The year most of the visible months belong to; a tie goes to the leading one. */
function titleYear(lead: number, perScreen: number): number {
  const first = monthAt(lead)
  const inFirstYear = Math.min(12 - first.month, perScreen)
  return inFirstYear * 2 >= perScreen ? first.year : first.year + 1
}

/** What to keep rendered around a view: its years, and a whole year either side. */
function windowFor(lead: number, perScreen: number): MonthRange {
  return {
    first: Math.max(0, monthIndex(monthAt(lead).year - 1, 0)),
    last: Math.min(MONTH_COUNT - 1, monthIndex(monthAt(lead + perScreen - 1).year + 1, 11)),
  }
}

function covers(range: MonthRange, wanted: MonthRange): boolean {
  return range.first <= wanted.first && range.last >= wanted.last
}

/** One month's column plus its gap, measured off the track itself. */
function pitchOf(scroller: HTMLElement): number {
  const track = scroller.firstElementChild as HTMLElement | null
  if (!track) return 1
  const gap = parseFloat(getComputedStyle(track).columnGap) || 0
  return (track.getBoundingClientRect().width + gap) / MONTH_COUNT
}

function leadOf(scroller: HTMLElement): number {
  return Math.round(scroller.scrollLeft / pitchOf(scroller))
}

/**
 * Where an element sits inside the scroller, in the scroller's content
 * coordinates. Offsets are layout positions - they ignore the strip's entry
 * transform - so this is right even while it's still sliding in.
 */
function offsetWithin(element: HTMLElement, scroller: HTMLElement): { left: number; top: number } {
  let left = 0
  let top = 0
  let node: HTMLElement | null = element
  while (node && node !== scroller) {
    left += node.offsetLeft
    top += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  return { left, top }
}

/** How far the rows run on under the tab bar: the strip's padding past the 31st. */
function underBar(rows: HTMLElement): number {
  const strip = rows.firstElementChild
  return strip ? parseFloat(getComputedStyle(strip).paddingBottom) || 0 : 0
}

/**
 * The part of the scroller the months come to rest in: inside its safe-area
 * padding, and above the tab bar.
 */
function clearRect(scroller: HTMLElement, rows: HTMLElement) {
  const box = scroller.getBoundingClientRect()
  const style = getComputedStyle(scroller)
  const left = box.left + (parseFloat(style.paddingLeft) || 0)
  const right = box.right - (parseFloat(style.paddingRight) || 0)
  const bottom = box.bottom - underBar(rows)
  return { left, top: box.top, right, bottom }
}

/** The scroll position of the rows that puts today's in the middle, if today is rendered. */
function todayRowTop(rows: HTMLElement): number | undefined {
  const cell = rows.querySelector<HTMLElement>('[aria-current="date"]')
  if (!cell) return undefined
  // The middle of what's clear of the tab bar, not of the rows under it.
  const clear = rows.clientHeight - underBar(rows)
  return offsetWithin(cell, rows).top - (clear - cell.offsetHeight) / 2
}

/**
 * Where a sideways pan can come to rest: the start of each month. The months
 * can't be the snap points themselves - they sit inside .planner-rows, a
 * scroller of its own - so these stand in for them, one on every track.
 */
function SnapPoints() {
  return Array.from({ length: MONTH_COUNT }, (_, index) => (
    <span key={index} className="planner-snap" style={{ gridColumn: index + 1 }} />
  ))
}

/**
 * Special days as one strip of months you can scroll through freely - into
 * last year, into the next ten - laid out like a wall planner, and nothing
 * else on it: goals, tasks and habits stay on their own screens. The one
 * exception is opt-in: the Completion chip turns each day so far into a bar
 * of how much of it got done, and puts each month's rate by its name. It opens on
 * the page of the current year that holds today; tapping a month zooms into
 * it (MonthPage).
 *
 * What's on it comes from the same source as Today and Overview, so the
 * special-days filter and the Bundesland apply here too. The legend is that
 * filter - one chip per category, so a category made in the Special Days
 * sheet turns up here as soon as it exists - which is why this screen has
 * no sidebar.
 */
export function CalendarPage() {
  const today = todayKey()
  const perScreen = useSyncExternalStore(subscribePerScreen, readPerScreen)
  const navigationType = useNavigationType()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const { isSpecialCategoryVisible, toggleSpecialCategory, showCompletion, toggleCompletion } =
    usePrefs()
  const categories = useCategoryIndex()

  // Back from a month comes back to where it left; any other visit opens on
  // the current year.
  const [start] = useState(() => {
    const saved = navigationType === 'POP' ? plannerReturn() : null
    return saved
      ? { lead: clampLead(returnLead(saved), perScreen), scrollTop: saved.scrollTop }
      : { lead: homeLead(perScreen, today), scrollTop: undefined }
  })
  // `dir` is the way the title last changed, for the side it slides in from.
  const [view, setView] = useState<{ lead: number; dir: -1 | 0 | 1 }>({ lead: start.lead, dir: 0 })
  const [rendered, setRendered] = useState(() => windowFor(start.lead, perScreen))
  const [managing, setManaging] = useState(false)
  // Here the floating add button opens the Special Days sheet.
  useFabAction(() => setManaging(true))
  // Sideways from month to month, and - inside it - up and down the days.
  const scrollerRef = useRef<HTMLDivElement>(null)
  const rowsRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)
  // The month a ‹ › or wheel scroll is still on its way to, so the next press
  // counts on from there rather than from wherever the scroll has got to.
  const pendingRef = useRef<number | null>(null)

  // Whole years, so the window only moves when a year boundary is crossed.
  const from = `${monthAt(rendered.first).year}-01-01`
  const to = `${monthAt(rendered.last).year}-12-31`
  const occurrences = useSpecialDayOccurrences(from, to)
  const byDay = useMemo(() => occurrencesByDay(occurrences, from, to), [occurrences, from, to])
  // Folded even while the chip is off, so the bars can be drawn back out.
  const { heat: completion } = useDayCompletion(from, to)
  // The occurrences hook swallows the request's state; this is only for saying so.
  const { isError, error } = useSpecialDays()

  const home = homeLead(perScreen, today)
  const year = titleYear(view.lead, perScreen)

  useLayoutEffect(() => {
    const scroller = scrollerRef.current
    const rows = rowsRef.current
    if (!scroller || !rows) return
    scroller.scrollTo({ left: start.lead * pitchOf(scroller), behavior: 'instant' })
    rows.scrollTo({ top: start.scrollTop ?? todayRowTop(rows) ?? 0, behavior: 'instant' })
  }, [start])

  function handleScroll(event: UIEvent<HTMLDivElement>) {
    const scroller = event.currentTarget
    const pitch = pitchOf(scroller)
    const lead = Math.round(scroller.scrollLeft / pitch)
    if (pendingRef.current !== null && Math.abs(scroller.scrollLeft - pendingRef.current * pitch) < 1) {
      pendingRef.current = null
    }
    setView((prev) => {
      if (prev.lead === lead) return prev
      const before = titleYear(prev.lead, perScreen)
      const after = titleYear(lead, perScreen)
      return { lead, dir: after === before ? prev.dir : after > before ? 1 : -1 }
    })
    const wanted = windowFor(lead, perScreen)
    setRendered((prev) => (covers(prev, wanted) ? prev : wanted))
  }

  /**
   * Brings `target` to the leading edge. Within a year of `from` it scrolls -
   * native smooth scrolling, so a finger can catch it mid-way; further than
   * that it jumps, and the strip comes in from the side it's heading to, so a
   * jump across years doesn't flash a run of empty columns past.
   */
  function moveTo(target: number, from: number, revealToday = false) {
    const scroller = scrollerRef.current
    const rows = rowsRef.current
    if (!scroller || !rows) return
    const lead = clampLead(target, perScreen)
    const scrolls = Math.abs(lead - from) <= YEAR && !prefersReducedMotion()

    // The months it lands on have to exist before the scroll can snap to them.
    flushSync(() => {
      setRendered((prev) => {
        const wanted = windowFor(lead, perScreen)
        if (!scrolls) return wanted
        return { first: Math.min(prev.first, wanted.first), last: Math.max(prev.last, wanted.last) }
      })
    })

    const left = lead * pitchOf(scroller)
    const top = revealToday ? todayRowTop(rows) : undefined
    if (scrolls) {
      pendingRef.current = lead
      scroller.scrollTo({ left, behavior: 'smooth' })
      if (top !== undefined) rows.scrollTo({ top, behavior: 'smooth' })
      return
    }

    pendingRef.current = null
    scroller.scrollTo({ left, behavior: 'instant' })
    if (top !== undefined) rows.scrollTo({ top, behavior: 'instant' })
    const strip = stripRef.current
    if (!strip) return
    if (prefersReducedMotion()) animate(strip, { opacity: [0, 1] }, fade)
    else animate(strip, { x: [Math.sign(lead - from) * JUMP_SHIFT, 0], opacity: [0, 1] }, springSnappy)
  }

  function step(delta: -1 | 1) {
    const scroller = scrollerRef.current
    if (!scroller) return
    const from = pendingRef.current ?? leadOf(scroller)
    moveTo(from + delta * YEAR, from)
  }

  function goToday() {
    const scroller = scrollerRef.current
    if (scroller) moveTo(home, leadOf(scroller), true)
  }

  const wheelMonth = useEffectEvent((delta: -1 | 1) => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const from = pendingRef.current ?? leadOf(scroller)
    moveTo(from + delta, from)
  })

  // A mouse has only a vertical wheel. Where the year fits and there's nothing
  // to scroll down to, that wheel moves through the months instead - one per
  // notch. A trackpad's sideways swipe, shift-wheel and pinch keep their own.
  // Not a React prop: React's wheel listeners are passive, and this has to
  // stop the page from taking the scroll.
  useEffect(() => {
    const scroller = scrollerRef.current
    const rows = rowsRef.current
    if (!scroller || !rows) return
    let travelled = 0
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.shiftKey) return
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      if (rows.scrollHeight > rows.clientHeight + 1) return
      event.preventDefault()
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 40
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? scroller.clientWidth
            : 1
      if (Math.sign(event.deltaY) !== Math.sign(travelled)) travelled = 0
      travelled += event.deltaY * unit
      if (Math.abs(travelled) < WHEEL_STEP) return
      wheelMonth(travelled > 0 ? 1 : -1)
      travelled = 0
    }
    scroller.addEventListener('wheel', handleWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', handleWheel)
  }, [])

  /** Zooms into a month out of the part of its column that's on screen. */
  function openMonth(index: number, column: HTMLElement) {
    const scroller = scrollerRef.current
    const rows = rowsRef.current
    if (!scroller || !rows) return
    const box = clearRect(scroller, rows)
    const cell = column.getBoundingClientRect()
    const left = Math.max(box.left, cell.left)
    const right = Math.min(box.right, cell.right)
    const top = Math.max(box.top, cell.top)
    const bottom = Math.min(box.bottom, cell.bottom)
    rememberPlanner({
      lead: leadOf(scroller),
      scrollTop: rows.scrollTop,
      perScreen,
      month: index,
      rect: { left: box.left, top: box.top, width: box.right - box.left, height: box.bottom - box.top },
      pitch: pitchOf(scroller),
    })
    transitionNavigate('zoom-in', () => navigate(`/calendar/${monthKeyAt(index)}`), {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
    })
  }

  const titleShift = reduceMotion ? 0 : 18
  const titleMotion = {
    initial: (dir: number) => ({ x: dir * titleShift, opacity: 0 }),
    animate: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: -dir * titleShift, opacity: 0 }),
  }

  return (
    <div
      className="planner-page"
      // Shows the completion bars; CSS draws them in and out.
      data-completion={showCompletion || undefined}
      style={{ '--planner-per-screen': perScreen } as CSSProperties}
    >
      <header className="planner-header">
        <div className="day-nav-heading planner-heading">
          <span className="day-nav-eyebrow">{spanLabel(view.lead, perScreen)}</span>
          <AnimatePresence initial={false} custom={view.dir} mode="popLayout">
            <motion.h1
              key={year}
              className="day-nav-title"
              custom={view.dir}
              variants={titleMotion}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={springSnappy}
            >
              {year}
            </motion.h1>
          </AnimatePresence>
        </div>

        <div className="planner-legend">
          {/* A layer over the days rather than a filter on them, so it sits
              apart from the kinds: off until turned on, then remembered. */}
          <button
            type="button"
            className="legend-chip completion-chip"
            aria-pressed={showCompletion}
            onClick={toggleCompletion}
          >
            <CompletionIcon />
            Completion
          </button>
          <span className="planner-legend-divider" aria-hidden="true" />
          <div className="legend-group" role="group" aria-label="Show special days">
            {categories.list.map((category) => (
              <button
                key={category.id}
                type="button"
                className="legend-chip"
                data-hue={category.color}
                aria-pressed={isSpecialCategoryVisible(category.id)}
                onClick={() => toggleSpecialCategory(category.id)}
              >
                <span className="legend-dot" aria-hidden="true" />
                {category.name}
              </button>
            ))}
          </div>
        </div>

        <div className="day-nav-controls planner-controls">
          {view.lead !== home && (
            <button type="button" className="day-nav-today" onClick={goToday}>
              Today
            </button>
          )}
          <button
            type="button"
            className="day-nav-step"
            onClick={() => step(-1)}
            aria-label="Previous year"
          >
            <ChevronLeftIcon />
          </button>
          <button
            type="button"
            className="day-nav-step"
            onClick={() => step(1)}
            aria-label="Next year"
          >
            <ChevronRightIcon />
          </button>
        </div>
      </header>

      {isError && (
        <p className="planner-error" role="alert">
          Couldn't load your special days: {error.message}
        </p>
      )}

      <div
        className="planner-scroll"
        ref={scrollerRef}
        onScroll={handleScroll}
        // A finger on the strip takes over from any scroll still on its way.
        onPointerDown={() => {
          pendingRef.current = null
        }}
      >
        <div
          className="planner-track"
          style={{ gridTemplateColumns: `repeat(${MONTH_COUNT}, var(--planner-col))` }}
        >
          <SnapPoints />
          <div className="planner-rows" ref={rowsRef}>
            <MonthStrip
              ref={stripRef}
              rendered={rendered}
              byDay={byDay}
              completion={completion}
              showCompletion={showCompletion}
              today={today}
              onOpenMonth={openMonth}
            />
          </div>
        </div>
      </div>

      {managing && <SpecialDaysDialog onClose={() => setManaging(false)} />}
    </div>
  )
}
