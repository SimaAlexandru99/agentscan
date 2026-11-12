export function isShadowed(fact: { effective?: boolean }): boolean {
  return fact.effective === false;
}

/**
 * Per key, the highest rank wins (first wins ties) and is marked effective;
 * every other ranked item is marked shadowed. `rankOf` returning undefined
 * leaves the item unranked and untouched.
 */
export function applyPrecedence<T extends { effective?: boolean }>(
  items: readonly T[],
  keyOf: (item: T) => string,
  rankOf: (item: T) => number | undefined,
): void {
  const ranked: { item: T; key: string; rank: number }[] = [];
  const best = new Map<string, number>();
  for (const item of items) {
    const rank = rankOf(item);
    if (rank === undefined) {
      continue;
    }
    const key = keyOf(item);
    ranked.push({ item, key, rank });
    const current = best.get(key);
    if (current === undefined || rank > current) {
      best.set(key, rank);
    }
  }
  const won = new Set<string>();
  for (const { item, key, rank } of ranked) {
    item.effective = rank === best.get(key) && !won.has(key);
    if (item.effective) {
      won.add(key);
    }
  }
}
