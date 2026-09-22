const WORD = /[\p{L}\p{N}]+/gu;

/** Trigram set with pg_trgm semantics: each word padded with two leading and one trailing space. */
export function trigrams(text: string): Set<string> {
  const set = new Set<string>();
  for (const word of text.toLowerCase().match(WORD) ?? []) {
    const padded = `  ${word} `;
    for (let i = 0; i <= padded.length - 3; i++) {
      set.add(padded.slice(i, i + 3));
    }
  }
  return set;
}

/** Equivalent to pg_trgm similarity(): |shared trigrams| / |union of trigrams|. */
export function trigramSimilarity(a: string, b: string): number {
  const setA = trigrams(a);
  const setB = trigrams(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const t of setA) {
    if (setB.has(t)) shared++;
  }
  return shared / (setA.size + setB.size - shared);
}
