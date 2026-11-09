import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { goalStatuses, type GoalStatus } from '../api/goals'
import { taskStatusFilters, type CompletionStatus, type TaskStatusFilter } from '../api/tracker'
import type { SortOrder } from '../hooks/useTimelineRows'
import { readStored, writeStored } from '../lib/storage'
import { PrefsContext, type PrefsValue } from './prefs'

const HIDDEN_KEY = 'careerGoals.hiddenCategories'
const HIDDEN_STATUSES_KEY = 'careerGoals.hiddenStatuses'
const HIDDEN_GOAL_STATUSES_KEY = 'careerGoals.hiddenGoalStatuses'
const SORT_KEY = 'careerGoals.sortOrder'
// Category ids. The kinds these replaced were kept under hiddenSpecialKinds;
// that key is simply no longer read.
const HIDDEN_SPECIAL_CATEGORIES_KEY = 'careerGoals.hiddenSpecialCategories'
const BUNDESLAND_KEY = 'careerGoals.bundesland'
const COMPLETION_KEY = 'careerGoals.showCompletion'

/**
 * View preferences that outlive the page you set them on: the category filter
 * is meant to apply everywhere, not just to the screen whose sidebar it
 * happens to be drawn in, and neither it nor the sort order is worth setting
 * twice, so both persist.
 */
export function PrefsProvider({ children }: { children: ReactNode }) {
  const [hiddenCategories, setHiddenCategories] = useState<Set<string>>(
    () => new Set(readStored<string[]>(HIDDEN_KEY, [])),
  )
  const [hiddenStatuses, setHiddenStatuses] = useState<Set<TaskStatusFilter>>(
    () => new Set(readStored<TaskStatusFilter[]>(HIDDEN_STATUSES_KEY, [])),
  )
  // Archived hidden out of the box - that's how every screen behaved before
  // this filter existed, so a first visit here shouldn't look any different.
  const [hiddenGoalStatuses, setHiddenGoalStatuses] = useState<Set<GoalStatus>>(
    () => new Set(readStored<GoalStatus[]>(HIDDEN_GOAL_STATUSES_KEY, ['archived'])),
  )
  const [sortOrder, setSortOrderState] = useState<SortOrder>(() =>
    readStored<SortOrder>(SORT_KEY, 'grouped'),
  )
  const [hiddenSpecialCategories, setHiddenSpecialCategories] = useState<Set<string>>(
    () => new Set(readStored<string[]>(HIDDEN_SPECIAL_CATEGORIES_KEY, [])),
  )
  // No Bundesland until one is picked, so a first visit shows the nine
  // nationwide holidays rather than silently claiming a region's.
  const [bundesland, setBundeslandState] = useState<string>(() =>
    readStored<string>(BUNDESLAND_KEY, ''),
  )
  // The calendar shows special days only, unless asked for more.
  const [showCompletion, setShowCompletion] = useState<boolean>(() =>
    readStored<boolean>(COMPLETION_KEY, false),
  )

  // Written where the change happens rather than from an effect, so a mount
  // never writes back the value it just read.
  const commitHidden = useCallback((next: Set<string>) => {
    writeStored(HIDDEN_KEY, [...next])
    setHiddenCategories(next)
  }, [])

  const toggleCategory = useCallback((name: string) => {
    setHiddenCategories((current) => {
      const next = new Set(current)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      writeStored(HIDDEN_KEY, [...next])
      return next
    })
  }, [])

  const soloCategory = useCallback(
    (name: string, all: string[]) => {
      commitHidden(new Set(all.filter((category) => category !== name)))
    },
    [commitHidden],
  )

  const clearCategories = useCallback(() => commitHidden(new Set()), [commitHidden])

  const commitHiddenStatuses = useCallback((next: Set<TaskStatusFilter>) => {
    writeStored(HIDDEN_STATUSES_KEY, [...next])
    setHiddenStatuses(next)
  }, [])

  const toggleStatus = useCallback((status: TaskStatusFilter) => {
    setHiddenStatuses((current) => {
      const next = new Set(current)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      writeStored(HIDDEN_STATUSES_KEY, [...next])
      return next
    })
  }, [])

  const soloStatus = useCallback(
    (status: TaskStatusFilter) => {
      commitHiddenStatuses(new Set(taskStatusFilters.filter((candidate) => candidate !== status)))
    },
    [commitHiddenStatuses],
  )

  const clearStatuses = useCallback(() => commitHiddenStatuses(new Set()), [commitHiddenStatuses])

  const isStatusVisible = useCallback(
    (status: CompletionStatus | null) => hiddenStatuses.size === 0 || !hiddenStatuses.has(status ?? 'todo'),
    [hiddenStatuses],
  )

  const commitHiddenGoalStatuses = useCallback((next: Set<GoalStatus>) => {
    writeStored(HIDDEN_GOAL_STATUSES_KEY, [...next])
    setHiddenGoalStatuses(next)
  }, [])

  const toggleGoalStatus = useCallback((status: GoalStatus) => {
    setHiddenGoalStatuses((current) => {
      const next = new Set(current)
      if (next.has(status)) next.delete(status)
      else next.add(status)
      writeStored(HIDDEN_GOAL_STATUSES_KEY, [...next])
      return next
    })
  }, [])

  const soloGoalStatus = useCallback(
    (status: GoalStatus) => {
      commitHiddenGoalStatuses(new Set(goalStatuses.filter((candidate) => candidate !== status)))
    },
    [commitHiddenGoalStatuses],
  )

  const clearGoalStatuses = useCallback(
    () => commitHiddenGoalStatuses(new Set()),
    [commitHiddenGoalStatuses],
  )

  const isGoalStatusVisible = useCallback(
    (status: GoalStatus) => !hiddenGoalStatuses.has(status),
    [hiddenGoalStatuses],
  )

  const setSortOrder = useCallback((order: SortOrder) => {
    writeStored(SORT_KEY, order)
    setSortOrderState(order)
  }, [])

  const commitHiddenSpecialCategories = useCallback((next: Set<string>) => {
    writeStored(HIDDEN_SPECIAL_CATEGORIES_KEY, [...next])
    setHiddenSpecialCategories(next)
  }, [])

  const toggleSpecialCategory = useCallback((id: string) => {
    setHiddenSpecialCategories((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      writeStored(HIDDEN_SPECIAL_CATEGORIES_KEY, [...next])
      return next
    })
  }, [])

  const soloSpecialCategory = useCallback(
    (id: string, all: string[]) => {
      commitHiddenSpecialCategories(new Set(all.filter((candidate) => candidate !== id)))
    },
    [commitHiddenSpecialCategories],
  )

  const clearSpecialCategories = useCallback(
    () => commitHiddenSpecialCategories(new Set()),
    [commitHiddenSpecialCategories],
  )

  const isSpecialCategoryVisible = useCallback(
    (id: string) => !hiddenSpecialCategories.has(id),
    [hiddenSpecialCategories],
  )

  const setBundesland = useCallback((code: string) => {
    writeStored(BUNDESLAND_KEY, code)
    setBundeslandState(code)
  }, [])

  const toggleCompletion = useCallback(() => {
    setShowCompletion((current) => {
      writeStored(COMPLETION_KEY, !current)
      return !current
    })
  }, [])

  // Hiding a category removes it from an OR-filter rather than requiring it,
  // so something disappears only once every one of its categories is hidden.
  const isVisible = useCallback(
    (categories: string[]) =>
      hiddenCategories.size === 0 ||
      categories.length === 0 ||
      categories.some((category) => !hiddenCategories.has(category)),
    [hiddenCategories],
  )

  const value = useMemo<PrefsValue>(
    () => ({
      hiddenCategories,
      toggleCategory,
      soloCategory,
      clearCategories,
      isVisible,
      hiddenStatuses,
      toggleStatus,
      soloStatus,
      clearStatuses,
      isStatusVisible,
      hiddenGoalStatuses,
      toggleGoalStatus,
      soloGoalStatus,
      clearGoalStatuses,
      isGoalStatusVisible,
      sortOrder,
      setSortOrder,
      hiddenSpecialCategories,
      toggleSpecialCategory,
      soloSpecialCategory,
      clearSpecialCategories,
      isSpecialCategoryVisible,
      bundesland,
      setBundesland,
      showCompletion,
      toggleCompletion,
    }),
    [
      hiddenCategories,
      toggleCategory,
      soloCategory,
      clearCategories,
      isVisible,
      hiddenStatuses,
      toggleStatus,
      soloStatus,
      clearStatuses,
      isStatusVisible,
      hiddenGoalStatuses,
      toggleGoalStatus,
      soloGoalStatus,
      clearGoalStatuses,
      isGoalStatusVisible,
      sortOrder,
      setSortOrder,
      hiddenSpecialCategories,
      toggleSpecialCategory,
      soloSpecialCategory,
      clearSpecialCategories,
      isSpecialCategoryVisible,
      bundesland,
      setBundesland,
      showCompletion,
      toggleCompletion,
    ],
  )

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>
}
