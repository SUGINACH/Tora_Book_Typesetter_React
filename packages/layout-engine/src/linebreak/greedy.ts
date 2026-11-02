/**
 * greedy.ts — מילוי חמדני מקסימלי על אינדקס המועמדים (שלב 42).
 *
 * ⚠️ **פיקסטורת השוואה בלבד — אסור לשימוש במסלול הייצור** (שלב 47 מסיר
 * את החמדני מ־next; כאן הוא נשמר כבייסליין השוואתי מסומן לבדיקות
 * differential של שלב 48). ההבדל היחיד מול ה־DP: בחירת הקצה הרחב ביותר
 * שנכנס לרוחב הטור בכל שורה בנפרד — בלי מבט גלובלי.
 *
 * אותו מודל רוחב ואותן נקודות שבירה כמו ה־DP (אינדקס המועמדים של שלב 41)
 * — כך ההשוואה הדיפרנציאלית מבודדת את האלגוריתם ולא את המדידה.
 */
import { buildLineCandidate, type JustificationMode, type LineBreakPoint, type LineCandidateIndex } from './candidates.js';
import { justificationOf, type DpLineChoice, type FeasibilityPolicy } from './dp.js';

export interface GreedyLine extends DpLineChoice {
  readonly emergency: boolean;
}

/**
 * שבירה חמדנית: מכל נקודות הקצה הזמינות מהמקטע הנוכחי נבחרת הרחבה ביותר
 * החוקית לפי המדיניות; אם אין כזו (מקטע בלתי־בר־שבירה רחב מהטור) — הקצה
 * הקצר ביותר, והקו מסומן כ־emergency (בדיוק כמו v0; הגלישה נראית
 * בביקורת — אין חיתוך ואין מחיקה).
 */
export function breakParagraphGreedy(
  index: LineCandidateIndex,
  policy: FeasibilityPolicy,
  columnWidthLu: number,
): readonly GreedyLine[] {
  const points = index.breakPlan.points;
  const lines: GreedyLine[] = [];
  if (points.length === 0) return lines;
  let startTok = 0;
  while (startTok < index.tokenCount) {
    const legal: { bp: LineBreakPoint }[] = [];
    let firstEnd: LineBreakPoint | null = null;
    for (const bp of points) {
      if (bp.tokenIndex <= startTok) continue;
      if (firstEnd === null) firstEnd = bp;
      if (spansMandatory(index, startTok, bp.tokenIndex)) continue;
      const candidate = buildLineCandidate(index, startTok, bp);
      if (policy.check(candidate, justificationOf(bp), columnWidthLu) === null) {
        legal.push({ bp });
      }
    }
    const chosen = legal.length > 0 ? legal[legal.length - 1]!.bp : firstEnd;
    if (chosen === null) break; // אין שום נקודת קצה — לא אמור לקרות (end תמיד קיים)
    const candidate = buildLineCandidate(index, startTok, chosen);
    lines.push({
      startTok,
      endTok: chosen.tokenIndex,
      breakPoint: chosen,
      justification: justificationOf(chosen) as JustificationMode,
      candidate,
      emergency: legal.length === 0,
    });
    startTok = chosen.kind === 'forced' ? chosen.tokenIndex + 1 : chosen.tokenIndex;
    if (lines.length > index.tokenCount + 2) break; // הגנת לולאה (חסינות בלבד)
  }
  return lines;
}

function spansMandatory(index: LineCandidateIndex, startTok: number, endTok: number): boolean {
  for (const p of index.breakPlan.points) {
    if (p.kind !== 'forced' && p.kind !== 'mandatory') continue;
    if (p.tokenIndex > startTok && p.tokenIndex < endTok) return true;
  }
  return false;
}
