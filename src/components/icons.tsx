/** Inline so they stay crisp at any size and inherit currentColor. */
export function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M20 6 9 17l-5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Empty rounded square - an unchecked checkbox, marking a task done. */
export function UncheckedBoxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  )
}

/** The same box as UncheckedBoxIcon, filled and ticked - a checked checkbox.
 *  Identical geometry to it, so the two states sit on the same pixels. */
export function CheckedBoxIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="16" height="16" rx="4" fill="currentColor" />
      {/* The page background rather than white: the fill behind it is the accent,
          which is light enough in the dark theme that white would be the weaker mark. */}
      <path
        d="M8 12.2 10.9 15 16 9.6"
        fill="none"
        stroke="var(--bg)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Empty circle - an unselected radio button, for a once task: it can only be
 *  answered one time, so it's a pick rather than a box ticked day after day.
 *  Same 16px footprint as UncheckedBoxIcon so the two sit in the same cell. */
export function UncheckedRadioIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.2" />
    </svg>
  )
}

/** The same ring as UncheckedRadioIcon with a dot in it - a selected radio button. */
export function CheckedRadioIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <circle cx="12" cy="12" r="4.2" fill="currentColor" />
    </svg>
  )
}

export function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M18 6 6 18M6 6l12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M3 3l18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/** Six dots, two columns - the standard drag-handle glyph. */
export function GripIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="9" cy="6" r="1.6" fill="currentColor" />
      <circle cx="9" cy="12" r="1.6" fill="currentColor" />
      <circle cx="9" cy="18" r="1.6" fill="currentColor" />
      <circle cx="15" cy="6" r="1.6" fill="currentColor" />
      <circle cx="15" cy="12" r="1.6" fill="currentColor" />
      <circle cx="15" cy="18" r="1.6" fill="currentColor" />
    </svg>
  )
}

/** Three dots in a row - the row's own actions menu. */
export function DotsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="5" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="19" cy="12" r="1.8" fill="currentColor" />
    </svg>
  )
}

/** Opens the sidebar where it isn't permanently on screen. */
export function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 7h16M4 12h16M4 17h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Circular arrow - undoing a task back to its open state. */
export function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 12a8 8 0 1 1 2.6 5.9M4 12V6m0 6h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Pencil - editing a note. */
export function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19 3 20l1-4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Plus sign - adding a new item. */
export function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 4v16M4 12h16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Box with a lid - archiving something out of the active views. */
export function ArchiveIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M3 6h18v3H3zM5 9v10h14V9M10 13h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Sun - today's tasks. */
export function TodayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2M19.07 4.93l-1.77 1.77M6.7 17.3l-1.77 1.77M19.07 19.07l-1.77-1.77M6.7 6.7 4.93 4.93"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Flag on a pole - a goal to reach. */
export function GoalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M5 21V4m0 0h13l-3 4 3 4H5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Four-square grid - a birds-eye overview. */
export function OverviewIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Lightbulb - brainstorming in the think tank. */
export function ThinkTankIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M9 18h6M10 21h4M8 14a6 6 0 1 1 8 0 4.5 4.5 0 0 0-1.5 3.2h-5A4.5 4.5 0 0 0 8 14Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Upward trend line - tracking progress over time. */
export function TrackingIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 18 9.5 11l4 4L20 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 6h6v6" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** A rising line over a baseline - opens a tracking unit's chart. */
export function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M4 19h16M5 15l4.5-4.5 3.5 3 6-6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Stroke icons in the SF Symbols manner: 2px, round caps, 24-unit box. */
function StrokeIcon({ d, strokeWidth = 2 }: { d: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** "‹" - the back button of a nav bar or a pushed sheet page. */
export function ChevronLeftIcon() {
  return <StrokeIcon d="M15 5l-7 7 7 7" strokeWidth={2.6} />
}

/** "›" - a row that leads somewhere (disclosure). */
export function ChevronRightIcon() {
  return <StrokeIcon d="M9 5l7 7-7 7" strokeWidth={2.6} />
}

/** "⌃⌄" - the trailing mark of an iOS pop-up button. */
export function ChevronUpDownIcon() {
  return <StrokeIcon d="M8 9l4-4 4 4M8 15l4 4 4-4" strokeWidth={2.2} />
}

export function SearchIcon() {
  return <StrokeIcon d="M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.8-4.8" />
}

/** "line.3.horizontal.decrease" - narrowing a list down. */
export function FilterIcon() {
  return <StrokeIcon d="M4 7h16M7 12h10M10 17h4" />
}

export function PinIcon() {
  return <StrokeIcon d="M9 4h6l-1 5 3 3v2H7v-2l3-3-1-5zM12 14v6" />
}

export function ShareIcon() {
  return <StrokeIcon d="M12 15V3M8 7l4-4 4 4M6 11H5v9h14v-9h-1" />
}

export function TrashIcon() {
  return <StrokeIcon d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
}

/** A wall calendar - the year of special days. Drawn like the tab icons
 *  beside it: 2px strokes, rounded corners. */
export function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path
        d="M3.5 10h17M8 3v4M16 3v4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** A ring three-quarters closed - the calendar's completion layer. The two
 *  parts are classed so the toggle can empty the ring while it's off. */
export function CompletionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle className="completion-icon-track" cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="3" />
      <path
        className="completion-icon-arc"
        d="M12 4a8 8 0 1 1-8 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** A checklist row - "Make Task". */
export function TaskIcon() {
  return <StrokeIcon d="M4 7l2 2 4-4M13 7h7M4 15l2 2 4-4M13 15h7" />
}
