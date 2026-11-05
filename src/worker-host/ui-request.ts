/**
 * ui-request.ts — בניית TypesetRequest מקלט ה־UI (שלב 77; אפיון §6.7, §12).
 *
 * אותם רכיבי inputHash כמו ה־CLI/e2e (tests/e2e-skeleton): מסמך מנותח
 * (content-model), הגדרות אפקטיביות מאומתות (settings-schema), מניפסט
 * נכסים פתור, תקציב חיפוש ברירת מחדל, sourceSha256 וגרסת פרסר — כך
 * שאותו קלט מניב אותו layoutHash בכל host (§17.2#2). הפרסור טהור ורץ
 * במעטפת; מסמך קנוני גדול לוקח שניות אחדות — לכן שלב 80 מזריק את
 * תוצאת הפרסור מניתוח הקלט (פרסור יחיד); **העימוד עצמו אינו כאן**
 * (§12.1 — typeset בתוך ה־Worker בלבד).
 */
import { parseSourceText, type ParseResult } from '@tora/content-model';
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
  /**
   * תוצאת פרסור קיימת של אותו מקור בדיוק (שלב 80) — פרסור יחיד: מפת
   * שגיאות הקלט מנתחת את המקור לפני הריצה ומעבירה את אותה תוצאה;
   * המסמך הקנוני (3.4MB) לוקח ~3 שניות לפרסור — פעמיים זה בזבוז
   * מוחשי. אורך המקור נבדק מול התוצאה; אי-התאמה ⇐ זריקה (חוזה).
   */
  readonly parsed?: ParseResult;
}

/** בניית הבקשה — טהורה ודטרמיניסטית; זריקה על קלט לא מנותח. */
export function buildUiTypesetRequest(input: UiTypesetRequestInput): TypesetRequest {
  if (input.parsed !== undefined) {
    if (input.parsed.doc.sourceLength !== input.source.length) {
      throw new Error('parsed/source mismatch: injected ParseResult does not belong to the given source');
    }
  }
  const parsed = input.parsed ?? parseSourceText(input.source, { documentId: input.documentId ?? 'ui' });
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
