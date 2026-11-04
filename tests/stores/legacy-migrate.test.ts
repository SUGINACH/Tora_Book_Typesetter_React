/**
 * legacy-migrate.test.ts — בדיקות מיגרציית state ה־UI הישן (שלב 76).
 *
 * מה מוכח כאן: פורמט zustand-persist הישן נקרה נכון; המיגרציה חד־פעמית
 * (דגלון); המפתחות הישנים **אינם נמחקים לעולם**; מפתח חדש קיים גובר
 * (אין דריסה); ההגדרות הישנות נשמרות תחת unmappedLegacy לשלב 79.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { createMemoryKVStorage, LEGACY_STORAGE_KEYS, STORAGE_KEYS, type KVStorage } from '../../src/stores/storage.js';
import { migrateLegacyUiState } from '../../src/stores/legacy-migrate.js';

const legacyBody = (state: Record<string, unknown>): string => JSON.stringify({ state, version: 0 });

let mem: KVStorage;
beforeEach(() => {
  mem = createMemoryKVStorage();
});

describe('legacy-migrate — מיגרציה חד־פעמית וקריאה בלבד', () => {
  test('אין מורשת ⇐ ran עם הפעלות none; הדגלון נכתב; שנייה כבר לא רצה', () => {
    const r1 = migrateLegacyUiState(mem);
    expect(r1.ran).toBe(true);
    expect(r1.editor).toBe('none');
    expect(r1.settings).toBe('none');
    expect(r1.view).toBe('none');
    expect(mem.getItem(STORAGE_KEYS.migrationFlag)).not.toBeNull();
    const r2 = migrateLegacyUiState(mem);
    expect(r2.ran).toBe(false);
  });

  test('המפתחות הישנים אינם נמחקים לאחר המיגרציה (קריאה בלבד)', () => {
    mem.setItem(LEGACY_STORAGE_KEYS.editor, legacyBody({ rawText: 'טקסט ישן' }));
    mem.setItem(LEGACY_STORAGE_KEYS.view, legacyBody({ zoom: 2 }));
    migrateLegacyUiState(mem);
    expect(mem.getItem(LEGACY_STORAGE_KEYS.editor)).not.toBeNull();
    expect(mem.getItem(LEGACY_STORAGE_KEYS.view)).not.toBeNull();
  });
});

describe('legacy-migrate — תוכן הערוצים', () => {
  test('editor: rawText עובר למפתח החדש במבנה החדש', () => {
    mem.setItem(LEGACY_STORAGE_KEYS.editor, legacyBody({ rawText: 'ספר תורה' }));
    const r = migrateLegacyUiState(mem);
    expect(r.editor).toBe('migrated');
    const saved = JSON.parse(mem.getItem(STORAGE_KEYS.editor)!);
    expect(saved).toEqual({ rawText: 'ספר תורה', documentName: '' });
  });

  test('view: zoom עובר; ההגדרות הישנות נשמרות כמו שהן תחת unmappedLegacy', () => {
    mem.setItem(LEGACY_STORAGE_KEYS.view, legacyBody({ zoom: 1.75 }));
    mem.setItem(LEGACY_STORAGE_KEYS.settings, legacyBody({ settings: { 'old-engine-key': 3, nested: { a: 1 } } }));
    const r = migrateLegacyUiState(mem);
    expect(r.view).toBe('migrated');
    expect(r.settings).toBe('migrated');
    expect(JSON.parse(mem.getItem(STORAGE_KEYS.view)!)).toEqual({ zoom: 1.75, locale: 'he' });
    const savedSettings = JSON.parse(mem.getItem(STORAGE_KEYS.settings)!);
    expect(savedSettings.unmappedLegacy).toEqual({ 'old-engine-key': 3, nested: { a: 1 } });
    expect(savedSettings.draft).toEqual({});
  });
});

describe('legacy-migrate — החדש גובר וקלט פגום', () => {
  test('מפתח חדש קיים ⇐ skipped-existing ללא דריסה', () => {
    mem.setItem(LEGACY_STORAGE_KEYS.editor, legacyBody({ rawText: 'ישן' }));
    mem.setItem(STORAGE_KEYS.editor, JSON.stringify({ rawText: 'קיים', documentName: 'שמור' }));
    const r = migrateLegacyUiState(mem);
    expect(r.editor).toBe('skipped-existing');
    expect(JSON.parse(mem.getItem(STORAGE_KEYS.editor)!).rawText).toBe('קיים');
  });

  test('JSON ישן פגום ⇐ none לאותו ערוץ, בלי קריסה; שאר הערוצים עדיין מוגרים', () => {
    mem.setItem(LEGACY_STORAGE_KEYS.editor, '{broken');
    mem.setItem(LEGACY_STORAGE_KEYS.view, legacyBody({ zoom: 1.5 }));
    const r = migrateLegacyUiState(mem);
    expect(r.editor).toBe('none');
    expect(r.view).toBe('migrated');
    expect(mem.getItem(STORAGE_KEYS.editor)).toBeNull();
  });
});
