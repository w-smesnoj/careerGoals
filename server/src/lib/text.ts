/**
 * Escapes a user string so it matches literally inside a $regex.
 *
 * Anywhere a typed value reaches a regex this is needed: searching the think
 * tank for "(", or naming a tracking unit "hit rate (%)", are both ordinary
 * things to do, and unescaped either one throws rather than matching.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
}
