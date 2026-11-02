/**
 * ir-serialize.ts — סריאליזציה קנונית של ה־IR (§6.5; שלב 31).
 *
 * parse/serialize משמר layoutHash: הסריאליזציה היא הייצוג הקנוני (canonicalJson —
 * מפתחות ממוינים רקורסיבית), ולכן סבב שלם serialize→parse→serialize מחזיר ביט-ביט
 * את אותה מחרוזת, ו-layoutHash של הפלט זהה לזה של הקלט (אינדוקציה מבנית:
 * הערכים הם JSON-able; מספרים שלמים בטוחים עוברים כמו שהם).
 *
 * הפלט לא כולל שום שדה רץ-זמן — ה־IR עצמו הוא המקור; אין כאן תאריך, host
 * או משך (ADR-002: layoutHash = ה־IR הקנוני בלבד).
 */
import { canonicalJson } from './canonical-hash.js';
import { createLayoutDocument, type LayoutDocument } from './ir.js';
import { LayoutApiError } from './errors.js';

/** סריאליזציה קנונית — מחרוזת יציבה לאותו IR (לארטיפקטים ולהשוואות). */
export function serializeLayoutDocument(doc: LayoutDocument): string {
  return canonicalJson(doc);
}

/**
 * פרסור ואימות: טקסט → LayoutDocument מאומת וקפוא.
 * טקסט שאינו JSON תקין או IR שאינו עובר אימות — שגיאה מקוטלגת.
 */
export function parseLayoutDocument(text: string): LayoutDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new LayoutApiError('errors.layoutir.INVALID_SERIALIZATION', { reason: 'json' }, `JSON שגוי: ${String((e as Error).message).slice(0, 120)}`);
  }
  try {
    return createLayoutDocument(parsed);
  } catch (err) {
    if (err instanceof LayoutApiError && err.catalogKey === 'errors.layoutir.INVALID_DOCUMENT') {
      throw new LayoutApiError('errors.layoutir.INVALID_SERIALIZATION', { reason: 'schema' }, String(err.message).slice(0, 300));
    }
    throw err;
  }
}
