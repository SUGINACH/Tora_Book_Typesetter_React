/**
 * source-analysis.test.ts — בדיקות ניתוח הקלט ומפת שגיאות הקלט (שלב 80; אפיון §3.3, §13–14).
 *
 * מה מוכח כאן:
 *   1. מיקום — היסט ← שורה:עמודה במרחב UTF-16 (פיצול \n בלבד, כמו הפרסר);
 *      קצוות, קלאמפ, שורה אחרונה בלי שורה חדשה.
 *   2. ניתוח — פרסור יחיד דרך content-model; סקירת metadata וזרמי הערות
 *      זהה לחישוב ישיר מול parseSourceText; דיאגנוסטיקה ממוקדת בשורה
 *      ובעמודה הנכונות עם שורת המקור.
 *   3. שעת השלב — "כל קובץ תקף נטען; כל דחייה מוצגת במיקום הנכון":
 *      כל 72 קבצי הקורפוס נפרסים בהצלחה (אף אחד לא נזרק), לכל בעיה
 *      ממוקמת יש מיקום בתוך גבולות המקור, ולכל קוד יש תווית מתורגמת.
 *   4. קלט פגום — sentinel נזרק וממוקד; מפתח metadata כפול ממוקד;
 *      תו בקרה בתוך שורה ממוקד; U+FFFD (קובץ בינארי) אזהרה ממוקדת
 *      בלי לחסום; ריק — אזהרה; גדול — אזהרה בלבד.
 *   5. דטרמיניזם — אותו מקור ⇐ אותו ניתוח עומק.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import {
  IMPORT_ERROR_CATALOG,
  LARGE_DOCUMENT_BYTES,
  analyzeSource,
  computeLineStarts,
  isRegisteredImportErrorKey,
  makeImportIssue,
  offsetToLineCol,
} from '../../src/stores/source-analysis.js';
import { parseSourceText } from '@tora/content-model';
import { formatIssueLabel, IMPORT_LABELS } from '../../src/i18n/import-labels.js';

const corpusRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../packages/test-fixtures/corpus');
const corpusFile = (rel: string): string => readFileSync(join(corpusRoot, rel), 'utf8');

describe('מיקום — היסט ← שורה:עמודה (UTF-16, פיצול \\n בלבד)', () => {
  test('התחלה, שורות עוקבות וסוף ללא שורה חדשה', () => {
    const starts = computeLineStarts('ab\ncd\nef');
    expect(offsetToLineCol(starts, 0)).toEqual({ line: 1, column: 1 });
    expect(offsetToLineCol(starts, 2)).toEqual({ line: 1, column: 3 }); // ה-b השני
    expect(offsetToLineCol(starts, 3)).toEqual({ line: 2, column: 1 }); // אחרי \n
    expect(offsetToLineCol(starts, 5)).toEqual({ line: 2, column: 3 });
    expect(offsetToLineCol(starts, 6)).toEqual({ line: 3, column: 1 });
    expect(offsetToLineCol(starts, 8)).toEqual({ line: 3, column: 3 }); // אורך המקור
  });

  test('היסט מעבר לקצה — השורה האחרונה שפתיחתה ≤ ההיסט; שלילי להתחלה', () => {
    const starts = computeLineStarts('aa\nbb');
    expect(offsetToLineCol(starts, 999)).toEqual({ line: 2, column: 997 }); // הקלאמפ לאורך — ב-locate
    expect(offsetToLineCol(starts, -5)).toEqual({ line: 1, column: 1 });
  });

  test('מחרוזת ריקה — שורה 1 עמודה 1', () => {
    expect(offsetToLineCol(computeLineStarts(''), 0)).toEqual({ line: 1, column: 1 });
  });

  test('עמודה ביחידות UTF-16 — זוג עודף נחשב שתי יחידות (כמו SourceSpan)', () => {
    const src = 'a𝄞b\nc'; // 𝄞 = U+1D11E, שתי יחידות UTF-16
    const starts = computeLineStarts(src);
    expect(offsetToLineCol(starts, 1)).toEqual({ line: 1, column: 2 });
    expect(offsetToLineCol(starts, 3)).toEqual({ line: 1, column: 4 }); // b — אחרי הזוג
    expect(offsetToLineCol(starts, 5)).toEqual({ line: 2, column: 1 });
  });
});

describe('ניתוח — פרסור יחיד, סקירה מהתוצאה עצמה', () => {
  const SOURCE = 'שם הספר - ספר הבדיקות\nנושא - ניתוח קלט\n\nכותרת 1 מספר 1 - פרק ראשון\nפסקה ראשונה עם הערת שוליים [הערה אחת] והמשך.\nפסקה שניה [הערה שניה] עם עוד טקסט.\n';

  test('סקירת המסמך זהה לחישוב ישיר מול parseSourceText — אין פרסור שני בעל אחר', () => {
    const { analysis, parsed } = analyzeSource({ source: SOURCE, documentId: 't', revision: 3, documentName: 'ניתוח' });
    expect(parsed).not.toBeNull();
    const direct = parseSourceText(SOURCE, { documentId: 't' });
    expect(analysis.overview?.metadata.map((m) => [m.key, m.value])).toEqual(
      direct.doc.metadata.map((m) => [m.key, m.value]),
    );
    expect(analysis.overview?.notes).toEqual({
      footnotes: direct.doc.notes.footnotes.length,
      endnotes: direct.doc.notes.endnotes.length,
      sidenotes: direct.doc.notes.sidenotes.length,
      editorial: direct.doc.notes.editorial.length,
    });
    expect(analysis.overview?.simanim).toBe(direct.doc.parts.reduce((n, p) => n + p.simanim.length, 0));
    expect(analysis.overview?.parts).toBe(direct.doc.parts.length);
    expect(analysis.parseError).toBeNull();
    expect(analysis.analyzedRevision).toBe(3);
    expect(analysis.documentName).toBe('ניתוח');
  });

  test('דיאגנוסטיקה ממוקדת — שורה, עמודה ושורת המקור מדויקים', () => {
    // כותרת 7 עם מספר סימן ⇐ WARN_H7_SIMAN_DISCARDED ממוקם בשורת הכותרת
    const src = 'שם הספר - ב\n\nכותרת 1 מספר 1 - פרק\nטקסט הגוף.\n\nכותרת 7 מספר 3 - הערת צד\n';
    const { analysis } = analyzeSource({ source: src, documentId: 't', revision: 1, documentName: '' });
    const issue = analysis.issues.find((i) => i.code === 'errors.parser.WARN_H7_SIMAN_DISCARDED');
    expect(issue).toBeDefined();
    expect(issue?.start?.line).toBe(6);
    expect(issue?.lineText).toContain('כותרת 7');
    expect(issue?.origin).toBe('parse');
    expect(issue?.severity).toBe('warning');
  });

  test('בעיה ללא היסט בשדות — סוגריים לא-תואמים ממוקמים מהספאן', () => {
    const src = 'שם הספר - ב\n\nכותרת 1 מספר 1 - פרק\nטקסט עם סוגר פתוח (שלא נסגר\n';
    const { analysis } = analyzeSource({ source: src, documentId: 't', revision: 1, documentName: '' });
    const issue = analysis.issues.find((i) => i.code === 'errors.parser.WARN_UNCLOSED_BRACKET');
    expect(issue).toBeDefined();
    expect(issue?.start).not.toBeNull();
    expect(issue?.startUtf16).not.toBeNull();
    expect(issue?.lineText).toContain('(');
  });

  test('מסמך נקי — אפס בעיות, פרסור עבר, סקירה קיימת', () => {
    const src = 'שם הספר - ב\n\nכותרת 1 מספר 1 - פרק\nפסקה תמימה לחלוטין.\n';
    const { analysis } = analyzeSource({ source: src, documentId: 't', revision: 1, documentName: '' });
    expect(analysis.issues).toHaveLength(0);
    expect(analysis.parseError).toBeNull();
    expect(analysis.overview).not.toBeNull();
  });
});

describe('קלט פגום — כל דחייה ממוקדת, אין תיקון שקט', () => {
  test('sentinel בקלט — הפרסר זורק; השגיאה קטלוגית וממוקמת; אין סקירה', () => {
    const src = 'שם הספר - ב\n\nכותרת 1 מספר 1 - פרק\nטקסט תמים \u0001 עוד טקסט\n';
    const { analysis, parsed } = analyzeSource({ source: src, documentId: 't', revision: 1, documentName: '' });
    expect(parsed).toBeNull();
    expect(analysis.parseError?.code).toBe('errors.parser.SENTINEL_IN_INPUT');
    expect(analysis.parseError?.severity).toBe('error');
    expect(analysis.parseError?.start?.line).toBe(4);
    expect(analysis.parseError?.start?.column).toBe(11); // מיקום התו בשורה (UTF-16): 10 תווים לפניו
    expect(analysis.parseError?.lineText).toContain('\u0001');
    expect(analysis.overview).toBeNull();
  });

  test('מפתח metadata כפול — נזרק וממוקד בשורה הכפולה עם המפתח בפרמטרים', () => {
    const src = 'שם הספר - ראשון\nשם הספר - שני\n\nכותרת 1 מספר 1 - פרק\nטקסט.\n';
    const { analysis, parsed } = analyzeSource({ source: src, documentId: 't', revision: 1, documentName: '' });
    expect(parsed).toBeNull();
    expect(analysis.parseError?.code).toBe('errors.parser.DUPLICATE_METADATA_KEY');
    expect(analysis.parseError?.params.key).toBe('שם הספר');
    expect(analysis.parseError?.start?.line).toBe(2);
  });

  test('תו בקרה בתוך שורה (\\r) — INVALID_CONTROL_CHAR ממוקד', () => {
    const src = 'שם הספר - ב\n\nכותרת 1 מספר 1 - פרק\nטקסט\rבאמצע שורה\n';
    const { analysis } = analyzeSource({ source: src, documentId: 't', revision: 1, documentName: '' });
    expect(analysis.parseError?.code).toBe('errors.parser.INVALID_CONTROL_CHAR');
    expect(analysis.parseError?.start?.line).toBe(4);
  });

  test('U+FFFD (פענוח בינארי) — אזהרת ייבוא ממוקדת; הפרסור ממשיך (לא נחסם)', () => {
    const src = 'שם הספר - ב\n\nכותרת 1 מספר 1 - פרק\nטקסט עם \uFFFD תו מוחלף\n';
    const { analysis, parsed } = analyzeSource({ source: src, documentId: 't', revision: 1, documentName: '' });
    const issue = analysis.issues.find((i) => i.code === 'errors.import.BINARY_CONTENT');
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe('warning');
    expect(issue?.origin).toBe('import');
    expect(issue?.start?.line).toBe(4);
    expect(parsed).not.toBeNull(); // הפרסור רץ — התו תוכן חוקי; האזהרה מציגה את הנזק
    expect(analysis.parseError).toBeNull();
  });

  test('מסמך ריק — אזהרת EMPTY_DOCUMENT בלבד; הפרסור של ריק עובר', () => {
    const { analysis, parsed } = analyzeSource({ source: '', documentId: 't', revision: 1, documentName: '' });
    expect(analysis.issues.map((i) => i.code)).toContain('errors.import.EMPTY_DOCUMENT');
    expect(parsed).not.toBeNull();
  });

  test('מסמך גדול — אזהרה בלבד (לא דחייה); הקובץ הקנוני 3.4MB חייב לעבור', () => {
    const big = 'שם הספר - ענק\n\nכותרת 1 מספר 1 - פרק\n' + 'טקסט ארוך למילוי נפח. '.repeat(200_000);
    expect(big.length).toBeGreaterThan(LARGE_DOCUMENT_BYTES);
    const { analysis, parsed } = analyzeSource({ source: big, documentId: 't', revision: 1, documentName: '' });
    expect(analysis.issues.some((i) => i.code === 'errors.import.LARGE_DOCUMENT')).toBe(true);
    expect(analysis.parseError).toBeNull();
    expect(parsed).not.toBeNull();
  });
});

describe('קטלוג הייבוא — סגור וקפוא', () => {
  test('כל קודי הייבוא רשומים ועם תווית; makeImportIssue דוחה קוד זר', () => {
    for (const code of Object.keys(IMPORT_ERROR_CATALOG)) {
      expect(isRegisteredImportErrorKey(code)).toBe(true);
      expect(IMPORT_LABELS[code]).toBeDefined();
    }
    expect(() => makeImportIssue('errors.import.NO_SUCH_CODE', {})).toThrow();
  });

  test('makeImportIssue — ללא מיקום, מקור ייבוא, פרמטרים קפואים', () => {
    const issue = makeImportIssue('errors.import.UNSUPPORTED_FORMAT', { extension: 'pdf' });
    expect(issue.startUtf16).toBeNull();
    expect(issue.start).toBeNull();
    expect(issue.origin).toBe('import');
    expect(Object.isFrozen(issue)).toBe(true);
  });
});

describe('שעת השלב — כל קבצי הקורפוס נטענים; כל דחייה/בעיה ממוקמת ומתורגמת', () => {
  // רשימת הקבצים נבנית ישירות מהספרייה (fs) — הבדיקה אינה תלויה ברשימה כתובה־ביד
  const allTxt: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.txt')) allTxt.push(p);
    }
  };
  walk(corpusRoot);
  expect(allTxt.length).toBeGreaterThanOrEqual(70);

  test('אף קובץ קורפוס אינו נזרק — כולם נפרסים עם סקירה; כל בעיה ממוקמת בגבולות ומתורגמת', () => {
    let totalIssues = 0;
    for (const path of allTxt) {
      const src = readFileSync(path, 'utf8');
      const { analysis, parsed } = analyzeSource({ source: src, documentId: 'corpus', revision: 1, documentName: path });
      expect(parsed, `${path} חייב להיפרס — קובץ תקף מהקורפוס הנעול`).not.toBeNull();
      expect(analysis.parseError, `${path}`).toBeNull();
      expect(analysis.overview, `${path}`).not.toBeNull();
      for (const issue of analysis.issues) {
        totalIssues += 1;
        // תווית מתורגמת קיימת לכל קוד שהופיע (אין קוד יתום)
        expect(IMPORT_LABELS[issue.code], `${path}: ${issue.code}`).toBeDefined();
        expect(formatIssueLabel(issue.code, issue.params).length).toBeGreaterThan(0);
        // מיקום בתוך גבולות המקור
        if (issue.startUtf16 !== null) {
          expect(issue.startUtf16).toBeLessThanOrEqual(src.length);
          expect(issue.start).not.toBeNull();
          expect(issue.start!.line).toBeGreaterThanOrEqual(1);
          expect(issue.start!.column).toBeGreaterThanOrEqual(1);
        }
      }
    }
    expect(totalIssues).toBeGreaterThan(0); // הקורפוס מכיל אזהרות מכוונות — הן חייבות להיראות
  });

  test('המסמך הקנוני — נטען במלואו עם metadata, זרמי הערות וסימנים', () => {
    const src = corpusFile('canonical/very_long_test_text.txt');
    const { analysis } = analyzeSource({ source: src, documentId: 'canon', revision: 1, documentName: 'קנוני' });
    expect(analysis.parseError).toBeNull();
    expect(analysis.overview?.metadata.length).toBe(10);
    expect(analysis.overview?.notes.sidenotes).toBeGreaterThan(1000);
    expect(analysis.overview?.simanim).toBeGreaterThan(0);
    // 1,989 אזהרות מתועדות לקובץ הזה (H7-סימן + סוגריים) — המפה מציגה את כולן
    expect(analysis.issues.length).toBe(1989);
  });

  test('דטרמיניזם — אותו מקור ⇐ אותו ניתוח (מסמך אמצעי מהקורפוס)', () => {
    const src = corpusFile('mid/mid_long_test_text.txt');
    const a = analyzeSource({ source: src, documentId: 'd', revision: 1, documentName: 'x' });
    const b = analyzeSource({ source: src, documentId: 'd', revision: 1, documentName: 'x' });
    expect(a.analysis).toEqual(b.analysis);
  });
});
