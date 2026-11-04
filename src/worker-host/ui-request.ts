/**
 * ui-request.ts — בניית TypesetRequest מקלט ה־UI (שלב 77; אפיון §6.7, §12).
 *
 * אותם רכיבי inputHash כמו ה־CLI/e2e (tests/e2e-skeleton): מסמך מנותח
 * (content-model), הגדרות אפקטיביות מאומתות (settings-schema), מניפסט
 * נכסים פתור, תקציב חיפוש ברירת מחדל, sourceSha256 וגרסת פרסר — כך
 * שאותו קלט מניב אותו layoutHash בכל host (§17.2#2). הפרסור טהור וזול
 * יחסית — הוא רץ במעטפת; **העימוד עצמו אינו כאן** (§12.1 — typeset
 * בתוך ה־Worker בלבד).
 */
import { parseSourceText } from '@tora/content-model';
import {
  DEFAULT_SEARCH_BUDGET,
  sha256Hex,
  type EffectiveSettings,
  type ResolvedAssetManifest,
  type TypesetRequest,
} from '@tora/layout-api';

/** גרסת הפרסר בזהות ה־CLI/e2e — נכנסת ל־inputHash (§6.7). */
export const UI_PARSER_VERSION = 'content-model@0.1.0' as const;

export interface UiTypesetRequestInput {
  readonly source: string;
  readonly settings: Readonly<EffectiveSettings>;
  readonly assets: ResolvedAssetManifest;
  /** מזהה מסמך יציב (יומן/ביקורת); ברירת מחדל ui. */
  readonly documentId?: string;
}

/** בניית הבקשה — טהורה ודטרמיניסטית; זריקה על קלט לא מנותח. */
export function buildUiTypesetRequest(input: UiTypesetRequestInput): TypesetRequest {
  const parsed = parseSourceText(input.source, { documentId: input.documentId ?? 'ui' });
  const request: TypesetRequest = {
    document: { ...parsed.doc, transforms: parsed.transforms },
    settings: input.settings,
    assets: input.assets,
    trace: 'off',
    budget: DEFAULT_SEARCH_BUDGET,
    sourceSha256: sha256Hex(input.source),
    parserVersion: UI_PARSER_VERSION,
  };
  return request;
}
