export type Quality = 'max' | number;

export const QUALITY_OPTIONS: Quality[] = ['max', 2160, 1440, 1080, 720, 480, 360];

/** Distinct qualities across items, descending. */
export function offeredQualities(lists: number[][]): number[] {
  const set = new Set<number>();
  for (const l of lists) for (const q of l) if (Number.isFinite(q) && q > 0) set.add(q);
  return [...set].sort((a, b) => b - a);
}

/**
 * Default chip for a post: the Settings value if offered; otherwise the highest offered value
 * below it, else the lowest offered (DESIGN.md §12.3). "max" always stays "max".
 */
export function chooseQuality(preferred: Quality, offered: number[]): Quality {
  if (preferred === 'max' || offered.length === 0) return preferred;
  if (offered.includes(preferred)) return preferred;
  const below = offered.filter((q) => q < preferred);
  if (below.length) return Math.max(...below);
  return Math.min(...offered);
}

export function qualityLabel(q: Quality): string {
  return q === 'max' ? 'Best' : `${q}p`;
}
