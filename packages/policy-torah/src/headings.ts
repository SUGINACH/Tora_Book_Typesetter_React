/**
 * headings.ts — התנהגויות כותרות H0–H7 כמדיניות מוזרקת (שלב 58; אפיון §10.1;
 * forcePageTemplate — שלב 59).
 *
 * הליבה הגנרית (מחולל המועמדים) אינה "יודעת" מהו H2 — היא מקבלת
 * התנהגות לכל בלוק heading דרך ה־hook `headingBehaviorOf`. ההתנהגויות
 * ממופות מ־legacy ל־policy id + גרסה (מרשם הכללים); אין עריכת מנוע
 * לכותרת חדשה.
 *
 * רמות (§10.1):
 *   H0 — פותח עמוד/פרק (forcePageTemplate; ברירת מחדל: פותח עמוד חדש)
 *   H1 — שער משנה/חלק ופתיחת עמוד (parity; שלב 60)
 *   H2 — פותח פרק, ריווח עליון ועיטורים לפי scope (שלב 61)
 *   H3 — כותרת רוחבית חוצת-טורים; לא פותחת עמוד מעצמה (שלב 56/62)
 *   H4–H6 — כותרות inline וליווי (escort; §10.1: "לפחות שתי שורות גוף")
 *   H7 — הערת צד (זרם sidenote — כבר במנוע משלב 54; לא בלוק גוף)
 */
import { asLu, type LayoutUnit } from '@tora/layout-api';

/** סוג העמוד שפותח-עמוד חייב לפתוח (forcePageTemplate; §10.1 H0; שלב 59). */
export type ForcedPageKind = 'body' | 'toc' | 'notes';

/** סוג ההתנהגות של כותרת בזרימת העימוד (מנוע אינו מכיר את המספרים). */
export type HeadingFlowRole =
  /** פותח עמוד/אזור — forcePageBreak + סוגר אזור (H0, H1). */
  | 'page-opener'
  /** כותרת רוחבית חוצת-טורים — barrier; לא פותחת עמוד מעצמה (H3). */
  | 'full-width-barrier'
  /** כותרת inline עם ליווי (H4–H6). */
  | 'inline'
  /** זרם הערת-צד — אינה בלוק גוף (H7). */
  | 'sidenote-stream';

/** מדיניות עיטורי H2 לפי scope (§10.1: both/siman_only/title_only). */
export interface H2OrnamentPolicy {
  readonly scope: 'both' | 'siman_only' | 'title_only' | 'none';
  /** מזהי נכסים מהמניפסט — עיטור עליון/תחתון; ריק = אין. */
  readonly topAssetIds: readonly string[];
  readonly bottomAssetIds: readonly string[];
}

/** התנהגות מלאה של רמת כותרת — כל מה שהמנוע צריך לדעת. */
export interface HeadingBehavior {
  readonly level: number;
  readonly flowRole: HeadingFlowRole;
  /**
   * פותחת עמוד חדש בכוח? (H0/H1 — כן; H3 — לא "מעצמה"; היא עוברת
   * עמוד רק כשאין מקום לפס). כשהבלוק מופיע באמצע עמוד — ההרחבה
   * שקודמת לו פותחת עמוד חדש (שלב 59: הגבול שלפניה הוא :OPEN).
   */
  readonly forcePageBreak: boolean;
  /**
   * התבנית שהעמוד שהפותחת פותחת חייב להשתמש בה (§10.1 H0 — forcePageTemplate;
   * שלב 59). undefined = סוג הזרימה של המחולל. תקף ל־page-opener בלבד.
   */
  readonly forcePageTemplate?: ForcedPageKind;
  /**
   * מספר קווי ליווי מינימום אחרי הכותרת באותו טור (§10.1: ברירת מחדל 2
   * ל־H2+; כותרת תלויה אינה "קנס קטן" — מועמד שבו הכותרת עוברת עם
   * הליווי מקבל עדיפות).
   */
  readonly escortLines: number;
  /** ריווח לפני/אחרי ב-LU — נמדד במועמד, לא overlay (§10.1 H2). */
  readonly spaceBeforeLu: LayoutUnit;
  readonly spaceAfterLu: LayoutUnit;
  /** עיטורים לפי scope (H2; שלב 61) — משפיעים על הגובה הנמדד. */
  readonly ornaments?: H2OrnamentPolicy;
}

/** מזהה ההתנהגות הקנוני — למרשם ול־rollback (כולל התבנית הכפויה — שלב 59). */
export function headingBehaviorId(b: HeadingBehavior): string {
  return `heading:v1|L${b.level}|${b.flowRole}|esc${b.escortLines}|f${b.forcePageBreak ? 1 : 0}`
    + (b.forcePageTemplate !== undefined ? `|t${b.forcePageTemplate}` : '');
}

/** ברירות המחדל של legacy לכל רמה (המרשם המלא ב־registry.ts). */
export const LEGACY_HEADING_DEFAULTS: Readonly<Record<number, Omit<HeadingBehavior, 'level'>>> = Object.freeze({
  0: { flowRole: 'page-opener', forcePageBreak: true, escortLines: 2, spaceBeforeLu: asLu(0), spaceAfterLu: asLu(0), forcePageTemplate: 'body' },
  1: { flowRole: 'page-opener', forcePageBreak: true, escortLines: 2, spaceBeforeLu: asLu(0), spaceAfterLu: asLu(0), forcePageTemplate: 'body' },
  2: { flowRole: 'page-opener', forcePageBreak: true, escortLines: 2, spaceBeforeLu: asLu(0), spaceAfterLu: asLu(0), forcePageTemplate: 'body' },
  3: { flowRole: 'full-width-barrier', forcePageBreak: false, escortLines: 2, spaceBeforeLu: asLu(0), spaceAfterLu: asLu(0) },
  4: { flowRole: 'inline', forcePageBreak: false, escortLines: 2, spaceBeforeLu: asLu(0), spaceAfterLu: asLu(0) },
  5: { flowRole: 'inline', forcePageBreak: false, escortLines: 2, spaceBeforeLu: asLu(0), spaceAfterLu: asLu(0) },
  6: { flowRole: 'inline', forcePageBreak: false, escortLines: 2, spaceBeforeLu: asLu(0), spaceAfterLu: asLu(0) },
  7: { flowRole: 'sidenote-stream', forcePageBreak: false, escortLines: 0, spaceBeforeLu: asLu(0), spaceAfterLu: asLu(0) },
});

/**
 * ה־hook שהמנוע מזריק — התנהגות לפי רמה; רמה לא מוכרת ⇒ ברירת מחדל
 * inline עם escort 2 (התנהגות בטוחה; לא שקט — מזוהה ב־id).
 */
export function legacyHeadingBehaviorOf(level: number): HeadingBehavior {
  const base = LEGACY_HEADING_DEFAULTS[level];
  if (base !== undefined) return Object.freeze({ level, ...base });
  return Object.freeze({ level, flowRole: 'inline', forcePageBreak: false, escortLines: 2, spaceBeforeLu: asLu(0), spaceAfterLu: asLu(0) });
}

/** אימות התנהגות — רשימת בעיות (ריקה = תקינה). */
export function headingBehaviorIssues(b: unknown): string[] {
  const issues: string[] = [];
  const v = b as Record<string, unknown> | null;
  if (typeof v !== 'object' || v === null) return ['not-an-object'];
  if (!Number.isSafeInteger(v.level) || (v.level as number) < 0 || (v.level as number) > 7) issues.push('level');
  if (!['page-opener', 'full-width-barrier', 'inline', 'sidenote-stream'].includes(String(v.flowRole))) issues.push('flowRole');
  if (typeof v.forcePageBreak !== 'boolean') issues.push('forcePageBreak');
  if (!Number.isSafeInteger(v.escortLines) || (v.escortLines as number) < 0) issues.push('escortLines');
  for (const f of ['spaceBeforeLu', 'spaceAfterLu'] as const) {
    if (!Number.isSafeInteger(v[f]) || (v[f] as number) < 0) issues.push(f);
  }
  if (v.flowRole === 'page-opener' && v.forcePageBreak !== true) issues.push('forcePageBreak:opener-must-force');
  if (v.flowRole === 'full-width-barrier' && v.forcePageBreak === true) issues.push('forcePageBreak:barrier-must-not-force');
  // forcePageTemplate (שלב 59; §10.1 H0): תקף לפותחי-עמוד בלבד, ורק סוג
  // עמוד לגיטימי — הרחבה שאינה פותחת עמוד אינה יכולה לדרוש תבנית
  if (v.forcePageTemplate !== undefined) {
    if (!['body', 'toc', 'notes'].includes(String(v.forcePageTemplate))) issues.push('forcePageTemplate');
    else if (v.flowRole !== 'page-opener') issues.push('forcePageTemplate:not-opener');
  }
  if (v.ornaments !== undefined) {
    const o = v.ornaments as Record<string, unknown> | null;
    if (typeof o !== 'object' || o === null
      || !['both', 'siman_only', 'title_only', 'none'].includes(String(o.scope))
      || !Array.isArray(o.topAssetIds) || !Array.isArray(o.bottomAssetIds)) issues.push('ornaments');
  }
  return issues;
}
