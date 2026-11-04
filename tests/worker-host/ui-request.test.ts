/**
 * ui-request.test.ts — בדיקות בניית הבקשה מקלט ה־UI (שלב 77).
 *
 * מה מוכח כאן: הבקשה נושאת בדיוק את רכיבי ה־inputHash של ה־CLI/e2e
 * (§6.7, §17.2#2) — מסמך מנותח, הגדרות אפקטיביות, נכסים, תקציב ברירת
 * מחדל, sourceSha256 וגרסת פרסר; דטרמיניזם מלא — אותו קלט ⇐ אותו
 * inputHash; מקור שונה ⇐ hash שונה.
 */
import { describe, expect, test } from 'vitest';
import { buildUiTypesetRequest, UI_PARSER_VERSION } from '../../src/worker-host/ui-request.js';
import { expectedInputHashOf } from '../../src/worker-host/worker-client.js';
import { buildEffectiveSettings, buildSettingRegistry } from '@tora/settings-schema';
import { DEFAULT_SEARCH_BUDGET, sha256Hex, type ResolvedAssetManifest } from '@tora/layout-api';
import type { FontFaceKey } from '@tora/measurement-api';
import registryJson from '@tora/settings-schema/registry.json';

const registry = buildSettingRegistry(registryJson as unknown as Parameters<typeof buildSettingRegistry>[0]);
const settings = buildEffectiveSettings(registry, []);

const FONT_KEY: FontFaceKey = Object.freeze({
  fontId: 'font:v1|test',
  contentSha256: 'a'.repeat(64),
  family: 'Test',
  weight: 400,
  style: 'normal',
});

const ASSETS: ResolvedAssetManifest = {
  schemaVersion: 1,
  fonts: [
    { usage: 'body', font: FONT_KEY },
    { usage: 'note-body', font: FONT_KEY },
    { usage: 'heading', font: FONT_KEY },
    { usage: 'note-marker', font: FONT_KEY },
  ],
  fontsManifestSha256: 'a'.repeat(64),
  assetsManifestSha256: '0'.repeat(64),
};

const SOURCE = `שם הספר - ספר בדיקת בקשה
כותרת 1 מספר 1 - פרק
פסקה ראשונה עם ניקוד והערה [הערה] וטקסט ממשיך.
`;

describe('ui-request — רכיבי inputHash זהים ל־CLI', () => {
  test('מבנה הבקשה: מסמך, הגדרות, נכסים, trace, תקציב, hash מקור, גרסת פרסר', () => {
    const request = buildUiTypesetRequest({ source: SOURCE, settings, assets: ASSETS });
    expect(request.settings).toBe(settings); // אותו אובייקט אפקטיבי — לא העתק
    expect(request.assets).toBe(ASSETS);
    expect(request.trace).toBe('off');
    expect(request.budget).toBe(DEFAULT_SEARCH_BUDGET);
    expect(request.sourceSha256).toBe(sha256Hex(SOURCE));
    expect(request.parserVersion).toBe(UI_PARSER_VERSION);
    expect(UI_PARSER_VERSION).toBe('content-model@0.1.0');
    // המסמך נפרס: יש חלקים והפניות הערות (content-model)
    expect(Array.isArray((request.document as { parts?: unknown }).parts)).toBe(true);
  });

  test('דטרמיניזן מלא — אותו קלט ⇐ אותו inputHash; מקור אחר ⇐ hash אחר', () => {
    const a1 = buildUiTypesetRequest({ source: SOURCE, settings, assets: ASSETS });
    const a2 = buildUiTypesetRequest({ source: SOURCE, settings, assets: ASSETS });
    expect(expectedInputHashOf(a1)).toBe(expectedInputHashOf(a2));
    const other = buildUiTypesetRequest({
      source: `${SOURCE}ושורה נוספת שונה.\n`,
      settings,
      assets: ASSETS,
    });
    expect(expectedInputHashOf(other)).not.toBe(expectedInputHashOf(a1));
    // הגדרות אחרות ⇐ hash אחר (ההגדרות חלק מהזהות)
    const otherSettings = buildEffectiveSettings(registry, [{ 'auto-dh': true }]);
    const s2 = buildUiTypesetRequest({ source: SOURCE, settings: otherSettings, assets: ASSETS });
    expect(expectedInputHashOf(s2)).not.toBe(expectedInputHashOf(a1));
  });

  test('documentId מוזר: ברירת מחדל ui; שם קובץ עובר ולא משנה את ה־hash', () => {
    const def = buildUiTypesetRequest({ source: SOURCE, settings, assets: ASSETS });
    const named = buildUiTypesetRequest({ source: SOURCE, settings, assets: ASSETS, documentId: 'sefer.txt' });
    // המזהה אינו חלק מהזהות הקנונית (§17.2#3 — שם קובץ אינו משנה תוצאה)
    expect(expectedInputHashOf(named)).toBe(expectedInputHashOf(def));
  });

  test('ערכי ברירת מחדל של המרשם — הגדרות אפקטיביות מלאות עם configHash', () => {
    expect(Object.keys(settings.values).length).toBeGreaterThan(200);
    expect(settings.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(settings.enginePolicyId).toBe('torah-v1');
  });
});
