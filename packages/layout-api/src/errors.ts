/**
 * errors.ts — קטלוג שגיאות layout-api (שלב 31).
 *
 * אותו דפוס מחייב שנקבע בשלב 12 ונהוג ב-content-model/audit-core (אפיון §6.3,
 * §16, §12.1): אין שגיאה ללא קוד קטלוגי; אין הצגת error.message גולמי; הקטלוג
 * סטטי וקפוא. הקטלוג של measurement-api אינו מיובא — לכל חבילה קטלוג משלה
 * (תקדים content-model; גרף §5 אוסר תלות צולבת שאינה מוגדרת).
 */
import type { ErrorParamValue } from '@tora/content-model';

export type LayoutApiErrorParamValue = ErrorParamValue;
export type LayoutApiErrorParams = Readonly<Record<string, LayoutApiErrorParamValue>>;

export interface LayoutApiErrorEntry {
  readonly i18nKey: string;
  readonly params: readonly string[];
  readonly severity: 'fatal' | 'error';
}

/** קטלוג שגיאות layout-api — סטטי וקפוא. */
export const LAYOUT_API_ERROR_CATALOG: Readonly<Record<string, LayoutApiErrorEntry>> = Object.freeze({
  // ── IR (שלב 31; מוצאן ב-ir.ts / ir-serialize.ts) ──
  'errors.layoutir.INVALID_DOCUMENT': { i18nKey: 'errors.layoutir.INVALID_DOCUMENT', params: ['issues'], severity: 'error' },
  'errors.layoutir.INVALID_SERIALIZATION': { i18nKey: 'errors.layoutir.INVALID_SERIALIZATION', params: ['reason'], severity: 'error' },
  // ── חוזה typeset (שלב 32; מוצאם ב-typeset.ts / run-manifest.ts / decision-ledger.ts) ──
  'errors.layoutir.INVALID_REQUEST': { i18nKey: 'errors.layoutir.INVALID_REQUEST', params: ['issues'], severity: 'error' },
  'errors.layoutir.INVALID_MANIFEST': { i18nKey: 'errors.layoutir.INVALID_MANIFEST', params: ['issues'], severity: 'error' },
  'errors.layoutir.INVALID_LEDGER': { i18nKey: 'errors.layoutir.INVALID_LEDGER', params: ['issues'], severity: 'error' },
  'errors.layoutir.UNREGISTERED_FALLBACK': { i18nKey: 'errors.layoutir.UNREGISTERED_FALLBACK', params: ['code'], severity: 'fatal' },
  'errors.layoutir.INVALID_TRACE_LEVEL': { i18nKey: 'errors.layoutir.INVALID_TRACE_LEVEL', params: ['value'], severity: 'error' },
  'errors.layoutir.INVALID_BUDGET': { i18nKey: 'errors.layoutir.INVALID_BUDGET', params: ['issues'], severity: 'error' },
});

export function isRegisteredLayoutApiErrorKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(LAYOUT_API_ERROR_CATALOG, key);
}

/** שגיאת layout-api — עוברת דרך הקטלוג בזמן יצירה. */
export class LayoutApiError extends Error {
  readonly catalogKey: string;
  readonly params: LayoutApiErrorParams;
  constructor(catalogKey: string, params: LayoutApiErrorParams, internalMessage: string) {
    const entry = LAYOUT_API_ERROR_CATALOG[catalogKey];
    if (entry === undefined) {
      throw new Error(`UNREGISTERED_LAYOUT_API_ERROR_KEY: ${catalogKey}`);
    }
    super(`${catalogKey}: ${internalMessage}`);
    this.name = 'LayoutApiError';
    this.catalogKey = catalogKey;
    this.params = params;
  }
}

/** פונקציית עזר: קטלוג קיים? (למאמתים). */
export function layoutApiErrorCatalogSize(): number {
  return Object.keys(LAYOUT_API_ERROR_CATALOG).length;
}
