/**
 * errors.ts — קטלוג שגיאות settings-schema (שלב 30).
 * פטרן שלב 12/14: אין שגיאה ללא קוד קטלוגי ומפתח i18n; קטלוג סטטי וקפוא.
 */

/** פרמטרים להצגת שגיאה — ערכים סדירים בלבד. */
export type ErrorParamValue = string | number | boolean | null;
export type ErrorParams = Readonly<Record<string, ErrorParamValue>>;

export interface ErrorCatalogEntry {
  readonly i18nKey: string;
  readonly params: readonly string[];
  readonly severity: 'fatal' | 'error' | 'warning';
}

export const SETTINGS_ERROR_CATALOG: Readonly<Record<string, ErrorCatalogEntry>> = Object.freeze({
  'errors.settings.UNKNOWN_KEY': { i18nKey: 'errors.settings.UNKNOWN_KEY', params: ['key', 'path'], severity: 'error' },
  'errors.settings.INVALID_VALUE': { i18nKey: 'errors.settings.INVALID_VALUE', params: ['key', 'value', 'expected'], severity: 'error' },
  'errors.settings.INVALID_TYPE': { i18nKey: 'errors.settings.INVALID_TYPE', params: ['key', 'value', 'type'], severity: 'error' },
  'errors.settings.UNKNOWN_ENUM_VALUE': { i18nKey: 'errors.settings.UNKNOWN_ENUM_VALUE', params: ['key', 'value', 'allowed'], severity: 'error' },
  'errors.settings.UNSUPPORTED_TYPE': { i18nKey: 'errors.settings.UNSUPPORTED_TYPE', params: ['type'], severity: 'fatal' },
  'errors.settings.NON_FINITE_NUMBER': { i18nKey: 'errors.settings.NON_FINITE_NUMBER', params: ['key', 'value'], severity: 'error' },
  'errors.settings.NEGATIVE_DIMENSION': { i18nKey: 'errors.settings.NEGATIVE_DIMENSION', params: ['key', 'value'], severity: 'error' },
  'errors.settings.MISSING_VALUE': { i18nKey: 'errors.settings.MISSING_VALUE', params: ['key'], severity: 'error' },
  'errors.settings.REGISTRY_INVALID': { i18nKey: 'errors.settings.REGISTRY_INVALID', params: ['reason'], severity: 'fatal' },
  'errors.settings.MIGRATION_FAILED': { i18nKey: 'errors.settings.MIGRATION_FAILED', params: ['fromVersion', 'toVersion', 'reason'], severity: 'fatal' },
  'errors.settings.UNDEFINED_VALUE': { i18nKey: 'errors.settings.UNDEFINED_VALUE', params: ['path'], severity: 'fatal' },
  'errors.settings.INVALID_HASH_LENGTH': { i18nKey: 'errors.settings.INVALID_HASH_LENGTH', params: ['len'], severity: 'fatal' },
  'errors.settings.COERCED_LEGACY_STRING': { i18nKey: 'errors.settings.COERCED_LEGACY_STRING', params: ['key', 'raw', 'value'], severity: 'warning' },
});

export class SettingsError extends Error {
  constructor(
    public readonly code: string,
    public readonly params: ErrorParams,
    public readonly path: string,
  ) {
    super(`${code} at ${path}`);
    if (SETTINGS_ERROR_CATALOG[code] === undefined) {
      throw new Error(`unregistered error code: ${code}`);
    }
    this.name = 'SettingsError';
  }
}

export const settingsErrorCatalogSize = Object.keys(SETTINGS_ERROR_CATALOG).length;
export const isRegisteredSettingsErrorKey = (key: string): boolean => key in SETTINGS_ERROR_CATALOG;
