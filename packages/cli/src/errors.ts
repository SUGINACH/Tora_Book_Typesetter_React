/**
 * errors.ts — קטלוג שגיאות ה־CLI (שלב 34).
 *
 * אותו דפוס של שלב 12/33: כל שגיאה נושאת מפתח קטלוגי + פרמטרים (אין
 * הצגת message גולמי למשתמש; §12.1) וקוד יציאה מתועד. המפתחות רשומים
 * גם ב־docs/i18n/error-keys.md.
 */
export type CliErrorParamValue = string | number | boolean | null;
export type CliErrorParams = Readonly<Record<string, CliErrorParamValue>>;

export interface CliErrorEntry {
  readonly i18nKey: string;
  readonly params: readonly string[];
  readonly severity: 'fatal' | 'error';
}

export const CLI_ERROR_CATALOG: Readonly<Record<string, CliErrorEntry>> = Object.freeze({
  'errors.cli.INPUT_UNREADABLE': { i18nKey: 'errors.cli.INPUT_UNREADABLE', params: ['path', 'reason'], severity: 'fatal' },
  'errors.cli.INPUT_INVALID': { i18nKey: 'errors.cli.INPUT_INVALID', params: ['path', 'reason'], severity: 'fatal' },
  'errors.cli.SETTINGS_UNREADABLE': { i18nKey: 'errors.cli.SETTINGS_UNREADABLE', params: ['path', 'reason'], severity: 'fatal' },
  'errors.cli.SETTINGS_INVALID': { i18nKey: 'errors.cli.SETTINGS_INVALID', params: ['path', 'reason'], severity: 'fatal' },
  'errors.cli.REGISTRY_UNREADABLE': { i18nKey: 'errors.cli.REGISTRY_UNREADABLE', params: ['path', 'reason'], severity: 'fatal' },
  'errors.cli.FONTS_MANIFEST_UNREADABLE': { i18nKey: 'errors.cli.FONTS_MANIFEST_UNREADABLE', params: ['path', 'reason'], severity: 'fatal' },
  'errors.cli.FONTS_MANIFEST_INVALID': { i18nKey: 'errors.cli.FONTS_MANIFEST_INVALID', params: ['path', 'reason'], severity: 'fatal' },
  'errors.cli.ASSETS_MANIFEST_INVALID': { i18nKey: 'errors.cli.ASSETS_MANIFEST_INVALID', params: ['path', 'reason'], severity: 'fatal' },
  'errors.cli.FONT_NOT_FOUND': { i18nKey: 'errors.cli.FONT_NOT_FOUND', params: ['spec'], severity: 'fatal' },
  'errors.cli.FONT_LOAD_FAILED': { i18nKey: 'errors.cli.FONT_LOAD_FAILED', params: ['file', 'reason'], severity: 'fatal' },
  'errors.cli.PROVIDER_FAILED': { i18nKey: 'errors.cli.PROVIDER_FAILED', params: ['reason'], severity: 'fatal' },
  'errors.cli.ENGINE_FAILED': { i18nKey: 'errors.cli.ENGINE_FAILED', params: ['code', 'reason'], severity: 'error' },
  'errors.cli.REPEAT_MISMATCH': { i18nKey: 'errors.cli.REPEAT_MISMATCH', params: ['run', 'expected', 'actual'], severity: 'fatal' },
  'errors.cli.OUTPUT_WRITE_FAILED': { i18nKey: 'errors.cli.OUTPUT_WRITE_FAILED', params: ['path', 'reason'], severity: 'fatal' },
  'errors.cli.AUDIT_FINDINGS': { i18nKey: 'errors.cli.AUDIT_FINDINGS', params: ['high'], severity: 'error' },
  'errors.cli.ENGINE_LEGACY_LOCKED': { i18nKey: 'errors.cli.ENGINE_LEGACY_LOCKED', params: ['baseline'], severity: 'fatal' },
});

export function isRegisteredCliErrorKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(CLI_ERROR_CATALOG, key);
}

/** שגיאת CLI — נושאת קוד יציאה, מפתח קטלוגי ופרמטרים; הודעת הפנים ללוג בלבד. */
export class CliError extends Error {
  readonly exitCode: number;
  readonly catalogKey: string;
  readonly params: CliErrorParams;
  constructor(exitCode: number, catalogKey: string, params: CliErrorParams, internalMessage: string) {
    super(internalMessage);
    this.name = 'CliError';
    this.exitCode = exitCode;
    this.catalogKey = catalogKey;
    this.params = params;
  }
}
