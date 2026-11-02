/**
 * cost-scalar.ts — מודל עלות סקלרי ל־DP (שלב 42; אפיון §8.2).
 *
 * המודל הקלאסי בסגנון Knuth–Plass: סכום badness של שורות ה־justify
 * ועונש קבוע לקו הנגמר במקף. שורת last/natural אינה ממתחת רווחים —
 * badness 0 (§8.2: "שורה אחרונה אינה מוארכת כמו שורת justify רגילה").
 *
 * חשבון שלם בלבד: badness = min(MAX, roundDiv(SCALE·num², den²)) —
 * אין float, אין Infinity (§8.2: "קנסות אינם Infinity או floats; יש סף
 * overflow ו־Cost מקסימלי בטוח").
 *
 * שלב 43 יחליף מודל זה ב־QualityVector לקסיקוגרפי (ADR-004) בלי לגעת
 * בליבת ה־DP — המודל כאן הוא שלב הביניים המוכיח את המנגנון.
 */
import { roundDiv } from '@tora/layout-api';
import type { CostModel, LineContext } from './dp.js';

/** סקלת ה־badness: יחס מתיחה/כיווץ 1.0 ⇐ 10000. */
export const BADNESS_SCALE = 10000;
/** תקרת badness לשורה — יחס 2.0 (סף החירום של שלב 44). */
export const MAX_LINE_BADNESS = 40000;
/** עונש קו הנגמר במקף (חמור מ־badness שורה אחת מלאה, פחות משתיים). */
export const HYPHEN_DEMERITS = 20000;

/** badness של שורת justify בחשבון שלם. */
export function justifyBadness(widthLu: number, stretchLu: number, shrinkLu: number, columnWidthLu: number): number {
  const deficit = widthLu - columnWidthLu; // חיובי ⇐ דורש כיווץ
  if (deficit === 0) return 0;
  if (deficit > 0) {
    if (shrinkLu <= 0) return MAX_LINE_BADNESS; // אין מה לכווץ — רק בסולם חירום
    // חישוב שלם: SCALE·deficit²/shrink² — עם הגבלה ל־MAX
    const b = scaledSquare(deficit, shrinkLu);
    return Math.min(MAX_LINE_BADNESS, b);
  }
  const surplus = columnWidthLu - widthLu; // דורש מתיחה
  if (stretchLu <= 0) return MAX_LINE_BADNESS; // אין מה למתוח
  const b = scaledSquare(surplus, stretchLu);
  return Math.min(MAX_LINE_BADNESS, b);
}

function scaledSquare(num: number, den: number): number {
  // תקרה מוקדמת מדויקת: SCALE·num²/den² ≥ MAX ⇔ num ≥ 2·den (MAX/SCALE = 4) —
  // מונע בניית ריבוע ענק במקרי חירום לפני ה-min.
  if (num >= 2 * den) return MAX_LINE_BADNESS;
  // הערת הבטיחות המקורית ("den < ~474k ⇒ בטוח") הייתה שגויה — ל־den (מתיחה/כיווץ
  // מצטברים של קווי חירום ארוכים) אין כל חסם כזה, והמכפלה SCALE·num² חרגה מ־2⁵³
  // (נתגלה בסוללת שלב 46: UNSAFE_INTEGER). המסלול המהיר נשמר לטווח הבטוח;
  // מעבר לו — חישוב שלם מלא (BigInt) עם **אותה סמנטיקת roundDiv בדיוק**
  // (עיגול חצי-כלפי-∞ ⇔ floor((2n+d)/(2d)) לשלמים חיוביים): התוצאה זהה
  // מתמטית, דטרמיניסטית, ואינה זורקת. העיגול המרוכז ב־units.ts (ADR-001)
  // נשמר במסלול המהיר; המסלול המדויק משקף אותה הגדרה על מספרים גדולים.
  const product = BADNESS_SCALE * num * num;
  const denSq = den * den;
  if (Number.isSafeInteger(product) && Number.isSafeInteger(denSq)) {
    return roundDiv(product, denSq);
  }
  const bigN = BigInt(BADNESS_SCALE) * BigInt(num) * BigInt(num);
  const bigD = BigInt(den) * BigInt(den);
  return Number((2n * bigN + bigD) / (2n * bigD));
}

/** עלות שורה בודדת (שלם): badness + עונש מקף. */
export function scalarLineCost(ctx: LineContext, columnWidthLu: number): number {
  const badness = ctx.justification === 'justify'
    ? justifyBadness(ctx.candidate.metrics.widthLu, ctx.candidate.metrics.stretchLu, ctx.candidate.metrics.shrinkLu, columnWidthLu)
    : 0;
  return badness + (ctx.candidate.metrics.hyphenEnd ? HYPHEN_DEMERITS : 0);
}

/** המודל הסקלרי: מסלול = סכום עלויות שורה (שלם בטוח). */
export function createScalarCostModel(columnWidthLu: number): CostModel<number> {
  return {
    start: () => 0,
    append: (path: number, ctx: LineContext) => path + scalarLineCost(ctx, columnWidthLu),
    compare: (a: number, b: number) => a - b,
  };
}
