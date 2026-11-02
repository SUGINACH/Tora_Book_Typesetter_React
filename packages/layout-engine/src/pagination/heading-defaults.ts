/**
 * heading-defaults.ts — ברירות המחדל של התנהגות כותרות בתוך המנוע
 * (שלב 58; אפיון §10.1; forcePageTemplate — שלב 59; שער H1 ו-parity — שלב 60).
 *
 * המנוע אינו תלוי ב־policy-torah (גרף §5: הזרקה בלבד) — קובץ זה מספק
 * את ברירות המחדל המקומיות כששום מדיניות לא הוזרקה. policy-torah הוא
 * הבעלים האמיתי של ההתנהגויות (מרשם + גרסאות); העתק זה מוחזק זהה
 * במבחן השקילות של שלב 58 — כל סטייה נתפסת.
 */
import type { PageKind } from '@tora/layout-api';

/** סוג העמוד שפותח-עמוד חייב לפתוח (forcePageTemplate; §10.1 H0; שלב 59). */
export type ForcedPageKind = PageKind;

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
  /**
   * הפותחת חייבת להתחיל בעמוד recto (אי-זוגי; §10.1 H1 parity; שלב 60)?
   * כשהעמוד שהיא פותחת היה נופל על verso — נפתח עמוד ריק לפניו (בתוך
   * ההרחבה; legacy ensureOddPageStart). ברירות legacy: odd-h0/odd-h1=true,
   * odd-h2=false (default_settings.json של Orange, נעול במרשם ההגדרות).
   */
  readonly startOnRecto?: boolean;
  /**
   * ריווח עליון ועיטורי פתיחת פרק (§10.1 H2 — "opener template + measured
   * ornament boxes"; שלב 61). הערכים מדיניות; המנוע ממדד אותם ל-LU מהגאומטריה
   * ומהקווים בפועל: הריווח — אחוז מגובה הטור; העיטורים — יחס לגובה הקו
   * הראשון/האחרון של הכותרת. העיטור תופס בדיוק את המקום שנמדד לו (שער השלב).
   */
  readonly openerSpacing?: {
    /** h2-top-distance — חלק מגובה הטור (0.22 = 22%). */
    readonly spaceBeforePct: number;
    /** dim-h2-top-h — יחס לגובה הקו הראשון של הכותרת. */
    readonly ornamentTopEm: number;
    /** dim-h2-btm-h — יחס לגובה הקו האחרון של הכותרת. */
    readonly ornamentBottomEm: number;
  };
  /**
   * עיטור צד של מחסום רוחבי (§10.1 H3; §11.2; שלב 62): יחס-em לקו הכותרת
   * הראשון; גובה הפס = מקסימום(גובה הקווים, העיטור הנמדד). 0/undefined —
   * אין עיטור (ברירת המחדל הנעולה: h3-ornament-l/r='none').
   */
  readonly barrierOrnamentEm?: number;
}

/**
 * ברירות legacy: H0 פותח עמוד body ב-recto; H1 שער משנה (sub-shaar) ב-recto;
 * H2 פותח פרק (body, ללא כפיית recto); H3 barrier; H4–H6 inline; H7 זרם צד.
 */
const DEFAULTS: Readonly<Record<number, HeadingFlowBehavior>> = Object.freeze({
  0: { flowRole: 'page-opener', forcePageBreak: true, escortLines: 2, forcePageTemplate: 'body', startOnRecto: true },
  1: { flowRole: 'page-opener', forcePageBreak: true, escortLines: 2, forcePageTemplate: 'sub-shaar', startOnRecto: true },
  2: { flowRole: 'page-opener', forcePageBreak: true, escortLines: 2, forcePageTemplate: 'body', openerSpacing: { spaceBeforePct: 0.22, ornamentTopEm: 1.25, ornamentBottomEm: 1.25 } },
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
