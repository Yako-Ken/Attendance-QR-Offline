import { useEffect, useState } from 'react'

/**
 * Breakpoints chosen by content need rather than device names:
 *
 *   40rem  — dialogs stop being bottom sheets
 *   45rem  — two-column fields
 *   48rem  — mode cards pair up
 *   60rem  — student pass gains a side column
 *   64rem  — the desktop rail appears and review becomes a real table
 *   68rem  — scanner and ledger sit side by side
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const list = window.matchMedia(query);
    const onChange = (): void => setMatches(list.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

export const BREAKPOINTS = {
  dialogModal: '(min-width: 40rem)',
  twoColumns: '(min-width: 45rem)',
  modeCards: '(min-width: 48rem)',
  studentSplit: '(min-width: 60rem)',
  desktopRail: '(min-width: 64rem)',
  scannerSplit: '(min-width: 68rem)',
} as const;