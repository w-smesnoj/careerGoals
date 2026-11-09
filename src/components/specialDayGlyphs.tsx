import type { SpecialDayIcon } from '../api/specialDays'

/** Each glyph's strokes, on a 24-unit grid. */
const PATHS: Record<SpecialDayIcon, string[]> = {
  // The day off the calendar marks.
  flag: ['M5 21V4', 'M5 4h12l-2.5 4.5L17 13H5'],
  sun: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 1 0 0-8z',
    'M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4',
  ],
  gift: [
    'M5 9h14a1.5 1.5 0 0 1 1.5 1.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19v-8.5A1.5 1.5 0 0 1 5 9z',
    'M2.5 9h19M12 9v11.5',
    'M12 9c-1.5-3.5-5.5-4-5.5-1.5S10 9 12 9c2 0 5.5-.5 5.5-1.5S13.5 5.5 12 9z',
  ],
  star: ['M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z'],
  heart: ['M12 20s-7.5-4.5-7.5-10A4.25 4.25 0 0 1 12 7.4 4.25 4.25 0 0 1 19.5 10c0 5.5-7.5 10-7.5 10z'],
  music: [
    'M9 18V5.5l11-2V16',
    'M6 15a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM17 13a3 3 0 1 0 0 6 3 3 0 1 0 0-6z',
  ],
  // Under the weather.
  thermometer: ['M14 14.5V5a2 2 0 0 0-4 0v9.5a4 4 0 1 0 4 0z', 'M12 17.5V11'],
  plane: ['M21 3L10.5 13.5', 'M21 3l-6.5 18-4-7.5-7.5-4z'],
  briefcase: [
    'M4 7.5h16a1.5 1.5 0 0 1 1.5 1.5v9.5A1.5 1.5 0 0 1 20 20H4a1.5 1.5 0 0 1-1.5-1.5V9A1.5 1.5 0 0 1 4 7.5z',
    'M8.5 7.5V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5v2M2.5 13h19',
  ],
  sparkle: [
    'M10 3.5l1.6 4.9 4.9 1.6-4.9 1.6L10 16.5l-1.6-4.9L3.5 10l4.9-1.6z',
    'M18 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  ],
  graduation: [
    'M2.5 9.5L12 5l9.5 4.5L12 14z',
    'M6.5 11.75V16c0 1.4 2.5 3 5.5 3s5.5-1.6 5.5-3v-4.25',
    'M21.5 9.5v5',
  ],
  home: ['M3.5 10L12 3.5l8.5 6.5V20a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1z', 'M9.5 21v-6.5h5V21'],
  ticket: [
    'M3 8V6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5V8a2.5 2.5 0 0 0 0 5v1.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 14.5V13a2.5 2.5 0 0 0 0-5z',
    'M14.5 5v2M14.5 9.5v2M14.5 14v2',
  ],
  leaf: ['M5 19C5 10 10.5 4.5 20 4c-.5 9.5-6 15-15 15z', 'M5 19l8-8'],
  trophy: [
    'M7.5 4h9v5a4.5 4.5 0 0 1-9 0z',
    'M7.5 6H5a2.5 2.5 0 0 0 2.6 4.4M16.5 6H19a2.5 2.5 0 0 1-2.6 4.4',
    'M12 13.5V17M8.5 20.5h7M10 17h4v3.5h-4z',
  ],
  moon: ['M19.5 14.5A7.5 7.5 0 1 1 9.5 4.5a6 6 0 0 0 10 10z'],
}

/**
 * A category's glyph, drawn white on a tile of the category's own colour - the
 * Settings-row icon, so a holiday, a vacation and a birthday can be told
 * apart before a word is read.
 */
export function SpecialDayGlyph({ icon }: { icon: SpecialDayIcon }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={16}
      height={16}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[icon].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
