/**
 * errors.ts — קטלוג שגיאות content-model ובסיס ContentModelError (שלב 14).
 *
 * ל־content-model אין תלויות (אפיון §5) ולכן הקטלוג מקומי — אך באותו
 * דפוס מחייב שנקבע בשלב 12 (אפיון §6.3, §16, §12.1):
 *   1. אין שגיאה ללא קוד קטלוגי ומפתח i18n — נאכף בזמן יצירת השגיאה.
 *   2. אין הצגת error.message גולמי למשתמש; מציגים מפתח+params.
 *   3. הקטלוג סטטי ודטרמיניסטי — כל הקודים רשומים מראש.
 */

/** פרמטרים להצגת שגיאה — ערכים סדירים בלבד. */
export type ErrorParamValue = string | number | boolean | null;
export type ErrorParams = Readonly<Record<string, ErrorParamValue>>;

/** רשומת קטלוג: מפתח i18n יציב, פרמטרים וחומרה. */
export interface ErrorCatalogEntry {
  /** מפתח i18n יציב — למשל errors.span.INVALID_RANGE (משמש גם כמזהה הקטלוגי). */
  readonly i18nKey: string;
  /** שמות הפרמטרים שההודעה המתורגמת מצפה להם. */
  readonly params: readonly string[];
  readonly severity: 'fatal' | 'error' | 'warning';
}

/** קטלוג השגיאות של content-model — סטטי וקפוא. */
export const CONTENT_MODEL_ERROR_CATALOG: Readonly<Record<string, ErrorCatalogEntry>> = Object.freeze({
  // ── spans (שלב 14; מוצאן ב-spans.ts) ──
  'errors.span.INVALID_DOCUMENT_ID': { i18nKey: 'errors.span.INVALID_DOCUMENT_ID', params: ['documentId'], severity: 'error' },
  'errors.span.INVALID_STREAM': { i18nKey: 'errors.span.INVALID_STREAM', params: ['stream'], severity: 'error' },
  'errors.span.INVALID_RANGE': { i18nKey: 'errors.span.INVALID_RANGE', params: ['startUtf16', 'endUtf16'], severity: 'error' },
  'errors.span.NON_INTEGER_OFFSET': { i18nKey: 'errors.span.NON_INTEGER_OFFSET', params: ['value', 'field'], severity: 'error' },
  'errors.span.INVALID_IMPORTER_PATH': { i18nKey: 'errors.span.INVALID_IMPORTER_PATH', params: ['importerPath'], severity: 'error' },
  'errors.span.SLICE_OUT_OF_RANGE': { i18nKey: 'errors.span.SLICE_OUT_OF_RANGE', params: ['from', 'to', 'length'], severity: 'error' },
  'errors.span.INVALID_ID': { i18nKey: 'errors.span.INVALID_ID', params: ['kind', 'value'], severity: 'error' },
  'errors.span.NOT_A_SPAN': { i18nKey: 'errors.span.NOT_A_SPAN', params: ['reason'], severity: 'error' },
});

/** השגיאה הבסיסית של content-model — עוברת דרך הקטלוג בזמן יצירה. */
export class ContentModelError extends Error {
  /** המפתח הקטלוגי — משמש גם כמפתח i18n. */
  readonly catalogKey: string;
  /** פרמטרים סדירים להצגה מתורגמת. */
  readonly params: ErrorParams;

  constructor(catalogKey: string, params: ErrorParams, internalMessage: string) {
    const entry = CONTENT_MODEL_ERROR_CATALOG[catalogKey];
    if (entry === undefined) {
      // אכיפה בזמן יצירה: מפתח לא רשום אינו עובר (שלב 12, כלל 1).
      throw new Error(`unregistered content-model error key: ${catalogKey}`);
    }
    super(`${catalogKey}: ${internalMessage}`);
    this.name = 'ContentModelError';
    this.catalogKey = catalogKey;
    this.params = Object.freeze({ ...params });
  }
}

/** האם המפתח רשום בקטלוג (חשוף לבדיקות ולמאמתים). */
export function isRegisteredContentModelErrorKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(CONTENT_MODEL_ERROR_CATALOG, key);
}

/** מספר הקודים הרשומים (לאימותי שלמות). */
export function contentModelErrorCatalogSize(): number {
  return Object.keys(CONTENT_MODEL_ERROR_CATALOG).length;
}
