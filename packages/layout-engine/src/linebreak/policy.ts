/**
 * policy.ts — מדיניות חוקיות שלב־0 לשורה (שלב 42; אפיון §8.2).
 *
 * הפרדת feasibility מ־soft cost (§8.2, ושוב ב־ADR-004): מועמד לא חוקי
 * נפסל **לפני** תמחור — אילוץ קשה אינו הופך לקנס רך.
 *
 * שלב 0 (רגיל):
 *   - שורת justify: חוקית אם אין גלישה אחרי כיווץ מלא (width − shrink ≤ col)
 *     ואין חסר מילוי אחרי מתיחה מלאה (col − width ≤ stretch).
 *   - שורת natural/last (נגמרה בכפייה/חובה/סוף פסקה): חוקית אם width ≤ col
 *     (אין דרישת מילוי — "שורה אחרונה אינה מוארכת").
 *
 * סולם החירום המדורג (שלב 44) מרחיב מדיניות זו בשכבות: EMERGENCY_STRETCH
 * ואז גלישה מתועדת — כל שכבה נרשמת, שום דבר לא שקט.
 */
import type { LineCandidate } from './candidates.js';
import type { JustificationMode } from './candidates.js';
import type { FeasibilityPolicy } from './dp.js';

export function createLevel0Policy(): FeasibilityPolicy {
  return {
    overflowAllowanceLu: 0,
    check(candidate: LineCandidate, justification: JustificationMode, columnWidthLu: number): string | null {
      const m = candidate.metrics;
      if (justification === 'justify') {
        if (m.widthLu - m.shrinkLu > columnWidthLu) return 'overflow';
        if (columnWidthLu - m.widthLu > m.stretchLu) return 'underfill';
        return null;
      }
      // natural/last — אין מילוי; רק איסור גלישה
      if (m.widthLu > columnWidthLu) return 'overflow';
      return null;
    },
  };
}
