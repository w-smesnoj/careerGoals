import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AppNav } from './components/AppNav'
import { AppSidebar } from './components/AppSidebar'
import { OverlayScrollbar } from './components/OverlayScrollbar'
import { FabAddProvider } from './context/FabAddProvider'
import { PrefsProvider } from './context/PrefsProvider'
import { TodayPage } from './routes/TodayPage'
import { GoalsPage } from './routes/GoalsPage'
import { GoalPage } from './routes/GoalPage'
import { OverviewPage } from './routes/OverviewPage'
import { CalendarPage } from './routes/CalendarPage'
import { MonthPage } from './routes/MonthPage'
import { ThinkTankPage } from './routes/ThinkTankPage'
import { ThoughtPage } from './routes/ThoughtPage'
import { TrackingPage } from './routes/TrackingPage'
import { UnitChartPage } from './routes/UnitChartPage'
import { ComparePage } from './routes/ComparePage'
import { recallScroll, rememberScroll, signalRouteCommit } from './lib/navigation'
import './App.css'

/** Toasts sit above the tab bar. */
const TOAST_OFFSET = {
  bottom: 'calc(var(--app-nav-space) + 12px)',
}

/**
 * Scroll position per history entry: back lands where you left the page, a
 * new page starts at its top. Then tells a waiting push transition that the
 * new route is on screen (lib/navigation) - after the scroll, so the
 * transition's snapshot is taken at the right place.
 */
function NavigationEffects() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const currentKey = useRef(location.key)
  const lastPath = useRef(location.pathname)

  useEffect(() => {
    window.history.scrollRestoration = 'manual'
    let frame = 0
    function handleScroll() {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => rememberScroll(currentKey.current, window.scrollY))
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', handleScroll)
    }
  }, [])

  useLayoutEffect(() => {
    currentKey.current = location.key
    if (navigationType === 'POP') window.scrollTo(0, recallScroll(location.key))
    // A query string changing on the same page (a tag filter) isn't a new page.
    else if (lastPath.current !== location.pathname) window.scrollTo(0, 0)
    lastPath.current = location.pathname
    signalRouteCommit()
  }, [location.key, location.pathname, navigationType])

  return null
}

function App() {
  // Only reachable below the sidebar breakpoint, where the filters open as a sheet.
  const [sidebarOpen, setSidebarOpen] = useState(false)
  // Only Overview's timeline benefits from the full window width; every
  // other route stays inside the shared shell cap. The calendar goes further:
  // the whole viewport and no sidebar - its legend is its filter.
  const { pathname } = useLocation()
  const isOverview = pathname === '/overview'
  const isCalendar = pathname === '/calendar'

  return (
    <PrefsProvider>
      <FabAddProvider>
        <NavigationEffects />
        <div className="app">
          {/* The sidebar belongs to the shell, not to a page: the category
              filter it carries applies to every screen. */}
          <div
            className="app-body"
            data-wide={isOverview || undefined}
            data-full={isCalendar || undefined}
          >
            <AppSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <main className="app-main">
              <Routes>
                {/* The day screen is the daily driver, so it owns the root path. */}
                <Route path="/" element={<TodayPage />} />
                <Route path="/goals" element={<GoalsPage />} />
                <Route path="/goals/:goalId" element={<GoalPage />} />
                <Route path="/overview" element={<OverviewPage />} />
                <Route path="/calendar" element={<CalendarPage />} />
                <Route path="/calendar/:month" element={<MonthPage />} />
                <Route path="/think-tank" element={<ThinkTankPage />} />
                <Route path="/think-tank/:thoughtId" element={<ThoughtPage />} />
                <Route path="/tracking" element={<TrackingPage />} />
                <Route path="/tracking/compare" element={<ComparePage />} />
                <Route path="/tracking/:unitId" element={<UnitChartPage />} />
                <Route path="*" element={<TodayPage />} />
              </Routes>
            </main>
          </div>

          {/* Outside .app-body, which is scaled while a sheet is up: the tab
              bar (and the add button in it) stays put while the page recedes. */}
          <AppNav onOpenSidebar={() => setSidebarOpen(true)} />
          <OverlayScrollbar />
          <Toaster
            theme="system"
            position="bottom-center"
            offset={TOAST_OFFSET}
            mobileOffset={TOAST_OFFSET}
            gap={8}
            visibleToasts={3}
          />
        </div>
      </FabAddProvider>
    </PrefsProvider>
  )
}

export default App
