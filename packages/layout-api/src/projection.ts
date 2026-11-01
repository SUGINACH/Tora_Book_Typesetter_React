/**
 * projection.ts — היטל LU → CSS px (§6.1; שלב 31).
 *
 * "עיגון תצוגה ל־CSS/PDF מתבצע רק ב־projection" (§6.1). 1 LU = 1/65536 pt;
 * CSS px = 1/96 inch; 1pt = 4/3 px בדיוק רציונלי — לא המרת ה־px/mm
 * ההיסטורית האסורה (§6.1). ההמרה נעשית פעם אחת בהיטל בלבד; המנוע אינו משתמש בה לעולם.
 *
 * px = roundDiv(lu, 49152)  (49152 = 65536·3/4 — כלומר 1px = 49152 LU בדיוק).
 */
import type { LayoutUnit } from '@tora/measurement-api';
import { roundDiv } from '@tora/measurement-api';

/** LU → CSS px (96dpi רציונלי) — היטל בלבד. */
export function luToCssPx(lu: LayoutUnit): number {
  return roundDiv(lu, 49152);
}

/** LU → מחרוזת CSS px עם סיומת (לזרימת ההיטל בלבד). */
export function luToCssPxString(lu: LayoutUnit): string {
  return `${luToCssPx(lu)}px`;
}
