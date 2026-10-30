/**
 * errors.ts — קטלוג קודי שגיאה, בסיס EngineError ו־ValidationIssue (שלב 12).
 *
 * כללים מחייבים (אפיון §6.3, §16, §12.1 · תכנית שלב 12):
 *   1. אין שגיאה ללא קוד קטלוגי ומפתח i18n — נאכף בזמן יצירת השגיאה (בדיקת רישום).
 *   2. אין הצגת error.message גולמי למשתמש; מציגים מפתח+params.
 *      המחרוזת הפנימית מיועדת ללוג פיתוח בלבד.
 *   3. הקטלוג סטטי ודטרמיניסטי — כל הקודים רשומים מראש.
 *   4. CLI/Tauri/Worker משתמשים באותו קטלוג (אינו תלוי React).
 */

/** פרמטרים להצגת שגיאה — ערכים סדירים בלבד. */
export type ErrorParamValue = string | number | boolean | null;
export type ErrorParams = Readonly<Record<string, ErrorParamValue>>;

/** רשומת קטלוג: מפתח i18n יציב, פרמטרים וחומרה. */
export interface ErrorCatalogEntry {
  /** מפתח i18n יציב — למשל errors.font.MISSING_GLYPH (משמש גם כמזהה הקטלוגי). */
  readonly i18nKey: string;
  /** שמות הפרמטרים שההודעה המתורגמת מצפה להם. */
  readonly params: readonly string[];
  readonly severity: 'fatal' | 'error' | 'warning';
}

/** קטלוג השגיאות — סטטי וקפוא. */
export const ERROR_CATALOG: Readonly<Record<string, ErrorCatalogEntry>> = Object.freeze({
  // ── יסודות (שלב 12) ──
  'errors.font.MISSING_FONT': { i18nKey: 'errors.font.MISSING_FONT', params: ['family', 'file'], severity: 'fatal' },
  'errors.font.FONT_HASH_MISMATCH': { i18nKey: 'errors.font.FONT_HASH_MISMATCH', params: ['file', 'expectedSha256', 'actualSha256'], severity: 'fatal' },
  'errors.measurement.MEASUREMENT_UNAVAILABLE': { i18nKey: 'errors.measurement.MEASUREMENT_UNAVAILABLE', params: ['provider', 'reason'], severity: 'fatal' },
  // ── יחידות (ADR-001; מוצאן ב-units.ts) ──
  'errors.units.UNSAFE_INTEGER': { i18nKey: 'errors.units.UNSAFE_INTEGER', params: ['what', 'value'], severity: 'error' },
  'errors.units.INVALID_DENOMINATOR': { i18nKey: 'errors.units.INVALID_DENOMINATOR', params: ['d'], severity: 'error' },
  'errors.units.NON_FINITE_MM': { i18nKey: 'errors.units.NON_FINITE_MM', params: ['mm'], severity: 'error' },
  'errors.units.NON_FINITE_PT': { i18nKey: 'errors.units.NON_FINITE_PT', params: ['pt'], severity: 'error' },
  'errors.units.INVALID_UNITS_PER_EM': { i18nKey: 'errors.units.INVALID_UNITS_PER_EM', params: ['unitsPerEm'], severity: 'error' },
  'errors.units.UNSAFE_ADD': { i18nKey: 'errors.units.UNSAFE_ADD', params: ['a', 'b', 'ctx'], severity: 'error' },
  'errors.units.UNSAFE_SUB': { i18nKey: 'errors.units.UNSAFE_SUB', params: ['a', 'b', 'ctx'], severity: 'error' },
  'errors.units.UNSAFE_MUL': { i18nKey: 'errors.units.UNSAFE_MUL', params: ['a', 'b', 'ctx'], severity: 'error' },
  'errors.units.NON_FINITE_COST': { i18nKey: 'errors.units.NON_FINITE_COST', params: ['value', 'ctx'], severity: 'error' },
  // ── גיבוב קנוני (ADR-002; מוצאן ב-canonical-hash) ──
  'errors.hash.UNSUPPORTED_TYPE': { i18nKey: 'errors.hash.UNSUPPORTED_TYPE', params: ['type'], severity: 'error' },
  'errors.hash.NON_FINITE_NUMBER': { i18nKey: 'errors.hash.NON_FINITE_NUMBER', params: ['value'], severity: 'error' },
  'errors.hash.INVALID_LENGTH': { i18nKey: 'errors.hash.INVALID_LENGTH', params: ['len'], severity: 'error' },
});

/** בדיקת רישום בקטלוג (ליבה פנימית + בדיקות). */
export function isRegisteredErrorKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(ERROR_CATALOG, key);
}

/**
 * בסיס כל שגיאות הליבה. ההודעה הפנימית (message) מיועדת ללוג פיתוח בלבד —
 * למשתמש מציגים את המפתח הקטלוגי והפרמטרים דרך i18n (אפיון §16).
 */
export class EngineError extends Error {
  /** המפתח הקטלוגי היציב — למשל errors.font.MISSING_GLYPH. */
  readonly catalogKey: string;
  /** פרמטרים להצגה מתורגמת. */
  readonly params: ErrorParams;

  constructor(catalogKey: string, params: ErrorParams = {}, cause?: unknown) {
    super(`[${catalogKey}] ${JSON.stringify(params)}`);
    this.name = 'EngineError';
    this.catalogKey = catalogKey;
    this.params = params;
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
    if (!isRegisteredErrorKey(catalogKey)) {
      // אכיפה בזמן ריצה: אין שגיאה ללא קוד קטלוגי (שער שלב 12)
      throw new Error(`[errors.catalog] UNREGISTERED_ERROR_KEY: ${catalogKey}`);
    }
  }
}

/**
 * ValidationIssue — ממצא אימות משותף לכל החבילות (הגדרות, קלט, מסמך).
 * אינו חריגה אלא דיווח: כמה בעיות בו־זמנית, עם מיקום.
 */
export interface ValidationIssue {
  /** מפתח קטלוגי/i18n יציב. */
  readonly key: string;
  readonly severity: 'error' | 'warning';
  readonly params: ErrorParams;
  /** מיקום — מפתח הגדרה, נתיב במסמך וכדומה. */
  readonly path?: string;
  /** פירוט טכני ללוג פיתוח בלבד — לא לתצוגת משתמש. */
  readonly devNote?: string;
}
