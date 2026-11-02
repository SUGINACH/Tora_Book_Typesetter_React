/**
 * notes.ts — שריון הערות שוליים בתוך חיפוש העמודים (שלב 53; פרק ז/M6; ADR-005).
 *
 * אסמכתא: אפיון §9.3#5 ("לכל candidate מחשבים את אזור ההערות הנדרש, קו
 * ההפרדה והגובה; רק אחר כך נקבע שטח הגוף הפנוי"), §10.3 (גוף הערה אטומי —
 * עוברת עם העוגן או המועמד נפסל; גובה נמדד; אין overflow ואין split שקט),
 * §6.6 (feasibility לפני cost), §8.2 (אין כשל שקט — LONG_NOTE_SPLIT נרשם).
 *
 * עקרונות (שער השלב: "כל עוגן והערה מאומתים גאומטרית וסמנטית"):
 *   1. הצריבה בתוך הליכת הגבולות של המחולל (שלב 52) — לא post-pass: קו
 *      הנושא הפניית הערה מצרב את גובה ההערה (+ הפרדה פעם אחת לעמוד)
 *      מתקציד אזור ההערות ומהמקום הפנוי לגוף של שני הטורים כאחד
 *      (בלוק הערות ברוחב מלא; fn-layout-mode: block).
 *   2. אינווריאנט לכל טור: קווים שהוצבו + הערות שנצרבו ≤ גובה התוכן —
 *      נאכף על ידי בדיקת ההתאמה (הגבול שמפר אינו נוצר מלכתחילה).
 *   3. דחיית עוגן כברירת מחדל; פיצול רק בדגל מדיניות מפורש, בגבולות
 *      קווים, עם LONG_NOTE_SPLIT בפנקס והמשך קנוני ‎{noteId}#cont‎
 *      (ADR-005 §5).
 *   4. הכל או כלום לקו עם מספר הפניות (ADR-005 §6).
 */
import { asLu, type LayoutUnit } from '@tora/layout-api';
import { LayoutEngineError } from '../errors.js';

// ─────────────────────────── מפרט גוף הערה ───────────────────────────

/**
 * גוף הערה כפי שנמדד — פלט שבירת השורות (שלב 47) על גוף ההערה.
 * הגבהים ב-LU; אין הערכות (ADR-005 §1: "אין notes.length * 20").
 */
export interface NoteBodySpec {
  readonly noteId: string;
  /** גבהי הקווים של גוף ההערה, לפי הסדר — לצורך נקודות פיצול חוקיות. */
  readonly lineHeightLu: readonly LayoutUnit[];
  /** גובה כולל = סכום הקווים (נבדק עקבי). */
  readonly heightLu: LayoutUnit;
}

export function noteBodyIssues(spec: unknown): string[] {
  const issues: string[] = [];
  const v = spec as Record<string, unknown> | null;
  if (typeof v !== 'object' || v === null) return ['not-an-object'];
  if (typeof v.noteId !== 'string' || v.noteId.length === 0) issues.push('noteId');
  if (!Array.isArray(v.lineHeightLu) || (v.lineHeightLu as unknown[]).length === 0) { issues.push('lineHeightLu:empty'); return issues; }
  let sum = 0;
  for (let i = 0; i < (v.lineHeightLu as unknown[]).length; i++) {
    const h = (v.lineHeightLu as unknown[])[i];
    if (typeof h !== 'number' || !Number.isSafeInteger(h) || h <= 0) { issues.push(`lineHeightLu[${i}]`); return issues; }
    sum += h as number;
  }
  if (v.heightLu !== sum) issues.push('heightLu:mismatch');
  return issues;
}

/** בניית מפרט מאומת מגבהי קווים. */
export function makeNoteBodySpec(noteId: string, lineHeightLu: readonly number[]): NoteBodySpec {
  const spec: NoteBodySpec = {
    noteId,
    lineHeightLu: Object.freeze(lineHeightLu.map((h) => asLu(h))),
    heightLu: asLu(lineHeightLu.reduce((a, b) => a + b, 0)),
  };
  const issues = noteBodyIssues(spec);
  if (issues.length > 0) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'note-body', reason: `${noteId}: ${issues.join(';')}` }, `מפרט גוף הערה שגוי: ${noteId}`);
  }
  return Object.freeze(spec);
}

/** מזהה ההמשך הקנוני של הערה מפוצלת — ‎{noteId}#cont‎ (ADR-005 §5). */
export function continuationNoteId(noteId: string): string {
  return `${noteId}#cont`;
}

// ─────────────────────────── מדיניות ───────────────────────────

/** מדיניות שריון הערות — מוזרקת; ברירות המחדל נעולות (ADR-005). */
export interface NoteReservationPolicy {
  /**
   * גובה קו ההפרדה של גוש ההערות, ב-LU — מדוד. נצרב פעם אחת לעמוד שיש
   * בו הערות, לפני ההערה הראשונה. ברירת מחדל 0 (בלי קו; הערך האמיתי
   * מוזרק מהמדידה בחיבור הייצור).
   */
  readonly separatorHeightLu?: number;
  /**
   * פיצול הערה ארוכה מעמוד ריק מותר? ברירת מחדל false — דחיית עוגן עד
   * כשל מפורש; true — פיצול בגבולות קווים עם LONG_NOTE_SPLIT (ADR-005 §5).
   */
  readonly allowLongNoteSplit?: boolean;
}

export const DEFAULT_NOTE_RESERVATION_POLICY: Readonly<Required<NoteReservationPolicy>> = Object.freeze({
  separatorHeightLu: 0,
  allowLongNoteSplit: false,
});

export function resolveNotePolicy(policy?: NoteReservationPolicy): Required<NoteReservationPolicy> {
  const merged = { ...DEFAULT_NOTE_RESERVATION_POLICY, ...(policy ?? {}) };
  if (!Number.isSafeInteger(merged.separatorHeightLu) || merged.separatorHeightLu < 0) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'note-policy', reason: 'separatorHeightLu' }, 'גובה הפרדה שגוי');
  }
  return merged;
}

// ─────────────────────────── תוצאת שריון להערה אחת ───────────────────────────

export type NoteReservationOutcome =
  | {
    /** נכנסת במלואה — זה הגובה שנצרב. */
    readonly kind: 'fits';
    readonly placedHeightLu: number;
    readonly continuationId?: undefined;
    readonly continuationHeightLu?: undefined;
  }
  | {
    /** נכנסת בפיצול — החלק הראשון נצרב, השאר המשך (ADR-005 §5). */
    readonly kind: 'split';
    readonly placedHeightLu: number;
    /** מספר הקווים שנותרו בעמוד זה — נקודת הפיצול (בגבולות קווים בלבד). */
    readonly placedLines: number;
    readonly continuationId: string;
    readonly continuationHeightLu: number;
  }
  | {
    /** אינה נכנסת — דחיית עוגן: הגבול שכולל את הקו אינו נוצר. */
    readonly kind: 'defer';
    readonly placedHeightLu: 0;
    readonly continuationId?: undefined;
    readonly continuationHeightLu?: undefined;
  }
  | {
    /** גדולה מעמוד ריק והפיצול אסור — כשל מפורש (ADR-005 §5-א). */
    readonly kind: 'fail';
    readonly reason: string;
    readonly placedHeightLu?: undefined;
    readonly continuationId?: undefined;
    readonly continuationHeightLu?: undefined;
  };

/**
 * הכרעת שריון הערה אחת (ADR-005): נכנסת / נפרשת / נדחית / כשל.
 *
 * @param spec גוף ההערה המדוד (או המשך קודם — מפרט חלקי).
 * @param availableLu המקום הפנוי בגוש ההערות של העמוד (אחרי ההערות
 *        שכבר נצרבו בו, כולל ההפרדה אם כבר נצרבה).
 * @param emptyBudgetLu תקציב אזור ההערות של עמוד ריק (להכרעת fail).
 */
export function reserveNote(
  spec: NoteBodySpec,
  availableLu: number,
  emptyBudgetLu: number,
  policy: Required<NoteReservationPolicy>,
): NoteReservationOutcome {
  const issues = noteBodyIssues(spec);
  if (issues.length > 0) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'note-body', reason: `${spec.noteId}: ${issues.join(';')}` }, `מפרט גוף הערה שגוי: ${spec.noteId}`);
  }
  if (spec.heightLu <= availableLu) {
    return { kind: 'fits', placedHeightLu: spec.heightLu };
  }
  // אינה נכנסת במלואה: גדולה מעמוד ריק?
  const totalWithSeparator = spec.heightLu + (policy.separatorHeightLu > 0 && emptyBudgetLu < spec.heightLu + policy.separatorHeightLu ? 0 : 0);
  void totalWithSeparator;
  const fitsEmptyPage = spec.heightLu <= emptyBudgetLu;
  if (!fitsEmptyPage && !policy.allowLongNoteSplit) {
    return { kind: 'fail', reason: `note ${spec.noteId} height ${spec.heightLu} > empty page budget ${emptyBudgetLu} and split forbidden (ADR-005)` };
  }
  if (!fitsEmptyPage && policy.allowLongNoteSplit) {
    // פיצול חובה גם בעמוד ריק: החלק הראשון = מקסימום קווים שנכנסים לעמוד ריק
    const budget = Math.min(emptyBudgetLu, Math.max(availableLu, 0));
    return splitAt(spec, budget, emptyBudgetLu);
  }
  if (!policy.allowLongNoteSplit) {
    // נכנסת לעמוד ריק אבל לא לכאן — דחיית עוגן (ברירת המחדל)
    return { kind: 'defer', placedHeightLu: 0 };
  }
  // פיצול מותר ונכנסת לעמוד ריק: לפחות קו אחד חייב להיכנס כאן
  return splitAt(spec, availableLu, emptyBudgetLu);
}

function splitAt(spec: NoteBodySpec, availableLu: number, emptyBudgetLu: number): NoteReservationOutcome {
  // נקודת הפיצול: מספר הקווים המקסימלי שנכנס (לפחות 1); ההמשך חייב להיות
  // קטן או שווה לתקציב עמוד ריק — אחרת יפוצל שוב בעמוד הבא (שרשרת המשכים)
  let placed = 0;
  let height = 0;
  for (const lineH of spec.lineHeightLu) {
    if (height + lineH > availableLu) break;
    height += lineH;
    placed += 1;
  }
  if (placed === 0) {
    // אפילו קו אחד לא נכנס — דחיית עוגן (ההמשך ינוסה בעמוד הבא)
    return { kind: 'defer', placedHeightLu: 0 };
  }
  const restHeight = spec.heightLu - height;
  void emptyBudgetLu;
  return {
    kind: 'split',
    placedHeightLu: height,
    placedLines: placed,
    continuationId: continuationNoteId(spec.noteId),
    continuationHeightLu: restHeight,
  };
}

/** פיצול מפרט לשניים לפי מספר קווים — לבניית גוף ההמשך שיישמר במחולל. */
export function splitNoteBodySpec(spec: NoteBodySpec, linesPlaced: number): NoteBodySpec {
  if (!Number.isSafeInteger(linesPlaced) || linesPlaced < 0 || linesPlaced > spec.lineHeightLu.length) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'note-split', reason: `linesPlaced=${String(linesPlaced)}` }, 'נקודת פיצול שגויה');
  }
  return makeNoteBodySpec(continuationNoteId(spec.noteId), spec.lineHeightLu.slice(linesPlaced));
}
