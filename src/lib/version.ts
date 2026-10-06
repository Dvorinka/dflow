// Minimal semver-ish comparison (numeric segments, leading v stripped).
// ponytail: no semver dep for one comparison; upgrade if ranges/prereleases needed.
/**
 * Returns true when `latest` is a newer numeric version than `current`.
 */
export const isVersionNewer = (
  latest: string,
  current: string,
): boolean => {
  const parse = (v: string): number[] =>
    v
      .replace(/^[vV]/, '')
      .split('.')
      .map(part => {
        const n = parseInt(part, 10)
        return Number.isNaN(n) ? 0 : n
      })

  const a = parse(latest)
  const b = parse(current)
  const len = Math.max(a.length, b.length)

  for (let i = 0; i < len; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }

  return false
}
