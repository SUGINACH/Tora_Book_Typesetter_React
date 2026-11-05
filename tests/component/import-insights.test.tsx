// @vitest-environment jsdom
/**
 * import-insights.test.tsx — בדיקות מפת שגיאות הקלט וסקירת המסמך (שלב 80;
 * אפיון §3.3, §13–14, תכנית שלב 80: "ייבוא מסמכים ומפת שגיאות קלט").
 *
 * מה נבדק כאן מול דלתות השלב:
 *   1. הפאנל אינו מוצג ללא ניתוח; לאחר ייבוא — סקירת metadata, זרמי
 *      ההערות, סימנים וחלקים מוצגים ("תצוגת metadata וזרמי notes").
 *   2. מפת השגיאות — כל בעיה עם תווית מתורגמת, מיקום שורה:עמודה
 *      ושורת מקוד עם הטווח החשוד מסומן; לחיצה בוחרת את הטווח בעורך
 *      ("הדגשה במקור" — setSelectionRange בעורך האמיתי).
 *   3. שגיאת פרסור חוסמת — מוצגת עם מיקום; לחיצה מדגישה.
 *   4. כישלון מתאם (פורמט) — מוצג בקוד קטלוגי; המסמך הנוכחי לא הוחלף.
 *   5. טריות — עריכה אחרי הניתוח ⇐ "איננה עדכנית"; ריצה מרעננת
 *      (analyzedRevision עוקב אחרי המהדורה).
 *   6. אין תיקון שקט — ההודעה המוצגת היא תווית מתורגמת, לא message גולם.
 */
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { useEditorStore } from '../../src/stores/editor-store.js';
import { useRunStore } from '../../src/stores/run-store.js';
import { useResultStore } from '../../src/stores/result-store.js';
import { useSettingsStore } from '../../src/stores/settings-store.js';
import { useViewStore } from '../../src/stores/view-store.js';
import { createMemoryKVStorage, readJson, setKVStorage, STORAGE_KEYS } from '../../src/stores/storage.js';
import { importDocumentText, reportImportFailure } from '../../src/stores/import-document.js';
import { analyzeSource } from '../../src/stores/source-analysis.js';
import { ImportInsights } from '../../src/components/editor/ImportInsights.js';
import { TextEditor } from '../../src/components/editor/TextEditor.js';

const resetAll = (): void => {
  setKVStorage(createMemoryKVStorage());
  useEditorStore.getState().reset();
  useRunStore.getState().reset();
  useResultStore.getState().reset();
  useViewStore.getState().reset();
  useSettingsStore.getState().reset();
};

beforeEach(resetAll);
afterEach(() => {
  cleanup();
  resetAll();
});

const SOURCE_OK = 'שם הספר - ספר הבדיקות\nנושא - מפת שגיאות\n\nכותרת 1 מספר 1 - פרק ראשון\nפסקה עם הערה [הערת שוליים] וטקסט.\n';

describe('שלב 80 — סקירת מסמך ומפת שגיאות קלט', () => {
  test('ללא ניתוח הפאנל אינו מוצג; אין תוכן סמוי', () => {
    const { container } = render(createElement(ImportInsights));
    expect(container.querySelector('[data-testid="import-insights"]')).toBeNull();
  });

  test('ייבוא מסמך תקין — סקירה: metadata, זרמי הערות, סימנים וחלקים', () => {
    importDocumentText(SOURCE_OK, 'מסמך-תקין.txt', 'text-file');
    const { container } = render(createElement(ImportInsights));
    const overview = container.querySelector('[data-testid="insights-overview"]');
    expect(overview).not.toBeNull();
    expect(container.querySelector('[data-testid="insight-metadata-0"]')?.textContent).toContain('שם הספר');
    expect(container.querySelector('[data-testid="insight-metadata-0"]')?.textContent).toContain('ספר הבדיקות');
    const notes = container.querySelector('[data-testid="insights-notes"]')?.textContent ?? '';
    expect(notes).toContain('הערות שוליים');
    expect(notes).toContain('סימנים');
    // מסמך תקין ללא בעיות — הודעת "נטען ונותח"
    expect(container.querySelector('[data-testid="insights-clean"]')).not.toBeNull();
  });

  test('בעיות ממוקדות — תווית מתורגמת + שורה:עמודה + מוקט עם הטווח החשוד', () => {
    // כותרת 7 עם מספר סימן ⇐ אזהרה ממוקמת
    const src = 'שם הספר - ב\n\nכותרת 1 מספר 1 - פרק\nטקסט הגוף.\n\nכותרת 7 מספר 3 - הערה\n';
    importDocumentText(src, 'עם-אזהרות.txt', 'text-file');
    const { container } = render(createElement(ImportInsights));
    const row = container.querySelector('[data-testid="insight-issue-0"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('כותרת 7'); // שורת המקור מוצגת
    expect(row?.textContent).toMatch(/שורה 6/); // מיקום
    expect(row?.querySelector('mark')).not.toBeNull(); // הטווח החשוד מסומן
    expect(row?.textContent).not.toContain('[object'); // אין message גולם
  });

  test('לחיצה על בעיה בוחרת את הטווח בעורך — הדגשה במקור', () => {
    const src = 'שם הספר - ב\n\nכותרת 1 מספר 1 - פרק\nטקסט הגוף.\n\nכותרת 7 מספר 3 - הערה\n';
    importDocumentText(src, 'עם-אזהרות.txt', 'text-file');
    const { container } = render(createElement('div', null, createElement(ImportInsights), createElement(TextEditor)));
    const row = container.querySelector('[data-testid="insight-issue-0"]') as HTMLElement;
    fireEvent.click(row);
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    // הבחירה היא טווח הכותרת במקור — לא כלום ולא הכול
    expect(editor.selectionStart).not.toBe(editor.selectionEnd);
    const selected = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    expect(selected).toContain('כותרת 7');
    // המוקד נרשם ב-viewStore (UI-only)
    const focus = useViewStore.getState().focus;
    expect(focus?.pane).toBe('source');
    expect(focus?.sourceSpan).toBeDefined();
  });

  test('בעיה ללא מיקום (כישלון מתאם) — לחיצה אינה בוחרת כלום בעורך', () => {
    useEditorStore.getState().setText(SOURCE_OK);
    reportImportFailure('errors.import.SAMPLE_UNAVAILABLE', { path: 'x.txt' });
    const { container } = render(createElement('div', null, createElement(ImportInsights), createElement(TextEditor)));
    const failure = container.querySelector('[data-testid="insights-import-failure"]');
    expect(failure).not.toBeNull();
    expect(failure?.textContent).toContain('x.txt'); // הפרמטר מוצג דרך התווית
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    expect(editor.selectionStart).toBe(editor.selectionEnd); // שום בחירה
  });

  test('כישלון מתאם לא מחליף מסמך — המקור והשם נשארים; הכישלון מוצג', () => {
    useEditorStore.getState().setDocumentName('נוכחי.txt');
    useEditorStore.getState().setText(SOURCE_OK);
    const beforeRevision = useEditorStore.getState().revision;
    reportImportFailure('errors.import.UNSUPPORTED_FORMAT', { extension: 'pdf' });
    const s = useEditorStore.getState();
    expect(s.rawText).toBe(SOURCE_OK);
    expect(s.documentName).toBe('נוכחי.txt');
    expect(s.revision).toBe(beforeRevision); // שום מהדורה לא הוקפצה
    const { container } = render(createElement(ImportInsights));
    const failure = container.querySelector('[data-testid="insights-import-failure"]');
    expect(failure?.textContent).toContain('pdf');
  });

  test('שגיאת פרסור חוסמת — מוצגת עם מיקום ומקוט; לחיצה מדגישה את התו האסור', () => {
    const src = 'שם הספר - ב\n\nכותרת 1 מספר 1 - פרק\nטקסט עם \u0001 sentinel\n';
    importDocumentText(src, 'פגום.txt', 'text-file');
    const { container } = render(createElement('div', null, createElement(ImportInsights), createElement(TextEditor)));
    const err = container.querySelector('[data-testid="insights-parse-error"]');
    expect(err).not.toBeNull();
    expect(err?.textContent).toContain('הריצה חסומה');
    expect(err?.textContent).toMatch(/שורה 4/);
    fireEvent.click(err as HTMLElement);
    const editor = container.querySelector('[data-testid="source-editor"]') as HTMLTextAreaElement;
    expect(editor.value.slice(editor.selectionStart, editor.selectionEnd)).toContain('\u0001');
  });

  test('טריות — עריכה אחרי הניתוח ⇐ "איננה עדכנית"; הניתוח עצמו לא נזרק', async () => {
    importDocumentText(SOURCE_OK, 'טריות.txt', 'text-file');
    const { container } = render(createElement(ImportInsights));
    expect(container.querySelector('[data-testid="insights-stale"]')).toBeNull();
    act(() => {
      useEditorStore.getState().setText(SOURCE_OK + 'שורה נוספת\n');
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="insights-stale"]')).not.toBeNull();
    });
    // המפה עדיין מוצגת — המסמך לא נעלם, רק מסומן כלא-עדכני
    expect(container.querySelector('[data-testid="insights-overview"]')).not.toBeNull();
  });

  test('ייבוא מסמך חדש מנקה את הניתוח הקודם — אין מפה של מסמך קודם על מסמך חדש', () => {
    importDocumentText('שם הספר - ראשון\n\nכותרת 1 מספר 1 - א\nטקסט.\n', 'א.txt', 'text-file');
    expect(useEditorStore.getState().analysis?.documentName).toBe('א.txt');
    importDocumentText(SOURCE_OK, 'ב.txt', 'text-file');
    const s = useEditorStore.getState();
    expect(s.analysis?.documentName).toBe('ב.txt');
    expect(s.analysis?.analyzedRevision).toBe(s.revision); // טרי
    expect(s.importIssue).toBeNull();
  });

  test('הניתוח קפוא — החנקה נכשלת (אין מצב שמשנים מתחת לרגלי ה-UI)', () => {
    importDocumentText(SOURCE_OK, 'קפוא.txt', 'text-file');
    const analysis = useEditorStore.getState().analysis;
    expect(analysis).not.toBeNull();
    expect(Object.isFrozen(analysis)).toBe(true);
    expect(Object.isFrozen(analysis?.issues)).toBe(true);
  });

  test('setImportAnalysis מנקה importIssue — הודעת כישלון ישנה לא נשארת אחרי ייבוא מוצלח', () => {
    reportImportFailure('errors.import.UNSUPPORTED_FORMAT', { extension: 'exe' });
    expect(useEditorStore.getState().importIssue).not.toBeNull();
    importDocumentText(SOURCE_OK, 'אחרי-כישלון.txt', 'text-file');
    expect(useEditorStore.getState().importIssue).toBeNull();
  });

  test('הניתוח אינו נכתב לאחסון — נגזרת, לא מסמך (חוזה ההשמירה של שלב 76)', () => {
    importDocumentText(SOURCE_OK, 'אחסון.txt', 'text-file');
    // readJson מהערוץ הפעיל — מה שנשמר הוא rawText+documentName בלבד
    const persisted = readJson<Record<string, unknown>>(STORAGE_KEYS.editor, {});
    expect(Object.keys(persisted).sort()).toEqual(['documentName', 'rawText']);
    expect(persisted.documentName).toBe('אחסון.txt');
  });

  test('מקור הבדיקה של ההדגשה: analyzeSource והרכיב מסכימים על אותו מיקום', () => {
    const src = 'שם הספר - ב\n\nכותרת 1 מספר 1 - פרק\nטקסט הגוף.\n\nכותרת 7 מספר 3 - הערה\n';
    const { analysis } = analyzeSource({ source: src, documentId: 'x', revision: 1, documentName: '' });
    const issue = analysis.issues[0];
    expect(issue.startUtf16).not.toBeNull();
    // ההיסט בתוך גבולות המקור שבעורך
    expect(issue.startUtf16 as number).toBeLessThan(src.length);
    expect(src.slice(issue.startUtf16 as number, (issue.startUtf16 as number) + 8)).toContain('כותרת 7');
  });
});
