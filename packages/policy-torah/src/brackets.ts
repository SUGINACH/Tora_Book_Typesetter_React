/**
 * brackets.ts — סוגריים חוצי עמוד בתוך המצב: מדיניות תצוגה וזרעי טרנספורמציה
 * (שלב 65; אפיון §10.4).
 *
 * המחסנית חיה ב־PaginationState.openBracketStack (שלב 49; §10.1) — אין צורך
 * ב־protectParens() שמשנה עמודים אחרי האיזון. מה שנותר ברמת המדיניות:
 * כשסוגר פותח נשאר בסוף עמוד — ההכרעה (דיכוי התו / סימן המשך / כלום) היא
 * מדיניות, והביצוע נרשם כ־TransformRecord עם סיבה ומקור (§10.4) — כך
 * ש־Text Audit מבדיל בין נוסח המקור, תו מושמט מותר ותו מיוצר על-ידי
 * המנוע.
 */
import type { TransformRecord } from '@tora/layout-api';

/** הכרעת התצוגה של סוגר פותח שנשאר בסוף עמוד (§10.4). */
export type PageEndOpenBracketAction = 'suppress' | 'continuation-mark' | 'none';

/** מדיניות תצוגת סוגריים חוצי-עמוד. */
export interface BracketDisplayPolicy {
  /** מה עושים כשסוגר פותח נשאר בסוף העמוד. */
  readonly pageEndOpen: PageEndOpenBracketAction;
}

/**
 * ברירת המחדל: **none** — הסוגר חוצה עמודים כחוק (המחסנית במצב; §9.1)
 * ואין שום טרנספורמציה של נוסח המקור. החלופות (דיכוי/סימן המשך) הן
 * יכולות מדיניות מפורשות לפי §10.4 — נבחרות בהזרקה עד שייפתח מפתח
 * הגדרה ייעודי (תועד במרשם).
 */
export const DEFAULT_BRACKET_DISPLAY_POLICY: BracketDisplayPolicy = Object.freeze({ pageEndOpen: 'none' });

/** מדיניות תצוגת סוגריים מההגדרות (כרגע — הברירה הנעולה; נקודת הרחבה). */
export function bracketDisplayPolicyOf(settings: { readonly values: Readonly<Record<string, unknown>> }): BracketDisplayPolicy {
  void settings; // נקודת הרחבה עתידית למפתח הגדרה ייעודי (תועד במרשם)
  return DEFAULT_BRACKET_DISPLAY_POLICY;
}

/** חציית סוגריים שזוהתה במסלול — זרע ל־TransformRecord (האטומים בצד הקורא). */
export interface BracketPageCrossing {
  /** מזהה הזוג (pairId מעץ הפרסר; §10.4). */
  readonly pairId: string;
  /** סוג הסוגר. */
  readonly kind: 'round' | 'square';
  /** העמוד שבסופו הסוגר הפותח נותר. */
  readonly physicalPageIndex: number;
  /** ההרחבה שסגרה את העמוד (לפנקס). */
  readonly candidateId: string;
  /** קץ המסמך — הזוג לא נסגר כלל (בעיית קלט; §10.4: "לא 'מתוקן' בשקט"). */
  readonly atDocumentEnd: boolean;
}

/**
 * בניית ה־TransformRecord לחצייה לפי המדיניות (§10.4: "עם סיבה ומקור"):
 * suppress — תו מושמט מותר (from=אטום הסוגר, to=ריק); continuation-mark —
 * תו מיוצר על-ידי המנוע (from=ריק, to=האטום שנולד); none — null (אין
 * שינוי נוסח; הסוגר חוצה כחוק). טהור ודטרמיניסטי.
 */
export function bracketTransformFor(
  crossing: BracketPageCrossing,
  policy: BracketDisplayPolicy,
  openAtomId: TransformRecord['from'][number],
  markAtomId: TransformRecord['to'][number],
): TransformRecord | null {
  if (crossing.atDocumentEnd) return null; // קלט לקוי — מדווח, לא מתוקן
  switch (policy.pageEndOpen) {
    case 'suppress':
      return {
        kind: 'suppress' as TransformRecord['kind'],
        from: [openAtomId],
        to: [],
        reason: 'bracket-open-at-page-end',
        detail: { pairId: crossing.pairId, kind: crossing.kind, page: crossing.physicalPageIndex },
      };
    case 'continuation-mark':
      return {
        kind: 'insert' as TransformRecord['kind'],
        from: [],
        to: [markAtomId],
        reason: 'bracket-continuation-mark',
        detail: { pairId: crossing.pairId, kind: crossing.kind, page: crossing.physicalPageIndex },
      };
    default:
      return null;
  }
}
