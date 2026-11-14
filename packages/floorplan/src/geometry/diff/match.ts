/** Entities of two versions matched by id: the only matching the diff does. */

export interface Matched<T> {
  readonly added: T[]
  readonly removed: T[]
  readonly both: (readonly [before: T, after: T])[]
}

export function matchById<T extends { readonly id: string }>(
  before: readonly T[],
  after: readonly T[]
): Matched<T> {
  const earlier = new Map<string, T>()
  for (const item of before) earlier.set(item.id, item)

  const added: T[] = []
  const both: (readonly [T, T])[] = []
  const seen = new Set<string>()
  for (const item of after) {
    const previous = earlier.get(item.id)
    if (previous === undefined) added.push(item)
    else both.push([previous, item])
    seen.add(item.id)
  }

  const removed = before.filter((item) => !seen.has(item.id))
  return { added, removed, both }
}
