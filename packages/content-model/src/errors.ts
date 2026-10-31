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
  // ── atoms (שלב 15; מוצאן ב-atoms.ts) ──
  'errors.atom.NOT_AN_ATOM': { i18nKey: 'errors.atom.NOT_AN_ATOM', params: ['reason'], severity: 'error' },
  'errors.atom.INVALID_SPAN': { i18nKey: 'errors.atom.INVALID_SPAN', params: ['reason'], severity: 'error' },
  'errors.atom.INVALID_TEXT': { i18nKey: 'errors.atom.INVALID_TEXT', params: ['reason', 'excerpt'], severity: 'error' },
  'errors.atom.TEXT_SPAN_MISMATCH': { i18nKey: 'errors.atom.TEXT_SPAN_MISMATCH', params: ['textLength', 'spanLength'], severity: 'error' },
  'errors.atom.INVALID_SCRIPT': { i18nKey: 'errors.atom.INVALID_SCRIPT', params: ['script'], severity: 'error' },
  'errors.atom.INVALID_BIDI_LEVEL': { i18nKey: 'errors.atom.INVALID_BIDI_LEVEL', params: ['value'], severity: 'error' },
  'errors.atom.INVALID_BREAK_BEFORE': { i18nKey: 'errors.atom.INVALID_BREAK_BEFORE', params: ['value'], severity: 'error' },
  'errors.atom.INVALID_ORIGIN': { i18nKey: 'errors.atom.INVALID_ORIGIN', params: ['origin'], severity: 'error' },
  'errors.atom.INVALID_ORDINAL': { i18nKey: 'errors.atom.INVALID_ORDINAL', params: ['value'], severity: 'error' },
  'errors.atom.ID_DERIVATION_TOO_LONG': { i18nKey: 'errors.atom.ID_DERIVATION_TOO_LONG', params: ['length'], severity: 'error' },
  'errors.atom.SPLIT_OUT_OF_RANGE': { i18nKey: 'errors.atom.SPLIT_OUT_OF_RANGE', params: ['at', 'length'], severity: 'error' },
  'errors.atom.SPLIT_MID_SURROGATE': { i18nKey: 'errors.atom.SPLIT_MID_SURROGATE', params: ['at'], severity: 'error' },
  'errors.atom.SPLIT_MID_GRAPHEME': { i18nKey: 'errors.atom.SPLIT_MID_GRAPHEME', params: ['at'], severity: 'error' },
  'errors.atom.SPLIT_EMPTY_SPAN': { i18nKey: 'errors.atom.SPLIT_EMPTY_SPAN', params: ['startUtf16'], severity: 'error' },
  'errors.atom.MERGE_NOT_ADJACENT': { i18nKey: 'errors.atom.MERGE_NOT_ADJACENT', params: ['aEnd', 'bStart'], severity: 'error' },
  'errors.atom.MERGE_INCOMPATIBLE_ORIGIN': { i18nKey: 'errors.atom.MERGE_INCOMPATIBLE_ORIGIN', params: ['aOrigin', 'bOrigin'], severity: 'error' },
  'errors.atom.MERGE_INCOMPATIBLE_BIDI': { i18nKey: 'errors.atom.MERGE_INCOMPATIBLE_BIDI', params: ['aBidiLevel', 'bBidiLevel'], severity: 'error' },
  'errors.atom.INVALID_TRANSFORM': { i18nKey: 'errors.atom.INVALID_TRANSFORM', params: ['reason'], severity: 'error' },
  'errors.atom.COVERAGE_INVALID_LENGTH': { i18nKey: 'errors.atom.COVERAGE_INVALID_LENGTH', params: ['expectedLength'], severity: 'error' },
  // ── inline (שלב 16; מוצאן ב-inline.ts) ──
  'errors.inline.NOT_AN_ITEM': { i18nKey: 'errors.inline.NOT_AN_ITEM', params: ['reason'], severity: 'error' },
  'errors.inline.EMPTY_TEXT': { i18nKey: 'errors.inline.EMPTY_TEXT', params: ['count'], severity: 'error' },
  'errors.inline.ATOM_NOT_VALID': { i18nKey: 'errors.inline.ATOM_NOT_VALID', params: ['reason'], severity: 'error' },
  'errors.inline.MIXED_STREAMS': { i18nKey: 'errors.inline.MIXED_STREAMS', params: ['reason'], severity: 'error' },
  'errors.inline.INVALID_ID': { i18nKey: 'errors.inline.INVALID_ID', params: ['which', 'value'], severity: 'error' },
  // ── blocks (שלב 16; מוצאן ב-blocks.ts) ──
  'errors.block.NOT_A_BLOCK': { i18nKey: 'errors.block.NOT_A_BLOCK', params: ['reason'], severity: 'error' },
  'errors.block.INVALID_ROLE': { i18nKey: 'errors.block.INVALID_ROLE', params: ['role'], severity: 'error' },
  'errors.block.INVALID_STYLE_ID': { i18nKey: 'errors.block.INVALID_STYLE_ID', params: ['styleId'], severity: 'error' },
  'errors.block.HEADING_LEVEL_REQUIRED': { i18nKey: 'errors.block.HEADING_LEVEL_REQUIRED', params: ['role'], severity: 'error' },
  'errors.block.HEADING_LEVEL_FORBIDDEN': { i18nKey: 'errors.block.HEADING_LEVEL_FORBIDDEN', params: ['role', 'level'], severity: 'error' },
  'errors.block.INVALID_HEADING_LEVEL': { i18nKey: 'errors.block.INVALID_HEADING_LEVEL', params: ['level'], severity: 'error' },
  'errors.block.INVALID_CHILDREN': { i18nKey: 'errors.block.INVALID_CHILDREN', params: ['reason'], severity: 'error' },
  'errors.block.DUPLICATE_NODE_ID': { i18nKey: 'errors.block.DUPLICATE_NODE_ID', params: ['id', 'path'], severity: 'error' },
  'errors.block.DEPTH_EXCEEDED': { i18nKey: 'errors.block.DEPTH_EXCEEDED', params: ['depth', 'limit'], severity: 'error' },
  'errors.block.INVALID_ORDINAL': { i18nKey: 'errors.block.INVALID_ORDINAL', params: ['value'], severity: 'error' },
  'errors.block.INVALID_ORIGIN': { i18nKey: 'errors.block.INVALID_ORIGIN', params: ['origin'], severity: 'error' },
  'errors.block.ID_DERIVATION_TOO_LONG': { i18nKey: 'errors.block.ID_DERIVATION_TOO_LONG', params: ['length'], severity: 'error' },
  // ── document (שלב 16; מוצאן ב-document.ts) ──
  'errors.document.NOT_A_DOCUMENT': { i18nKey: 'errors.document.NOT_A_DOCUMENT', params: ['reason'], severity: 'error' },
  'errors.document.INVALID_SCHEMA_VERSION': { i18nKey: 'errors.document.INVALID_SCHEMA_VERSION', params: ['version'], severity: 'error' },
  'errors.document.INVALID_DOCUMENT_ID': { i18nKey: 'errors.document.INVALID_DOCUMENT_ID', params: ['documentId'], severity: 'error' },
  'errors.document.INVALID_METADATA': { i18nKey: 'errors.document.INVALID_METADATA', params: ['reason', 'key'], severity: 'error' },
  'errors.document.DUPLICATE_METADATA_KEY': { i18nKey: 'errors.document.DUPLICATE_METADATA_KEY', params: ['key'], severity: 'error' },
  'errors.document.INVALID_PART': { i18nKey: 'errors.document.INVALID_PART', params: ['reason', 'partId'], severity: 'error' },
  'errors.document.INVALID_SIMAN': { i18nKey: 'errors.document.INVALID_SIMAN', params: ['reason'], severity: 'error' },
  'errors.document.INVALID_SIMAN_NUMBER': { i18nKey: 'errors.document.INVALID_SIMAN_NUMBER', params: ['simanNumber'], severity: 'error' },
  'errors.document.INVALID_SHAAR_DESIGN': { i18nKey: 'errors.document.INVALID_SHAAR_DESIGN', params: ['shaarDesign'], severity: 'error' },
  'errors.document.INVALID_NOTE': { i18nKey: 'errors.document.INVALID_NOTE', params: ['reason', 'kind'], severity: 'error' },
  'errors.document.INVALID_NOTE_BLOCK_ROLE': { i18nKey: 'errors.document.INVALID_NOTE_BLOCK_ROLE', params: ['noteId', 'role'], severity: 'error' },
  'errors.document.DUPLICATE_NOTE_ID': { i18nKey: 'errors.document.DUPLICATE_NOTE_ID', params: ['noteId'], severity: 'error' },
  'errors.document.UNRESOLVED_NOTE_REFERENCE': { i18nKey: 'errors.document.UNRESOLVED_NOTE_REFERENCE', params: ['noteId'], severity: 'error' },
  'errors.document.INVALID_SOURCE_HASH': { i18nKey: 'errors.document.INVALID_SOURCE_HASH', params: ['sourceHash'], severity: 'error' },
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
