/**
 * firstword.test.ts — בדיקות שלב 64: first-word-window, dibbur hamatchil, drop-word
 * כמדיניות מדידה (אפיון §10.2; פרק ח/M7).
 *
 * מבחני החובה: first-word בפסקה מלאה ובהמשך; drop-word; דיבור מתחיל ארוך; חפיפה.
 */
import { describe, expect, test } from 'vitest';
import {
  createTorahPolicy,
  createMinimalPolicy,
  firstWordPolicyOf,
  splitFirstWord,
  splitDibburHamatchil,
  DIBBUR_DELIMITERS,
  DIBBUR_MAX_PHRASE_LEN,
  FIRST_WORD_WRAP_ORDER,
  torahRegistrySignature,
  torahRuleIssues,
  type FirstWordPolicy,
} from '../src/index.js';
import type { EffectiveSettings } from '@tora/layout-api';

const mkSettings = (values: Record<string, unknown> = {}): EffectiveSettings =>
  ({ schemaVersion: 1, enginePolicyId: 'torah-v1', values, configHash: 'test' });

const defaultPolicy: FirstWordPolicy = firstWordPolicyOf(mkSettings());

describe('שלב 64 — first-word-window (§10.2)', () => {
  test('מדיניות מההגדרות: mode/count/minLines/font/size — ברירות Orange נעולות', () => {
    expect(defaultPolicy).toEqual({
      mode: 'window', wordCount: 1, minLines: 2,
      font: "'FrankReal', 'Frank Ruhl Libre', serif", size: '1.5',
    });
    const custom = firstWordPolicyOf(mkSettings({ 'drop-word-mode': 'bold', 'drop-word-count': '2', 'drop-word-min-lines': '3', 'font-first-word': 'David', 'size-first-word': '2' }));
    expect(custom).toEqual({ mode: 'bold', wordCount: 2, minLines: 3, font: 'David', size: '2' });
    // ערכים פסולים ⇒ ברירות מחדל נעולות (לא קריסה)
    const bad = firstWordPolicyOf(mkSettings({ 'drop-word-mode': 'banana', 'drop-word-count': '0', 'drop-word-min-lines': 'x' }));
    expect(bad.mode).toBe('window');
    expect(bad.wordCount).toBe(1);
    expect(bad.minLines).toBe(2);
  });

  test('first-word בפסקה מלאה: חלון כשמספר הקווים עומד בסף; inline אחרת', () => {
    const text = 'אמר רבא הכא במאי עסקינן';
    const win = splitFirstWord(text, defaultPolicy, { isContinuation: false, lineCount: 3 });
    expect(win.applied).toBe(true);
    expect(win.effectiveMode).toBe('window');
    expect(win.words).toBe('אמר');
    expect(win.rest).toBe('רבא הכא במאי עסקינן');
    const short = splitFirstWord(text, defaultPolicy, { isContinuation: false, lineCount: 1 });
    expect(short.effectiveMode).toBe('inline'); // פחות מ-minLines ⇒ inline
    expect(short.words).toBe('אמר');
  });

  test('אין החלה על continuation: middle של אותה פסקה (§10.2 מפורש)', () => {
    const r = splitFirstWord('המשך הפסקה מעבר לעמוד', defaultPolicy, { isContinuation: true, lineCount: 9 });
    expect(r.applied).toBe(false);
    expect(r.words).toBe('');
    expect(r.rest).toBe('המשך הפסקה מעבר לעמוד');
  });

  test('none ⇒ אין החלה; wordCount>1 חותך כמה מילים; טקסט קצר מהמספר — הכל ראשון', () => {
    const none = splitFirstWord('א', { ...defaultPolicy, mode: 'none' }, { isContinuation: false, lineCount: 5 });
    expect(none.applied).toBe(false);
    const two = splitFirstWord('א ב ג ד', { ...defaultPolicy, wordCount: 2 }, { isContinuation: false, lineCount: 5 });
    expect(two.words).toBe('א ב');
    expect(two.rest).toBe('ג ד');
    const tiny = splitFirstWord('מילה', { ...defaultPolicy, wordCount: 3 }, { isContinuation: false, lineCount: 5 });
    expect(tiny.words).toBe('מילה');
    expect(tiny.rest).toBe('');
  });

  test('bold/inline אינם תלויים במספר הקווים', () => {
    for (const mode of ['bold', 'inline'] as const) {
      const r = splitFirstWord('א ב ג', { ...defaultPolicy, mode }, { isContinuation: false, lineCount: 1 });
      expect(r.effectiveMode, mode).toBe(mode);
    }
  });
});

describe('שלב 64 — dibbur hamatchil (דיבור המתחיל)', () => {
  test('זיהוי עד המפריד הראשון — כולל המפריד; נקודה/מקף/קו-ארוך/קו-קצר', () => {
    expect(splitDibburHamatchil('אמר רבא. הכא במאי')).toEqual({ phrase: 'אמר רבא.', rest: 'הכא במאי', delimiter: '.' });
    expect(splitDibburHamatchil('תניא - במה דברים אמורים')).toEqual({ phrase: 'תניא -', rest: 'במה דברים אמורים', delimiter: '-' });
    expect(splitDibburHamatchil('גמרא — הני מילי')).toEqual({ phrase: 'גמרא —', rest: 'הני מילי', delimiter: '—' });
    expect(splitDibburHamatchil('משנה – הכל שבוחרין')).toEqual({ phrase: 'משנה –', rest: 'הכל שבוחרין', delimiter: '–' });
  });

  test('אין זיהוי: בלי מפריד; מפריד בתחילת הטקסט; חריגה במגבלת האורך', () => {
    expect(splitDibburHamatchil('טקסט ללא מפריד כלל')).toEqual({ phrase: '', rest: 'טקסט ללא מפריד כלל', delimiter: null });
    expect(splitDibburHamatchil('').phrase).toBe('');
    const long = 'א'.repeat(DIBBUR_MAX_PHRASE_LEN) + '. המשך';
    expect(splitDibburHamatchil(long).delimiter).toBeNull(); // הביטוי חורג מהמגבלה
    const exact = 'א'.repeat(DIBBUR_MAX_PHRASE_LEN - 1) + '. המשך';
    expect(splitDibburHamatchil(exact).delimiter).toBe('.'); // בדיוק בגבול — חוקי
  });

  test('דיבור מתחיל ארוך (מבחן חובה): ביטוי באורך מלא עם המפריד — חוקי; חריגה — אין', () => {
    const words = Array.from({ length: 12 }, (_, i) => `מילה${i}`).join(' ');
    const text = `${words} .והמשך הדיון`; // רווח לפני הנקודה — הביטוי עד הנקודה
    const r = splitDibburHamatchil(text);
    expect(r.delimiter).toBe('.');
    expect(r.phrase.endsWith('.')).toBe(true);
    expect(r.phrase.length).toBeLessThanOrEqual(DIBBUR_MAX_PHRASE_LEN);
  });

  test('המפרידים והמגבלת במדיניות — קבועים נעולים, לא regex ברנדרר', () => {
    expect(DIBBUR_DELIMITERS).toEqual(['.', '—', '–', '-']);
    expect(DIBBUR_MAX_PHRASE_LEN).toBe(80);
  });
});

describe('שלב 64 — חפיפת drop-word ו-dibbur; סדר wrappers אחד ויחיד', () => {
  test('סדר ה-wrappers הקנוני: דיבור חיצוני, מילה-ראשונה פנימית (הסדר ההיסטורי)', () => {
    expect(FIRST_WORD_WRAP_ORDER).toEqual(['dibbur', 'first-word']);
    // החפיפה בפועל: הדיבור מזהה את הפתיח כולו; המילה הראשונה בתוכו
    const text = 'אמר רבא. הכא במאי עסקינן';
    const dib = splitDibburHamatchil(text);
    const fw = splitFirstWord(dib.phrase, defaultPolicy, { isContinuation: false, lineCount: 4 });
    expect(dib.phrase).toBe('אמר רבא.');
    expect(fw.words).toBe('אמר'); // המילה הראשונה בתוך הדיבור — הסדר מוגדר, לא CSS מקרי
    // שני הזיהויים דטרמיניסטיים — אותה תוצאה בכל ריצה
    expect(splitDibburHamatchil(text)).toEqual(dib);
    expect(splitFirstWord(dib.phrase, defaultPolicy, { isContinuation: false, lineCount: 4 })).toEqual(fw);
  });
});

describe('שלב 64 — המדיניות התורנית נושאת את הכללים', () => {
  test('createTorahPolicy: firstWord + dibburEnabled מההגדרות; מינימלית — כבוי', () => {
    const p = createTorahPolicy(mkSettings());
    expect(p.firstWord.mode).toBe('window');
    expect(p.dibburEnabled).toBe(false); // auto-dh=false ברירת Orange
    const on = createTorahPolicy(mkSettings({ 'auto-dh': true, 'drop-word-mode': 'bold' }));
    expect(on.dibburEnabled).toBe(true);
    expect(on.firstWord.mode).toBe('bold');
    const minimal = createMinimalPolicy(mkSettings());
    expect(minimal.firstWord.mode).toBe('none');
    expect(minimal.dibburEnabled).toBe(false);
  });

  test('המרשם: first-word@2 ו-dibbur@2 (rollback = v1); טהור ודטרמיניסטי', () => {
    const sig = torahRegistrySignature();
    expect(sig).toContain('first-word.window@2');
    expect(sig).toContain('dibbur.hamatchil@2');
    expect(torahRuleIssues()).toEqual([]);
    expect(torahRegistrySignature()).toBe(sig);
  });
});
