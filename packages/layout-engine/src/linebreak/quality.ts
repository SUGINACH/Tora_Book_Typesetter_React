/**
 * quality.ts — QualityVector וה־comparator הלקסיקוגרפי (שלב 43; אפיון §6.6, §8.2; ADR-004).
 *
 * מודל הבחירה האחיד: feasibility נפרדת מ־soft cost (מועמד לא חוקי נפסל
 * לפני תמחור), והעדפת מסלולים לקסיקוגרפית לפי רכיבי הווקטור בסדר ADR-004.
 * כל רכיב שלם בטוח; חיבור מרכיבי־מרכיב חוקי ל־DP (הסדר הלקסיקוגרפי על
 * שלמים אינווריאנטי לחיבור — הוכח גם במבחני תכונה).
 *
 * רכיבים בהיקף M5 שאינם רלוונטיים עדיין (escort, notes, איזון, עמודים)
 * קבועים ל־0 — הטלת §6.6 שלמה: הסדר לא ישתנה כש־M6/M7 ימלאו אותם.
 */
import type { CostModel, LineContext } from './dp.js';
import { BADNESS_SCALE, MAX_LINE_BADNESS, justifyBadness } from './cost-scalar.js';
import { DEFAULT_PARAGRAPH_END_RULES, paragraphEndDebts, type ParagraphEndRules } from './paragraph-end.js';

/** משקלי חומרת fallback לרכיב הראשון (ADR-004; §14.3). */
export const FALLBACK_SEVERITY_WEIGHT = Object.freeze({ HIGH: 2, MEDIUM: 1 } as const);

export interface QualityVector {
  /** 1 — סכום משקלי חומרת fallback לאורך המסלול (HIGH=2, MEDIUM=1). */
  readonly fallbackSeverity: number;
  /** 2 — הפרות ליווי כותרות (M6/M7; 0 בהיקף פסקה). */
  readonly headingEscortDebt: number;
  /** 3 — העתקת הערות מעוגנן (M6; 0 בהיקף פסקה). */
  readonly noteDisplacement: number;
  /** 4 — קווי קצה חד־מילוליים: אלמנה/יתום ברמת הפסקה (מופעל בשלב 45). */
  readonly widowOrphanDebt: number;
  /** 5 — שורה אחרונה חד־מילולית קצרה (מופעל בשלב 45). */
  readonly runtDebt: number;
  /** 6 — סכום badness של קווי justify (תקרה לקו). */
  readonly lineBadness: number;
  /** 7 — מספר קווים המסתיימים במקף. */
  readonly hyphenDebt: number;
  /** 8 — איזון טורים (M6; 0 בהיקף פסקה). */
  readonly columnImbalance: number;
  /** 9 — ספירת עמודים לפי מדיניות (M6; 0 בהיקף פסקה). */
  readonly pageCountDebt: number;
}

/** הרכיבים בסדר ADR-004 — הסדר עצמו הוא החוזה. */
export const QUALITY_VECTOR_KEYS = Object.freeze([
  'fallbackSeverity', 'headingEscortDebt', 'noteDisplacement', 'widowOrphanDebt',
  'runtDebt', 'lineBadness', 'hyphenDebt', 'columnImbalance', 'pageCountDebt',
] as const);

export const ZERO_QUALITY: QualityVector = Object.freeze({
  fallbackSeverity: 0, headingEscortDebt: 0, noteDisplacement: 0, widowOrphanDebt: 0,
  runtDebt: 0, lineBadness: 0, hyphenDebt: 0, columnImbalance: 0, pageCountDebt: 0,
});

/**
 * ההשוואה הלקסיקוגרפית: total order טרנזיטיבי. שלילי ⇐ a עדיף.
 * אינווריאנטי לחיבור וקטורי (הוכח במבחני תכונה) — תנאי הנחוצה לנכונות ה־DP.
 */
export function compareQuality(a: QualityVector, b: QualityVector): number {
  if (a.fallbackSeverity !== b.fallbackSeverity) return a.fallbackSeverity < b.fallbackSeverity ? -1 : 1;
  if (a.headingEscortDebt !== b.headingEscortDebt) return a.headingEscortDebt < b.headingEscortDebt ? -1 : 1;
  if (a.noteDisplacement !== b.noteDisplacement) return a.noteDisplacement < b.noteDisplacement ? -1 : 1;
  if (a.widowOrphanDebt !== b.widowOrphanDebt) return a.widowOrphanDebt < b.widowOrphanDebt ? -1 : 1;
  if (a.runtDebt !== b.runtDebt) return a.runtDebt < b.runtDebt ? -1 : 1;
  if (a.lineBadness !== b.lineBadness) return a.lineBadness < b.lineBadness ? -1 : 1;
  if (a.hyphenDebt !== b.hyphenDebt) return a.hyphenDebt < b.hyphenDebt ? -1 : 1;
  if (a.columnImbalance !== b.columnImbalance) return a.columnImbalance < b.columnImbalance ? -1 : 1;
  if (a.pageCountDebt !== b.pageCountDebt) return a.pageCountDebt < b.pageCountDebt ? -1 : 1;
  return 0;
}

/** חיבור מרכיבי־מרכיב (לצירוף קו למסלול). */
export function addQuality(a: QualityVector, b: QualityVector): QualityVector {
  return Object.freeze({
    fallbackSeverity: a.fallbackSeverity + b.fallbackSeverity,
    headingEscortDebt: a.headingEscortDebt + b.headingEscortDebt,
    noteDisplacement: a.noteDisplacement + b.noteDisplacement,
    widowOrphanDebt: a.widowOrphanDebt + b.widowOrphanDebt,
    runtDebt: a.runtDebt + b.runtDebt,
    lineBadness: a.lineBadness + b.lineBadness,
    hyphenDebt: a.hyphenDebt + b.hyphenDebt,
    columnImbalance: a.columnImbalance + b.columnImbalance,
    pageCountDebt: a.pageCountDebt + b.pageCountDebt,
  });
}

/**
 * קוד ה-fallback של שורה לפי המדידה בלבד (בלי תלות ברמת הסולם שבה נבדקה
 * חוקיותה): גלישה אחרי כיווץ מלא ⇒ EMERGENCY_LINE (HIGH); חסר מילוי אחרי
 * מתיחה מלאה ⇒ EMERGENCY_STRETCH (MEDIUM). ברמה 0 קווים כאלה כלל אינם
 * חוקיים — העלות נכנסת לתמונה רק כשהסולם (שלב 44) התיר אותם.
 */
export function lineFallbackCode(ctx: LineContext, columnWidthLu: number): 'EMERGENCY_LINE' | 'EMERGENCY_STRETCH' | null {
  const m = ctx.candidate.metrics;
  if (ctx.justification === 'justify') {
    if (m.widthLu - columnWidthLu > m.shrinkLu) return 'EMERGENCY_LINE';
    if (columnWidthLu - m.widthLu > m.stretchLu) return 'EMERGENCY_STRETCH';
    return null;
  }
  return m.widthLu > columnWidthLu ? 'EMERGENCY_LINE' : null;
}

/** עלות השורה כווקטור (ADR-004; כללי סיום פסקה — שלב 45: runt ו־widow/orphan ברמת הפסקה). */
export function lineQualityVector(
  ctx: LineContext,
  columnWidthLu: number,
  rules: ParagraphEndRules = DEFAULT_PARAGRAPH_END_RULES,
): QualityVector {
  const m = ctx.candidate.metrics;
  const badness = ctx.justification === 'justify'
    ? justifyBadness(m.widthLu, m.stretchLu, m.shrinkLu, columnWidthLu)
    : 0;
  const fallbackCode = lineFallbackCode(ctx, columnWidthLu);
  const debts = paragraphEndDebts(ctx, rules);
  return Object.freeze({
    ...ZERO_QUALITY,
    fallbackSeverity: fallbackCode === 'EMERGENCY_LINE'
      ? FALLBACK_SEVERITY_WEIGHT.HIGH
      : fallbackCode === 'EMERGENCY_STRETCH' ? FALLBACK_SEVERITY_WEIGHT.MEDIUM : 0,
    widowOrphanDebt: debts.widowOrphanDebt,
    runtDebt: debts.runtDebt,
    lineBadness: badness,
    hyphenDebt: m.hyphenEnd ? 1 : 0,
  });
}

/** המודל הווקטורי — מודל העלות של מסלול הייצור משלב זה (ADR-004). */
export function createQualityCostModel(
  columnWidthLu: number,
  rules: ParagraphEndRules = DEFAULT_PARAGRAPH_END_RULES,
): CostModel<QualityVector> {
  return {
    start: () => ZERO_QUALITY,
    append: (path: QualityVector, ctx: LineContext) => addQuality(path, lineQualityVector(ctx, columnWidthLu, rules)),
    compare: compareQuality,
  };
}

/** סקלריזציה לתצוגה בפנקס בלבד (מוגדרות רווחים בטוחים; אין להשוות לפיה). */
export function qualityDisplayScalar(q: QualityVector): number {
  return q.fallbackSeverity * 1_000_000_000_000
    + q.headingEscortDebt * 10_000_000_000
    + q.noteDisplacement * 100_000_000
    + q.widowOrphanDebt * 10_000_000
    + q.runtDebt * 1_000_000
    + Math.min(q.lineBadness, 900_000)
    + q.hyphenDebt * 10_000
    + q.columnImbalance * 1_000
    + q.pageCountDebt;
}

export { BADNESS_SCALE, MAX_LINE_BADNESS };
