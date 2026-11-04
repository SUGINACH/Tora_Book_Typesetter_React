/**
 * settings-store.test.ts — בדיקות store ההגדרות (שלב 76; אפיון §13.1, §13.3).
 *
 * מה מוכח כאן: כל הלוגיקה מגיעה מ־@tora/settings-schema (המרשם אמיתי,
 * 257 הגדרות) — אין מימוש מקביל; מפתח לא מוכר ⇐ issue ואינו נכנס ל־draft;
 * ערך לא חוקי ⇐ issue וה־draft לא זז; מפתחות legacy לא ממופים נשמרים
 * ב־unmappedLegacy (לשלב 79) ואינם נזרקים; applyDraft בונה effective
 * עם configHash; presets סבב שמירה/טעינה/מחיקה.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { createMemoryKVStorage, setKVStorage, STORAGE_KEYS } from '../../src/stores/storage.js';
import { settingsRegistry, useSettingsStore } from '../../src/stores/settings-store.js';
import { buildEffectiveSettings } from '@tora/settings-schema';

beforeEach(() => {
  setKVStorage(createMemoryKVStorage());
  useSettingsStore.getState().reset();
  useSettingsStore.getState().deletePreset('מורשת');
});

describe('settings-store — המרשם היחיד', () => {
  test('המרשם נבנה מה־registry המיוצר — 257 הגדרות עם מפתחות פריסה', () => {
    expect(settingsRegistry.byKey.size).toBe(257);
    expect(settingsRegistry.layoutKeys.length).toBeGreaterThan(0);
    expect(settingsRegistry.uiOnlyKeys.length).toBeGreaterThan(0);
    expect(settingsRegistry.byKey.has('auto-dh')).toBe(true);
  });
});

describe('settings-store — draft: קבלה ודחייה', () => {
  test('ערך חוקי נכנס; ערך לא חוקי ⇐ issue וה־draft לא זז', () => {
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    let s = useSettingsStore.getState();
    expect(s.draft['auto-dh']).toBe(true);
    expect(s.issues).toHaveLength(0);
    useSettingsStore.getState().setDraftValue('auto-dh', 123); // boolean בלבד
    s = useSettingsStore.getState();
    expect(s.draft['auto-dh']).toBe(true); // לא הוחלף
    expect(s.issues.some((i) => i.code === 'errors.settings.INVALID_TYPE')).toBe(true);
  });

  test('מפתח לא מוכר ⇐ UNKNOWN_KEY; אינו נכנס ל־draft', () => {
    const before = useSettingsStore.getState().draft;
    useSettingsStore.getState().setDraftValue('no-such-key', 1);
    const s = useSettingsStore.getState();
    expect(s.draft).toBe(before); // אותה הפניה — כלום לא זז
    expect(s.issues.some((i) => i.code === 'errors.settings.UNKNOWN_KEY')).toBe(true);
  });

  test('מחרוזת־מספר legacy נקרינה עם אזהרה מתועדת (COERCED)', () => {
    useSettingsStore.getState().setDraftValue('builder-back-bottom', '18');
    const s = useSettingsStore.getState();
    expect(s.draft['builder-back-bottom']).toBe(18); // number קנוני
    expect(s.issues.some((i) => i.code === 'errors.settings.COERCED_LEGACY_STRING')).toBe(true);
    expect(s.issues.every((i) => i.code === 'errors.settings.COERCED_LEGACY_STRING')).toBe(true); // אזהרה בלבד — לא חסימה
  });

  test('dimension שלילי נדחה; enum לא ידוע נדחה', () => {
    useSettingsStore.getState().setDraftValue('dim-h2-btm-h', '-2em');
    expect(useSettingsStore.getState().draft['dim-h2-btm-h']).toBeUndefined();
    expect(useSettingsStore.getState().issues.some((i) => i.code === 'errors.settings.NEGATIVE_DIMENSION')).toBe(true);
    useSettingsStore.getState().setDraftValue('active-theme-select', 'nope-theme');
    expect(useSettingsStore.getState().issues.some((i) => i.code === 'errors.settings.UNKNOWN_ENUM_VALUE')).toBe(true);
  });
});

describe('settings-store — importObject: חלקי ומתועד', () => {
  test('תערובת: החוקי נכנס, הלא־חוקי נדחה עם issue — לא הכל או כלום', () => {
    const issueCount = useSettingsStore.getState().importObject({ 'auto-dh': true, 'avoid-widows': 'not-a-bool' });
    expect(issueCount).toBeGreaterThan(0);
    const s = useSettingsStore.getState();
    expect(s.draft['auto-dh']).toBe(true);
    expect(s.draft['avoid-widows']).toBeUndefined();
    expect(s.issues.some((i) => i.path.includes('avoid-widows'))).toBe(true);
  });

  test('מפתחות לא מוכרים נשמרים ב־unmappedLegacy — לא נזרקים (שלב 79)', () => {
    useSettingsStore.getState().importObject({ 'legacy-unknown-key': 'value', 'auto-dh': false });
    const s = useSettingsStore.getState();
    expect(s.draft['auto-dh']).toBe(false);
    expect(s.unmappedLegacy['legacy-unknown-key']).toBe('value');
    expect(s.issues.some((i) => i.code === 'errors.settings.UNKNOWN_KEY')).toBe(true);
  });

  test('קלט שאינו אובייקט (מערך/null) ⇐ issue מלא, ה־draft לא זז', () => {
    const before = useSettingsStore.getState().draft;
    useSettingsStore.getState().importObject([1, 2, 3]);
    useSettingsStore.getState().importObject(null);
    const s = useSettingsStore.getState();
    expect(s.draft).toBe(before);
    expect(s.issues.some((i) => i.code === 'errors.settings.INVALID_TYPE')).toBe(true);
  });
});

describe('settings-store — applyDraft: effective ו־configHash', () => {
  test('לפני applyDraft אין effective; אחרי — ערכים אפקטיביים + hash קנוני', () => {
    expect(useSettingsStore.getState().effective).toBeNull();
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    useSettingsStore.getState().applyDraft();
    const s = useSettingsStore.getState();
    expect(s.effective).not.toBeNull();
    expect(s.effective!.values['auto-dh']).toBe(true);
    expect(s.effective!.configHash).toMatch(/^[0-9a-f]{64}$/);
    // ה־hash זהה לחישוב הישיר מהחבילה — ה־store אינו מממש גיבוב משלו
    const direct = buildEffectiveSettings(settingsRegistry, [{ 'auto-dh': true }]);
    expect(s.effective!.configHash).toBe(direct.configHash);
    // ה־hash אינו תלוי במפתחות שאינם פריסה: auto-dh הוא affectsLayout — נבדוק שינוי מפתח ui-only לא משנה... (auto-dh הוא layout) — השוואה מול ui-only
    useSettingsStore.getState().setDraftValue('active-theme-select', 'builtin_1');
    useSettingsStore.getState().applyDraft();
    const withUiOnly = useSettingsStore.getState().effective!;
    expect(withUiOnly.configHash).toBe(direct.configHash); // ui-only אינו ב־hash
  });
});

describe('settings-store — presets', () => {
  test('שמירה/טעינה/מחיקה; טעינה מחליפה draft (לא ממזג); שם ריק נדחה', () => {
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    useSettingsStore.getState().savePreset('מורשת');
    useSettingsStore.getState().setDraftValue('auto-dh', false);
    useSettingsStore.getState().setDraftValue('avoid-orphans', false);
    useSettingsStore.getState().loadPreset('מורשת');
    let s = useSettingsStore.getState();
    expect(s.draft['auto-dh']).toBe(true);
    expect(s.draft['avoid-orphans']).toBeUndefined(); // הוחלף, לא מוזג
    useSettingsStore.getState().deletePreset('מורשת');
    s = useSettingsStore.getState();
    expect(s.presets['מורשת']).toBeUndefined();
    const before = s.presets;
    useSettingsStore.getState().savePreset('   '); // ריק — נדחה
    expect(useSettingsStore.getState().presets).toBe(before);
  });

  test('השמירה כוללת draft+presets+unmappedLegacy במפתח החדש', () => {
    const mem = createMemoryKVStorage();
    setKVStorage(mem);
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    useSettingsStore.getState().importObject({ 'old-key': 'kept' });
    useSettingsStore.getState().savePreset('א');
    const saved = JSON.parse(mem.getItem(STORAGE_KEYS.settings)!);
    expect(saved.draft['auto-dh']).toBe(true);
    expect(saved.unmappedLegacy['old-key']).toBe('kept');
    expect(Object.keys(saved.presets)).toContain('א');
  });
});
