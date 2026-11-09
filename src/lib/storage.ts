/**
 * localStorage that can't take a render down with it. Reads and writes both
 * fail outright in a private window or with site data blocked, and JSON.parse
 * throws on anything left behind by an older shape of the same key - none of
 * which is worth more than falling back to the default.
 */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch {
    return fallback
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Nothing to do about it, and nothing that depends on it having worked.
  }
}
