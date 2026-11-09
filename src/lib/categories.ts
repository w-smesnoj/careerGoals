/** Case-insensitive add: keeps the first casing seen, skips exact repeats. */
export function addCategory(categories: string[], value: string): string[] {
  const trimmed = value.trim()
  if (!trimmed) return categories
  const key = trimmed.toLowerCase()
  if (categories.some((category) => category.toLowerCase() === key)) return categories
  return [...categories, trimmed]
}
