/**
 * tauri-errors.test.ts — בדיקות שלב 95: מיפוי שגיאות המארח (Tauri plug-ins)
 * לקטלוג השגיאות היחיד (§12.3, §16; תכנית: "מיפוי כל dialog/file error
 * לאותו קטלוג שגיאות מקומי של הממשק").
 *
 * מה שמוכח כאן:
 *   1. קטלוג סגור: כל צורת שגיאה (fs/dialog/דפדפן) ממופה לקוד מהקטלוג
 *      הקפוא (errors.import.*) — אין מחרוזת גולמית שנשלפת מהשגיאה.
 *   2. ביטול דיאלוג הוא פעולת-אין (null) — לא דיווח שווא במפת הקלט.
 *   3. הסיווג הדפדפני נשמר במדויק (התנהגות קיימת לא משתנה בדפדפן):
 *      פורמט/קריאה/המרה/דוגמה — לפי תכונות הקובץ, לא לפי message.
 *   4. זיהוי סביבה: מחוץ ל-webview (node) isTauriHost נותר false —
 *      המפה אינה מופעלת בכלל מחוץ ל-Tauri.
 *   5. כל קוד שהמפה מחזירה קיים בקטלוג ה-i18n (import-labels) — אין
 *      קוד יתום שיוצג כמפתח גולם למשתמש.
 */
import { describe, expect, test } from 'vitest';
import {
  classifyHostFileFailure,
  classifyTauriPluginError,
  isDialogCanceled,
  isTauriHost,
  isTauriPluginError,
} from '../../src/worker-host/tauri-errors.js';
import { IMPORT_LABELS } from '../../src/i18n/import-labels.js';

describe('שלב 95 — מיפוי שגיאות Tauri לקטלוג היחיד', () => {
  test('זיהוי שגיאת פלאגין: מחרוזת prefix, אובייקט plugin, וצורות שאינן פלאגין', () => {
    expect(isTauriPluginError('plugin:fs | path not found')).toBe(true);
    expect(isTauriPluginError('plugin:dialog | os error')).toBe(true);
    expect(isTauriPluginError({ plugin: 'fs', message: 'x' })).toBe(true);
    expect(isTauriPluginError({ message: 'plugin:dialog.open canceled' })).toBe(true);
    // שגיאות דפדפן רגילות — אינן שגיאות מארח
    expect(isTauriPluginError(new Error('Failed to read'))).toBe(false);
    expect(isTauriPluginError({ message: 'Failed to fetch' })).toBe(false);
  });

  test('טקסונומיה יציבה: לא-נמצא/הרשאה/גודל/קריאה ⇒ FILE_UNREADABLE עם reason מנורמל', () => {
    expect(classifyTauriPluginError('plugin:fs | path not found')).toEqual({
      code: 'errors.import.FILE_UNREADABLE',
      params: { reason: 'not-found' },
    });
    expect(classifyTauriPluginError('plugin:fs | permission denied')).toEqual({
      code: 'errors.import.FILE_UNREADABLE',
      params: { reason: 'permission' },
    });
    expect(classifyTauriPluginError('plugin:fs | file too large')).toEqual({
      code: 'errors.import.FILE_UNREADABLE',
      params: { reason: 'too-large' },
    });
    expect(classifyTauriPluginError('plugin:fs | os error 32')).toEqual({
      code: 'errors.import.FILE_UNREADABLE',
      params: { reason: 'io' },
    });
  });

  test('ביטול דיאלוג — פעולת-אין: classifyHostFileFailure מחזיר null (אין דיווח שווא)', () => {
    expect(isDialogCanceled('plugin:dialog | dialog canceled')).toBe(true);
    expect(
      classifyHostFileFailure('plugin:dialog | dialog canceled', { fileName: 'a.txt', kind: 'text' }),
    ).toBeNull();
  });

  test('הסיווג הדפדפני נשמר במדויק — התנהגות הייבוא לא השתנתה מחוץ ל-Tauri', () => {
    // טקסט: סיומת לא-טקסט ⇐ פורמט; ‎.txt ⇐ כשל קריאה
    expect(classifyHostFileFailure(new Error('x'), { fileName: 'doc.pdf', kind: 'text' })).toEqual({
      code: 'errors.import.UNSUPPORTED_FORMAT',
      params: { extension: 'pdf' },
    });
    expect(
      classifyHostFileFailure(new Error('x'), { fileName: 'torah.txt', mimeType: 'text/plain', kind: 'text' }),
    ).toEqual({ code: 'errors.import.FILE_UNREADABLE', params: { reason: 'read-failed' } });
    // ‎.txt שהוחלף לו סוג אך שמו תקין — עדיין בעיית קריאה
    expect(
      classifyHostFileFailure(new Error('x'), { fileName: 'torah.txt', mimeType: '', kind: 'text' }),
    ).toEqual({ code: 'errors.import.FILE_UNREADABLE', params: { reason: 'read-failed' } });
    // Word: לא-docx ⇐ פורמט; docx ⇐ כשל המרה
    expect(classifyHostFileFailure(new Error('x'), { fileName: 'file.doc', kind: 'word' })).toEqual({
      code: 'errors.import.UNSUPPORTED_FORMAT',
      params: { extension: 'doc' },
    });
    expect(classifyHostFileFailure(new Error('x'), { fileName: 'file.docx', kind: 'word' })).toEqual({
      code: 'errors.import.WORD_CONVERT_FAILED',
      params: {},
    });
    // דוגמה
    expect(
      classifyHostFileFailure(new Error('404'), { fileName: './x.txt', kind: 'sample', path: 'x.txt' }),
    ).toEqual({ code: 'errors.import.SAMPLE_UNAVAILABLE', params: { path: 'x.txt' } });
  });

  test('מחוץ ל-webview אין סביבת Tauri — המפה אינה רלוונטית ל-node (isTauriHost=false)', () => {
    expect(isTauriHost()).toBe(false);
  });

  test('קטלוג סגור: כל קוד שהמפה מחזירה קיים ב-import-labels (אין קוד יתום)', () => {
    const codes = new Set([
      classifyTauriPluginError('plugin:fs | path not found').code,
      classifyHostFileFailure(new Error('x'), { fileName: 'a.pdf', kind: 'text' })?.code,
      classifyHostFileFailure(new Error('x'), { fileName: 'a.txt', kind: 'text' })?.code,
      classifyHostFileFailure(new Error('x'), { fileName: 'a.docx', kind: 'word' })?.code,
      classifyHostFileFailure(new Error('x'), { fileName: 'a.txt', kind: 'sample', path: 'a.txt' })?.code,
    ]);
    expect(codes.size).toBe(4);
    for (const code of codes) {
      expect(IMPORT_LABELS[code as keyof typeof IMPORT_LABELS]).toBeDefined();
    }
  });
});
