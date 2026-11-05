/**
 * settings-store.test.ts — בדיקות store ההגדרות (שלב 76; אפיון §13.1, §13.3)
 * + מסלול קובצי הגדרות: מיגרציות, ייבוא וייצוא (שלב 79; אפיון §6.3, §18-M9).
 *
 * מה מוכח כאן: כל הלוגיקה מגיעה מ־@tora/settings-schema (המרשם אמיתי,
 * 257 הגדרות) — אין מימוש מקביל; מפתח לא מוכר ⇐ issue ואינו נכנס ל־draft;
 * ערך לא חוקי ⇐ issue וה־draft לא זז; מפתחות legacy לא ממופים נשמרים
 * ב־unmappedLegacy ואינם נזרקים; applyDraft בונה effective עם configHash;
 * presets סבב שמירה/טעינה/מחיקה.
 *
 * שלב 79 — שער השלב ("כל קובץ הגדרות ישן נטען או נדחה עם הסבר מדויק"):
 * כל ארבעת קובצי הבייסליין (ברירת המחדל + שלוש הערכות) נטענים במלואם
 * ללא דחיות חוסמות; הייצוא עובר הלוך־ושוב עם אותו configHash; גרסה
 * עתידית נדחית ב־MIGRATION_FAILED מדויק (קוד+path+פרמטרים) בלי טעינה
 * חלקית; ערך NaN/שלילי/מפתח לא מוכר נכשלים לפני תחילת עימוד.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { createMemoryKVStorage, setKVStorage, STORAGE_KEYS } from '../../src/stores/storage.js';
import { settingsRegistry, useSettingsStore } from '../../src/stores/settings-store.js';
import { buildEffectiveSettings } from '@tora/settings-schema';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const asset = (name: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../assets/settings/${name}`, import.meta.url)), 'utf8'));

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

describe('settings-store — שלב 79: קובצי הגדרות, מיגרציות וייצוא', () => {
  test('קובץ ברירת המחדל של התוכנה הישנה נטען במלואו — 248 מפתחות, אפס דחיות', () => {
    const file = asset('default_settings.json') as Record<string, unknown>;
    const summary = useSettingsStore.getState().importSettingsFile(file);
    expect(summary.loaded).toBe(248);
    const blocking = summary.issues.filter((i) => i.code !== 'errors.settings.COERCED_LEGACY_STRING');
    expect(blocking).toHaveLength(0); // שער: נטען — לא נדחה
    const s = useSettingsStore.getState();
    expect(Object.keys(s.draft)).toHaveLength(248);
    expect(Object.keys(s.unmappedLegacy)).toHaveLength(0); // כל מפתחות המורשת ממופים במרשם
    // המרות מתועדות (מחרוזות־מספר legacy) — אזהרה בלבד
    expect(summary.issues.some((i) => i.code === 'errors.settings.COERCED_LEGACY_STRING')).toBe(true);
    // ה־configHash זהה לחישוב ישיר מהחבילה עם אותה שכבה — אין מימוש מקביל
    useSettingsStore.getState().applyDraft();
    const after = useSettingsStore.getState();
    const direct = buildEffectiveSettings(settingsRegistry, [after.draft]);
    expect(after.effective!.configHash).toBe(direct.configHash);
  });

  test('שלוש הערכות הבייסליין (פרשנות/קונטרס/תלמוד) נטענות במלואן — ונבדלות זו מזו', () => {
    const hashes: string[] = [];
    for (const name of ['פרשנות', 'קונטרס', 'תלמוד']) {
      useSettingsStore.getState().reset();
      const file = asset(`setting_sets/${name}.json`) as Record<string, unknown>;
      const summary = useSettingsStore.getState().importSettingsFile(file);
      expect(summary.loaded).toBe(249);
      expect(summary.issues.filter((i) => i.code !== 'errors.settings.COERCED_LEGACY_STRING')).toHaveLength(0);
      useSettingsStore.getState().applyDraft();
      hashes.push(useSettingsStore.getState().effective!.configHash);
    }
    expect(new Set(hashes).size).toBe(3); // שלוש ערכות שונות — לא אותה תוצאה בטעות
  });

  test('הקובץ מחליף את ה־draft — לא ממזג עם מה שהיה קודם', () => {
    useSettingsStore.getState().setDraftValue('auto-dh', false);
    const file = asset('default_settings.json') as Record<string, unknown>;
    useSettingsStore.getState().importSettingsFile(file);
    const s = useSettingsStore.getState();
    // ברירת המחדל של הקובץ גוברת על העריכה הקודמת — תמונת מצב מלאה
    expect(s.draft['auto-dh']).toBe(file['auto-dh']);
    expect(Object.keys(s.draft)).toHaveLength(248);
  });

  test('ייצוא ← ייבוא הלוך־ושוב: אותו configHash; המעטפת מזוהה ודטרמיניסטית', () => {
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    useSettingsStore.getState().setDraftValue('avoid-orphans', false);
    useSettingsStore.getState().applyDraft();
    const exported = useSettingsStore.getState().exportSettingsFile();
    expect(exported).not.toBeNull();
    expect(exported!.$format).toBe('tora-settings');
    expect(exported!.schemaVersion).toBe(1);
    expect(Object.keys(exported!.values)).toHaveLength(257); // תמונת מצב מלאה מה-effective
    expect(Object.keys(exported!.values)).toEqual([...Object.keys(exported!.values)].sort()); // ממוין
    const hashBefore = useSettingsStore.getState().effective!.configHash;

    // סביבה נקייה — הייצוא נטען כקובץ ומשחזר בדיוק את אותו מצב
    useSettingsStore.getState().reset();
    const summary = useSettingsStore.getState().importSettingsFile(JSON.parse(JSON.stringify(exported)));
    expect(summary.loaded).toBe(257);
    expect(summary.issues).toHaveLength(0); // ערכים קנוניים — אפילו ללא אזהרות המרה
    useSettingsStore.getState().applyDraft();
    expect(useSettingsStore.getState().effective!.configHash).toBe(hashBefore);
  });

  test('גרסה עתידית (v2) בלי צעד מיגרציה ⇐ MIGRATION_FAILED מדויק, כלום לא נטען', () => {
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    const before = useSettingsStore.getState().draft;
    const summary = useSettingsStore.getState().importSettingsFile({
      $format: 'tora-settings',
      schemaVersion: 2,
      values: { 'auto-dh': false },
    });
    expect(summary.loaded).toBe(0);
    expect(summary.issues).toHaveLength(1);
    const issue = summary.issues[0]!;
    expect(issue.code).toBe('errors.settings.MIGRATION_FAILED');
    expect(issue.path).toBe('/settings/migration');
    expect(issue.params.fromVersion).toBe(2);
    expect(useSettingsStore.getState().draft).toBe(before); // אותה הפניה — כלום לא זז
  });

  test('מעטפת מושחתת ⇐ INVALID_TYPE ב־/import/file, כלום לא נטען', () => {
    const before = useSettingsStore.getState().draft;
    for (const bad of [
      { $format: 'tora-settings', schemaVersion: 1, values: 'not-an-object' },
      { $format: 'tora-settings', schemaVersion: 'x', values: {} },
      { $format: 'tora-settings', values: {} },
    ]) {
      const summary = useSettingsStore.getState().importSettingsFile(bad);
      expect(summary.loaded).toBe(0);
      expect(summary.issues.some((i) => i.code === 'errors.settings.INVALID_TYPE' && i.path === '/import/file')).toBe(true);
    }
    expect(useSettingsStore.getState().draft).toBe(before);
  });

  test('קלט שאינו אובייקט (מחרוזת/מספר/מערך) ⇐ INVALID_TYPE, ה־draft לא זז', () => {
    const before = useSettingsStore.getState().draft;
    for (const bad of ['text', 42, [1, 2]]) {
      const summary = useSettingsStore.getState().importSettingsFile(bad);
      expect(summary.loaded).toBe(0);
      expect(summary.issues.some((i) => i.code === 'errors.settings.INVALID_TYPE')).toBe(true);
    }
    expect(useSettingsStore.getState().draft).toBe(before);
  });

  test('מפתח זר בקובץ ⇐ unmappedLegacy (מוחלף, לא הצטברות) + UNKNOWN_KEY עם path', () => {
    useSettingsStore.getState().importObject({ 'old-stray': 'first' });
    const summary = useSettingsStore.getState().importSettingsFile({ 'stray-key': 'x', 'auto-dh': false });
    expect(summary.loaded).toBe(1);
    expect(summary.issues.some((i) => i.code === 'errors.settings.UNKNOWN_KEY' && i.path.includes('stray-key'))).toBe(true);
    const s = useSettingsStore.getState();
    expect(s.draft['auto-dh']).toBe(false);
    expect(s.unmappedLegacy['stray-key']).toBe('x'); // נשמר — הסבר מדויק, לא השמטה
    expect(s.unmappedLegacy['old-stray']).toBeUndefined(); // הקובץ מחליף, לא מצטבר
  });

  test('NaN / מידה שלילית / מפתח לא מוכר נכשלים לפני תחילת עימוד — קוד ו־path, הערך אינו ב־draft', () => {
    // NaN (מספר בשדה number — כמו קלט ריק בטופס)
    let summary = useSettingsStore.getState().importSettingsFile({ 'builder-back-bottom': Number.NaN });
    expect(summary.loaded).toBe(0);
    expect(summary.issues.some((i) => i.code === 'errors.settings.NON_FINITE_NUMBER' && i.path.includes('builder-back-bottom'))).toBe(true);
    // מידה שלילית
    summary = useSettingsStore.getState().importSettingsFile({ 'dim-h2-btm-h': '-2em' });
    expect(summary.loaded).toBe(0);
    expect(summary.issues.some((i) => i.code === 'errors.settings.NEGATIVE_DIMENSION' && i.path.includes('dim-h2-btm-h'))).toBe(true);
    // מפתח לא מוכר
    summary = useSettingsStore.getState().importSettingsFile({ 'no-such-key': 1 });
    expect(summary.loaded).toBe(0);
    expect(summary.issues.some((i) => i.code === 'errors.settings.UNKNOWN_KEY' && i.path.includes('no-such-key'))).toBe(true);
    // אף אחד מהם לא נכנס ל־draft — העימוד ירוץ רק על מצב תקין
    expect(Object.keys(useSettingsStore.getState().draft)).toHaveLength(0);
  });

  test('הגנה מפני draft מושחת: applyDraft נכשל ⇐ effective=null (אין ערך מלוכלך מהריצה הקודמת)', () => {
    useSettingsStore.getState().setDraftValue('auto-dh', true);
    useSettingsStore.getState().applyDraft();
    expect(useSettingsStore.getState().effective).not.toBeNull();
    // שחזור מצב לא אפשרי בנתיב הרגיל (הייבוא דוחה) — הגנה בעומק: כשל
    // buildEffectiveSettings מאפס את ה־effective, לא משאיר ישן
    useSettingsStore.setState({ draft: Object.freeze({ 'no-such-key': 1 }) });
    useSettingsStore.getState().applyDraft();
    const s = useSettingsStore.getState();
    expect(s.effective).toBeNull();
    expect(s.issues.some((i) => i.code === 'errors.settings.UNKNOWN_KEY')).toBe(true);
  });
});
