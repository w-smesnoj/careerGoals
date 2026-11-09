/**
 * How a measured value is written, everywhere it appears - a unit card, a
 * history row, the chip on a day row, the seed value in the log sheet.
 *
 * One implementation on purpose: it's also what keeps a summed aggregate from
 * printing as 0.30000000000000004.
 */
export function formatMeasurement(
  value: number,
  unit: { symbol: string; decimals: number },
): string {
  return `${value.toFixed(unit.decimals)}${unit.symbol ? ` ${unit.symbol}` : ''}`
}

/**
 * The big headline figure on a chart page: the same precision as
 * formatMeasurement, but grouped ("9,812") since it's read at a glance, and
 * without the symbol, which the headline sets smaller beside it.
 */
export function formatFigure(value: number, decimals: number): string {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

/**
 * A number as a person types it on a phone: "75.5", or "75,5" off a German
 * decimal keyboard, or with grouping ("7.000,5" / "7,000.5") - whichever
 * separator comes last is the decimal one.
 *
 * `null` for a blank box, `NaN` for something that isn't a number - the two
 * mean different things to a form (leave it out, versus a typo to flag).
 */
export function parseDecimal(text: string): number | null {
  // Spaces (\s takes no-break ones too) and apostrophes are only ever grouping.
  const compact = text.trim().replace(/[\s']/g, '')
  if (compact === '') return null

  const lastComma = compact.lastIndexOf(',')
  const lastDot = compact.lastIndexOf('.')
  let normalised = compact
  if (lastComma > -1 && lastDot > -1) {
    // Both present: the later one is the decimal mark, the other groups.
    normalised =
      lastComma > lastDot
        ? compact.replace(/\./g, '').replace(',', '.')
        : compact.replace(/,/g, '')
  } else if (lastComma > -1) {
    // A lone comma is a decimal comma; several are grouping ("1,000,000").
    normalised =
      compact.indexOf(',') === lastComma ? compact.replace(',', '.') : compact.replace(/,/g, '')
  }

  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(normalised)) return NaN
  return Number(normalised)
}

/** A number back into a field, the way it was typed rather than as 1e-7. */
export function decimalText(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value)
}
