import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { OVERLAY_SCROLLBARS } from '../components/OverlayScrollbar'
import { DAY_WIDTH, SIDEBAR, TrackerTimeline } from '../components/TrackerTimeline'
import { usePrefs } from '../hooks/usePrefs'
import { useSpecialDayOccurrences } from '../hooks/useSpecialDayOccurrences'
import { useTracker } from '../hooks/useTracker'
import { shiftDay } from '../lib/date'
import {
  defaultTimelineView,
  fitTimelineView,
  readTimelineView,
  type TimelineView,
} from '../lib/timelineView'

/** Width a classic vertical scrollbar takes. None where the app draws its own
 *  floating ones; on a touch screen, whose own float, a few pixels of slack. */
function scrollbarAllowance(): number {
  return window.matchMedia(OVERLAY_SCROLLBARS).matches ? 0 : 16
}

export function OverviewPage() {
  const box = useRef<HTMLDivElement>(null)
  // Null until there's a window to open on: the stored one if the canvas has
  // ever been panned here, otherwise one fitted to this container's width in
  // the layout effect below. The timeline is held back that one render because
  // it reads its opening window once, on mount - both the library's
  // `defaultTimeStart`/`defaultTimeEnd` and the wrapper's minimum width are
  // derived from it, so handing it a placeholder first would open the canvas
  // on the wrong zoom.
  const [view, setView] = useState(readTimelineView)

  useLayoutEffect(() => {
    if (view || !box.current) return
    // The canvas is whatever's left beside the sidebar; a day column as wide as
    // a task row is tall makes each tick cell square. The allowance is for the
    // page's own scrollbar: this is measured while the page is still a single
    // "Loading tracker…" line, and the rows about to fill it will bring one in
    // and take the width back. Overshooting costs at most one column; not
    // leaving the room costs a stray sideways scrollbar under the timeline.
    const canvas = box.current.clientWidth - SIDEBAR - scrollbarAllowance()
    setView(canvas > 0 ? fitTimelineView(canvas, DAY_WIDTH) : defaultTimelineView())
  }, [view])

  return (
    <div className="overview" ref={box}>
      {view && <OverviewBody view={view} />}
    </div>
  )
}

/** Split out so every hook keyed off the opening window mounts with the real
 *  one rather than re-keying the moment it's measured. */
function OverviewBody({ view }: { view: TimelineView }) {
  const { sortOrder, isVisible, isGoalStatusVisible, isStatusVisible } = usePrefs()
  const { data, isPending, isError, error, isFetching } = useTracker()

  // Deliberately wider than both the loaded span and the opening window. The
  // tracker's span stops at the last goal's due date, but panning is free, and
  // a vacation booked for next summer should already be drawn when you get
  // there. Holidays are computed and cached per year, so the extra reach is
  // close to free.
  const [specialFrom, specialTo] = useMemo(() => {
    const from = data && data.from < view.from ? data.from : view.from
    const to = data && data.to > view.to ? data.to : view.to
    return [shiftDay(from, -365), shiftDay(to, 365)]
  }, [data, view])

  const occurrences = useSpecialDayOccurrences(specialFrom, specialTo)

  const visibleGoals = useMemo(
    () =>
      (data?.goals ?? []).filter(
        (goal) => isVisible(goal.categories) && isGoalStatusVisible(goal.status),
      ),
    [data, isVisible, isGoalStatusVisible],
  )

  return (
    <>
      {isPending && <p className="muted">Loading tracker…</p>}
      {isError && <p className="error">Could not load the tracker: {error.message}</p>}
      {data && data.goals.length > 0 && visibleGoals.length === 0 && (
        <p className="muted">No goals match the selected filters.</p>
      )}
      {data && (visibleGoals.length > 0 || data.goals.length === 0) && (
        <TrackerTimeline
          goals={visibleGoals}
          days={data.days}
          from={data.from}
          to={data.to}
          viewFrom={view.from}
          viewTo={view.to}
          sortOrder={sortOrder}
          isStatusVisible={isStatusVisible}
          occurrences={occurrences}
        />
      )}
      {isFetching && <p className="muted overview-syncing">syncing…</p>}
    </>
  )
}
