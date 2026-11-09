import { useMemo, useRef, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { useGoals } from '../hooks/useGoals'
import { useSheet } from '../hooks/useSheet'
import { Sheet, SheetBody, SheetButton, SheetHeader } from './Sheet'
import { CategoryFilter, type CategoryCount } from './CategoryFilter'
import { DateCalendar } from './DateCalendar'
import { GoalStatusFilter } from './GoalStatusFilter'
import { OverlayScrollbar } from './OverlayScrollbar'
import { SortControl } from './SortControl'
import { SpecialDayFilter } from './SpecialDayFilter'
import { TaskStatusFilter } from './TaskStatusFilter'

/** Every category in use, with how many goals carry it. Sourced from the goal
 *  list rather than the tracker, so the filter is the same on every screen -
 *  including the ones that never load the tracker. */
function useCategoryCounts(): CategoryCount[] {
  const { data: goals } = useGoals()

  return useMemo(() => {
    const counts = new Map<string, number>()
    for (const goal of goals ?? []) {
      if (goal.status === 'archived') continue
      for (const category of goal.categories) {
        counts.set(category, (counts.get(category) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [goals])
}

/** Below the sidebar breakpoint the same filters come up as a bottom sheet -
 *  the one place every sheet in the app comes from. */
function FiltersSheet({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <Sheet label="Filters" size="large" onClose={onClose}>
      <FiltersSheetBody>{children}</FiltersSheetBody>
    </Sheet>
  )
}

function FiltersSheetBody({ children }: { children: ReactNode }) {
  const sheet = useSheet()
  return (
    <>
      <SheetHeader
        title="Filters"
        trailing={
          <SheetButton bold onClick={() => void sheet.close()}>
            Done
          </SheetButton>
        }
      />
      <SheetBody>
        <div className="filters-sheet">{children}</div>
      </SheetBody>
    </>
  )
}

/**
 * The app's one sidebar, rendered by the shell rather than by a page: the
 * category filter controls every screen, so it can't belong to any of them.
 * Below the sidebar breakpoint the same content opens as a bottom sheet.
 */
export function AppSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const categories = useCategoryCounts()
  // Sort only means anything to the timeline, so it only shows on that screen.
  const showSort = useLocation().pathname === '/overview'
  const scroller = useRef<HTMLDivElement>(null)

  const content = (
    <>
      <DateCalendar />

      <CategoryFilter categories={categories} />

      <GoalStatusFilter />

      <TaskStatusFilter />

      <SpecialDayFilter />

      {showSort && <SortControl />}

      <div className="sidebar-rest" />
    </>
  )

  return (
    <>
      <aside className="app-sidebar">
        <div ref={scroller} className="app-sidebar-scroll">
          {content}
        </div>
        <OverlayScrollbar scrollerRef={scroller} />
      </aside>

      {open && <FiltersSheet onClose={onClose}>{content}</FiltersSheet>}
    </>
  )
}
