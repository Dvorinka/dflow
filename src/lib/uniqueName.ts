// Deterministic unique-name resolution: base, base-1, base-2, ... (#235).
// Replaces random suffixes so names stay readable and predictable.
export const getUniqueName = async (
  exists: (name: string) => Promise<boolean>,
  base: string,
): Promise<string> => {
  if (!(await exists(base))) return base
  let i = 1
  while (await exists(`${base}-${i}`)) {
    i++
  }
  return `${base}-${i}`
}
