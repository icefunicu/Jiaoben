const isWordChar = (ch) => /[A-Za-z0-9_]/.test(ch);

// These functions are now moved to worker.js and should not be exported or used in main thread.
// Kept here only if needed for tests or non-worker fallback (which we removed).
// We only export rankMatches which is used by scanner.js (main thread)

/**
 * Ranks and filters matches to remove overlaps and select best candidates.
 * @param {Array<Object>} matches - Raw matches.
 * @param {string} lang - Language code ('en' or 'zh').
 * @returns {Array<Object>} Ranked matches.
 */
export const rankMatches = (matches, lang) => {
  const byNode = new Map();
  matches.forEach((match) => {
    const list = byNode.get(match.node) || [];
    list.push(match);
    byNode.set(match.node, list);
  });
  const ranked = [];
  for (const [node, list] of byNode.entries()) {
    const sorted = list.sort((a, b) => {
      if (a.start !== b.start) return a.start - b.start;
      return (b.end - b.start) - (a.end - a.start);
    });
    const selected = [];
    for (const candidate of sorted) {
      const last = selected[selected.length - 1];
      if (!last) {
        selected.push(candidate);
        continue;
      }
      if (candidate.start >= last.end) {
        selected.push(candidate);
      } else if (lang === "zh") {
        const lastLen = last.end - last.start;
        const candLen = candidate.end - candidate.start;
        if (candLen > lastLen) {
          selected[selected.length - 1] = candidate;
        }
      }
    }
    ranked.push(...selected);
  }
  return ranked;
};

export const enforceEnglishBoundary = (match) => {
  const text = match.text;
  const before = match.start > 0 ? text[match.start - 1] : "";
  const after = match.end < text.length ? text[match.end] : "";
  if (before && isWordChar(before)) return false;
  if (after && isWordChar(after)) return false;
  return true;
};
