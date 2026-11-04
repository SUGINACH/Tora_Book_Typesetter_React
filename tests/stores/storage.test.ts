/**
 * storage.test.ts — בדיקות הפשטת האחסון (שלב 76).
 *
 * מה מוכח כאן: ערוץ זיכרון נאמן; JSON פגום ⇐ ברירת מחדל בלי זריקה;
 * הזרקת ערוץ מחליפה את הפעיל; מוסכמת המפתחות tora-ui:*:v1 ומפתחות
 * המורשת tora-typesetter-* (קריאה בלבד).
 */
import { describe, expect, test } from 'vitest';
import {
  createMemoryKVStorage,
  getKVStorage,
  LEGACY_STORAGE_KEYS,
  readJson,
  setKVStorage,
  STORAGE_KEYS,
  writeJson,
} from '../../src/stores/storage.js';

describe('KVStorage — ערוץ זיכרון', () => {
  test('סבב כתיבה/קריאה/מחיקה נאמן; מפתח חסר ⇐ null', () => {
    const mem = createMemoryKVStorage();
    expect(mem.getItem('a')).toBeNull();
    mem.setItem('a', '1');
    expect(mem.getItem('a')).toBe('1');
    mem.setItem('a', '2');
    expect(mem.getItem('a')).toBe('2');
    mem.removeItem('a');
    expect(mem.getItem('a')).toBeNull();
  });

  test('ערוצים נפרדים אינם חולקים מצב', () => {
    const a = createMemoryKVStorage();
    const b = createMemoryKVStorage();
    a.setItem('k', 'in-a');
    expect(b.getItem('k')).toBeNull();
  });
});

describe('readJson/writeJson — הגנה מפני קלט שמור פגום', () => {
  test('JSON תקין נקרא חזרה; חסר ⇐ החלופי; פגום ⇐ החלופי בלי זריקה', () => {
    const mem = createMemoryKVStorage({ good: '{"x":1}', broken: '{nope' });
    setKVStorage(mem);
    writeJson('written', { y: [1, 2] });
    expect(readJson('written', null)).toEqual({ y: [1, 2] });
    expect(readJson('missing', { fallback: true })).toEqual({ fallback: true });
    expect(readJson('broken', { fallback: true })).toEqual({ fallback: true });
  });
});

describe('הזרקת ערוץ', () => {
  test('setKVStorage מחליף את הערוץ הפעיל לכתיבה ולקריאה', () => {
    const first = createMemoryKVStorage();
    const second = createMemoryKVStorage();
    setKVStorage(first);
    writeJson('only-in-first', 1);
    expect(getKVStorage()).toBe(first);
    setKVStorage(second);
    expect(getKVStorage()).toBe(second);
    expect(readJson('only-in-first', 'absent')).toBe('absent');
    writeJson('only-in-second', 2);
    expect(second.getItem('only-in-second')).not.toBeNull();
    expect(first.getItem('only-in-second')).toBeNull();
  });
});

describe('מוסכמת מפתחות', () => {
  test('החדשים tora-ui:*:v1; הישנים tora-typesetter-* (למיגרציה בלבד)', () => {
    for (const key of Object.values(STORAGE_KEYS)) {
      expect(key.startsWith('tora-ui:')).toBe(true);
      expect(key.endsWith(':v1')).toBe(true);
    }
    expect(new Set(Object.values(STORAGE_KEYS)).size).toBe(Object.keys(STORAGE_KEYS).length);
    for (const key of Object.values(LEGACY_STORAGE_KEYS)) {
      expect(key.startsWith('tora-typesetter-')).toBe(true);
    }
  });
});
