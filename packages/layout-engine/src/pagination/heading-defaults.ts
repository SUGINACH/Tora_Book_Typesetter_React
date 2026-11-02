/**
 * heading-defaults.ts — ברירות המחדל של התנהגות כותרות בתוך המנוע
 * (שלב 58; אפיון §10.1; forcePageTemplate — שלב 59).
 *
 * המנוע אינו תלוי ב־policy-torah (גרף §5: הזרקה בלבד) — קובץ זה מספק
 * את ברירות המחדל המקומיות כששום מדיניות לא הוזרקה. policy-torah הוא
 * הבעלים האמיתי של ההתנהגויות (מרשם + גרסאות); העתק זה מוחזק זהה
 * במבחן השקילות של שלב 58 — כל סטייה נתפסת.
 */

/** סוג העמוד שפותח-עמוד חייב לפתוח (forcePageTemplate; §10.1 H0; שלב 59). */
export type ForcedPageKind = 'body' | 'toc' | 'notes';

/** סוג ההתנהגות בזרימת העימוד (הליבה אינה מכירה H2 — רק תפקיד). */
export type HeadingFlowRole = 'page-opener' | 'full-width-barrier' | 'inline' | 'sidenote-stream';

/** ההתנהגות שהמחולל צורך — ממשק מינימלי (policy-torah מרחיב). */
export interface HeadingFlowBehavior {
  readonly flowRole: HeadingFlowRole;
  readonly forcePageBreak: boolean;
  readonly escortLines: number;
  /**
   * התבנית שהעמוד שהפותח פותח חייב להשתמש בה (§10.1 H0 — forcePageTemplate;
   * שלב 59). undefined = סוג הזרימה (input.pageKind). תקף ל־flowRole
   * 'page-opener' בלבד — ההחלטה בתוך ההרחבה שפותחת את העמוד (אין post-pass).
   */
  readonly forcePageTemplate?: ForcedPageKind;
}

/** ברירות legacy: H0–H2 פותחי-עמוד (תבנית body); H3 barrier; H4–H6 inline; H7 זרם צד. */
const DEFAULTS: Readonly<Record<number, HeadingFlowBehavior>> = Object.freeze({
  0: { flowRole: 'page-opener', forcePageBreak: true, escortLines: 2, forcePageTemplate: 'body' },
  1: { flowRole: 'page-opener', forcePageBreak: true, escortLines: 2, forcePageTemplate: 'body' },
  2: { flowRole: 'page-opener', forcePageBreak: true, escortLines: 2, forcePageTemplate: 'body' },
  3: { flowRole: 'full-width-barrier', forcePageBreak: false, escortLines: 2 },
  4: { flowRole: 'inline', forcePageBreak: false, escortLines: 2 },
  5: { flowRole: 'inline', forcePageBreak: false, escortLines: 2 },
  6: { flowRole: 'inline', forcePageBreak: false, escortLines: 2 },
  7: { flowRole: 'sidenote-stream', forcePageBreak: false, escortLines: 0 },
});

/** ברירת מחדל לפי רמה; רמה לא מוכרת ⇒ inline בטוח עם escort 2. */
export function legacyHeadingBehaviorOf(level: number): HeadingFlowBehavior {
  return DEFAULTS[level] ?? Object.freeze({ flowRole: 'inline' as const, forcePageBreak: false, escortLines: 2 });
}
