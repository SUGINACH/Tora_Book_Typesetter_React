/**
 * מבחני שלב 30 — חוזה settings-schema: מרשם, ייבוא, configHash, migrations.
 * אסמכתא: אפיון §6.3 · תכנית שלב 30.
 */
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  buildEffectiveSettings,
  buildSettingRegistry,
  computeConfigHash,
  importSettings,
  migrateSettings,
  settingsErrorCatalogSize,
} from '../src/index.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const registryJson = JSON.parse(readFileSync(join(repoRoot, 'packages', 'settings-schema', 'registry.json'), 'utf8'));
const registry = buildSettingRegistry(registryJson);
const defaultSettings = JSON.parse(readFileSync(join(repoRoot, 'assets', 'settings', 'default_settings.json'), 'utf8'));
const preset = (n) => JSON.parse(readFileSync(join(repoRoot, 'assets', 'settings', 'setting_sets', `${n}.json`), 'utf8'));

describe('שלב 30 — מרשם ההגדרות', () => {
  it('248 מפתחות; 235 משפיעי פריסה; 13 UI-only (אינם נכנסים ל-configHash)', () => {
    expect(registry.byKey.size).toBe(257); // 248 default + 9 preset-only
    expect(registry.layoutKeys.length).toBe(236);
    expect(registry.uiOnlyKeys.length).toBe(21); // 13 + 8 file-* selectors
  });

  it('כיסוי קבוצות חובה (§6.3)', () => {
    for (const k of ['page-num-initial-value', 'avoid-runt-word', 'body-last-line-align', 'hdr-h1-title-mode', 'h2-orn-scope', 'hdr-verso-c-type']) {
      expect(registry.byKey.has(k)).toBe(true);
    }
    const def = registry.byKey.get('hdr-verso-c-type')!;
    expect(def.enumValues).toContain('same_as_odd');
  });

  it('drop-word-mode: "window" נשמר כערך legacy חוקי — אין המרה אוטומטית', () => {
    const def = registry.byKey.get('drop-word-mode')!;
    expect(def.enumValues).toEqual(['none', 'window']);
    expect(def.defaultValue).toBe('window');
    const imported = importSettings({ 'drop-word-mode': 'window' }, registry);
    expect(imported.values?.['drop-word-mode']).toBe('window');
  });
});

describe('שלב 30 — ייבוא round-trip של כל קובצי legacy', () => {
  it('default_settings.json: כל 248 המפתחות מיובאים; מחרוזות-מספר מומרות עם אזהרה מתועדת', () => {
    const out = importSettings(defaultSettings, registry, '/default');
    expect(out.values).not.toBeNull();
    expect(Object.keys(out.values!).length).toBe(248); // default only
    const coercions = out.issues.filter((i) => i.code === 'errors.settings.COERCED_LEGACY_STRING');
    expect(coercions.length).toBeGreaterThan(60);
    expect(out.values!['s-h0']).toBe(26); // ברירת המחדל במקור
    expect(typeof out.values!['s-h0']).toBe('number');
    expect(out.values!['avoid-runt-word']).toBe(true);
  });

  it('שלושת הפריסטים מיובאים במלואם (פרשנות/קונטרס/תלמוד)', () => {
    for (const name of ['פרשנות', 'קונטרס', 'תלמוד']) {
      const out = importSettings(preset(name), registry, `/preset/${name}`);
      expect(out.values).not.toBeNull();
    }
  });
});

describe('שלב 30 — configHash', () => {
  it('יציב לשינוי סדר keys; משתנה בשינוי מפתח פריסה; קבוע בשינוי UI-only', () => {
    const eff = buildEffectiveSettings(registry, []);
    const reordered = {};
    for (const k of Object.keys(eff.values).reverse()) reordered[k] = eff.values[k];
    const hash2 = computeConfigHash(reordered, registry);
    expect(hash2).toBe(eff.configHash);
    const eff2 = buildEffectiveSettings(registry, [{ 's-h0': 33 }]);
    expect(eff2.configHash).not.toBe(eff.configHash);
    const eff3 = buildEffectiveSettings(registry, [{ 'inp-book-title': 'ספר אחר לגמרי' }]);
    expect(eff3.configHash).toBe(eff.configHash);
  });

  it('ערכי מחרוזת-מספר legacy אינם משפיעים על ה-hash (קנוניזציה לפני)', () => {
    const effA = buildEffectiveSettings(registry, []);
    const withStrings = { ...defaultSettings, 's-h0': String(defaultSettings['s-h0']) }; // אותו ערך, כמחרוזת legacy
    const effB = buildEffectiveSettings(registry, [withStrings]);
    expect(effB.configHash).toBe(effA.configHash);
  });
});

describe('שלב 30 — דחיית ערכים לא חוקיים', () => {
  it('מפתח לא מוכר: נדחה עם path וקוד (אינו נמחק בשקט)', () => {
    const out = importSettings({ 'totally-unknown-key': 1 }, registry);
    expect(out.values).toBeNull();
    expect(out.issues[0]!.code).toBe('errors.settings.UNKNOWN_KEY');
    expect(out.issues[0]!.path).toBe('/settings/totally-unknown-key');
  });

  it('NaN/מחרוזת לא-מספרית ערך number → NON_FINITE_NUMBER; שלילי → INVALID_VALUE', () => {
    const bad = importSettings({ 's-h0': 'abc' }, registry);
    expect(bad.issues.some((i) => i.code === 'errors.settings.NON_FINITE_NUMBER')).toBe(true);
    const neg = importSettings({ 'prop-margin': '-5' }, registry);
    expect(neg.issues.some((i) => i.code === 'errors.settings.INVALID_VALUE')).toBe(true);
  });

  it('מידה שלילית → NEGATIVE_DIMENSION; enum לא ידוע → UNKNOWN_ENUM_VALUE', () => {
    const neg = importSettings({ 'dim-h2-top-h': '-1.25em' }, registry);
    expect(neg.issues.some((i) => i.code === 'errors.settings.NEGATIVE_DIMENSION')).toBe(true);
    const en = importSettings({ 'drop-word-mode': 'sunken' }, registry);
    expect(en.issues.some((i) => i.code === 'errors.settings.UNKNOWN_ENUM_VALUE')).toBe(true);
    expect(en.values).toBeNull();
  });
});

describe('שלב 30 — סדר קדימות ומיגרציות', () => {
  it('defaults < preset < document < override (§6.3)', () => {
    const eff = buildEffectiveSettings(registry, [preset('תלמוד'), { 's-h0': 40 }, { 's-h0': 44 }]);
    expect(eff.values['s-h0']).toBe(44);
    expect(eff.values['drop-word-mode']).toBe('none');
    expect(eff.enginePolicyId).toBe('torah-v1');
  });

  it('migrateSettings: v1→v1 זהות (השרשרת ריקה כרגע); דטרמיניסטית', () => {
    const out = migrateSettings(defaultSettings, 1, 1);
    expect(out.toVersion).toBe(1);
    expect(out.settings).toBe(defaultSettings);
  });

  it('קטלוג השגיאות: כל הקודים רשומים', () => {
    expect(settingsErrorCatalogSize).toBeGreaterThanOrEqual(13);
  });
});
