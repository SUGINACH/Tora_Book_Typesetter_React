/**
 * errors.ts — קטלוג שגיאות layout-engine (שלב 33).
 *
 * אותו דפוס של שלב 12. הפרות חוזה מסוג typeset עוברות דרך קטלוג
 * layout-api (errors.layoutir.*); כאן רק שגיאות פנימיות של המנוע v0.
 */
export type EngineErrorParamValue = string | number | boolean | null;
export type EngineErrorParams = Readonly<Record<string, EngineErrorParamValue>>;

export interface EngineErrorEntry {
  readonly i18nKey: string;
  readonly params: readonly string[];
  readonly severity: 'fatal' | 'error';
}

export const LAYOUT_ENGINE_ERROR_CATALOG: Readonly<Record<string, EngineErrorEntry>> = Object.freeze({
  'errors.engine.SETTING_INVALID': { i18nKey: 'errors.engine.SETTING_INVALID', params: ['key', 'reason'], severity: 'error' },
  'errors.engine.BODY_FONT_MISSING': { i18nKey: 'errors.engine.BODY_FONT_MISSING', params: ['usage'], severity: 'error' },
  'errors.engine.SHAPING_MISMATCH': { i18nKey: 'errors.engine.SHAPING_MISMATCH', params: ['where'], severity: 'fatal' },
  'errors.engine.BLOCK_ATOM_GAP': { i18nKey: 'errors.engine.BLOCK_ATOM_GAP', params: ['blockId'], severity: 'fatal' },
  'errors.engine.NO_LEGAL_LINE_BREAK': { i18nKey: 'errors.engine.NO_LEGAL_LINE_BREAK', params: ['blockId', 'level'], severity: 'error' },
});

export function isRegisteredEngineErrorKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(LAYOUT_ENGINE_ERROR_CATALOG, key);
}

export class LayoutEngineError extends Error {
  readonly catalogKey: string;
  readonly params: EngineErrorParams;
  constructor(catalogKey: string, params: EngineErrorParams, internalMessage: string) {
    const entry = LAYOUT_ENGINE_ERROR_CATALOG[catalogKey];
    if (entry === undefined) {
      throw new Error(`UNREGISTERED_LAYOUT_ENGINE_ERROR_KEY: ${catalogKey}`);
    }
    super(`${catalogKey}: ${internalMessage}`);
    this.name = 'LayoutEngineError';
    this.catalogKey = catalogKey;
    this.params = params;
  }
}

export function layoutEngineErrorCatalogSize(): number {
  return Object.keys(LAYOUT_ENGINE_ERROR_CATALOG).length;
}
