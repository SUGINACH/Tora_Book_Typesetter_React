/**
 * 04-audit-navigation.spec.ts — ממצאי Audit והניווט אליהם בדפדפן האמיתי
 * (שלב 85; ממשיך שלב 82 ברמת ה־E2E).
 *
 * הקלט: טקסט עם מילה בלתי־שבירה של 300 אותיות — מכריח ממצא HIGH יחיד
 * (LINE_RUN_OVERFLOW) עם span; נבדק מול ה־CLI שהממצא אכן מופק בריצה
 * הזו (מספר הממצאים זהה משני הצדדים).
 *
 * ניווט: קליק על שורת ממצא בוחר בדיוק את טווח המקור בעורך האמיתי
 * (setSelectionRange) — הטווח נמדד מהקלט עצמו, לא מה־UI.
 */
import { test, expect } from '@playwright/test';
import {
  gotoApp, importTextViaChooser, writeTemp, runAndWaitDone, setDocumentName,
  OVERFLOW_TEXT, OVERFLOW_LONG_WORD, ORACLE_DOCUMENT_ID, cliLayoutRun,
} from './helpers';

test.describe('שלב 85 — ממצאי Audit וניווט (M9)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    const doc = writeTemp('overflow-doc.txt', OVERFLOW_TEXT);
    await importTextViaChooser(page, doc);
    await setDocumentName(page, ORACLE_DOCUMENT_ID);
    await runAndWaitDone(page);
  });

  test('ממצא HIGH מוצג עם ספירות לפי חומרה; מספרו זהה לאורקל CLI', async ({ page }) => {
    // האורקל: אותו תוכן ב־CLI מפיק בדיוק ממצא HIGH אחד (מסלול אחר, אותו מודל)
    const cli = cliLayoutRun({ input: writeTemp('overflow-doc.txt', OVERFLOW_TEXT) });
    expect(cli.findings).toHaveLength(1);
    expect(cli.findings[0]?.severity).toBe('HIGH');
    // האפליקציה: הפאנל מציג אותו ממצא — ספירת הכולל והשורה
    await expect(page.getByTestId('audit-findings')).toBeVisible();
    await expect(page.getByTestId('audit-counts')).toContainText('1 ממצאים');
    const rows = page.locator('[data-testid^="audit-row-"]');
    await expect(rows).toHaveCount(1);
    const rowText = String(await rows.first().textContent());
    expect(rowText).toContain('LINE_RUN_OVERFLOW'); // הקוד — תמיד לטיני, לא מתורגם
    expect(rowText).toMatch(/[\u0590-\u05FF]/); // התווית — מתורגמת מקטלוג audit-labels
  });

  test('ניווט: קליק על שורת הממצא בוחר בדיוק את טווח המילה הארוכה בעורך', async ({ page }) => {
    await page.locator('[data-testid^="audit-row-"]').first().click();
    const sel = await page.getByTestId('source-editor').evaluate((el) => {
      const t = el as HTMLTextAreaElement;
      return { start: t.selectionStart, end: t.selectionEnd };
    });
    const value = await page.getByTestId('source-editor').inputValue();
    const wordStart = value.indexOf(OVERFLOW_LONG_WORD);
    expect(wordStart).toBeGreaterThan(0);
    // הטווח שנבחר הוא בדיוק טווח המילה הבלתי־שבירה — לא "בערך"
    expect(sel.start).toBe(wordStart);
    expect(sel.end).toBe(wordStart + OVERFLOW_LONG_WORD.length);
  });

  test('מסנן חומרה: הצגה מצטמצמת לפי החומרה שנבחרה', async ({ page }) => {
    // מסנן LOW — אין ממצאי LOW בקלט הזה ⇒ רשימה ריקה עם הודעת ריק
    await page.getByTestId('audit-filter-low').click();
    await expect(page.getByTestId('audit-empty-filtered')).toBeVisible();
    await expect(page.locator('[data-testid^="audit-row-"]')).toHaveCount(0);
    // חזרה ל־HIGH — השורה חוזרת; אין מחיקה של הממצא עצמו
    await page.getByTestId('audit-filter-high').click();
    await expect(page.locator('[data-testid^="audit-row-"]')).toHaveCount(1);
  });

  test('עריכה לאחר ריצה: הממצאים מסומנים בלתי־עדכניים והניווט מושהה', async ({ page }) => {
    const editor = page.getByTestId('source-editor');
    await editor.evaluate((el) => {
      const t = el as HTMLTextAreaElement;
      t.focus();
      t.selectionStart = t.selectionEnd = t.value.length;
    });
    await editor.pressSequentially(' תוספת', { delay: 5 });
    await expect(page.getByTestId('audit-stale')).toBeVisible();
    await expect(page.getByTestId('preview-stale')).toBeVisible();
    // הניווט מושהה: השורה מושבתת (disabled) — אין קליק על תוצאה מיושנת
    const row = page.locator('[data-testid^="audit-row-"]').first();
    await expect(row).toBeDisabled();
    // הבחירה בעורך נותרת מכווצת בסוף הטקסט — שום טווח לא נבחר
    const sel = await page.getByTestId('source-editor').evaluate((el) => {
      const t = el as HTMLTextAreaElement;
      return { start: t.selectionStart, end: t.selectionEnd };
    });
    expect(sel.end).toBe(sel.start);
  });

  test('ריצה חוזרת לאחר עריכה: הסמנים יורדים והניווט חוזר לעבוד', async ({ page }) => {
    const editor = page.getByTestId('source-editor');
    await editor.evaluate((el) => {
      const t = el as HTMLTextAreaElement;
      t.focus();
      t.selectionStart = t.selectionEnd = t.value.length;
    });
    await editor.pressSequentially(' תוספת', { delay: 5 });
    await expect(page.getByTestId('audit-stale')).toBeVisible();
    await runAndWaitDone(page);
    await expect(page.getByTestId('audit-stale')).toHaveCount(0);
    await expect(page.getByTestId('preview-stale')).toHaveCount(0);
    await page.locator('[data-testid^="audit-row-"]').first().click();
    const value = await page.getByTestId('source-editor').inputValue();
    const wordStart = value.indexOf(OVERFLOW_LONG_WORD);
    const sel = await page.getByTestId('source-editor').evaluate((el) => {
      const t = el as HTMLTextAreaElement;
      return { start: t.selectionStart, end: t.selectionEnd };
    });
    expect(sel.start).toBe(wordStart);
    expect(sel.end).toBe(wordStart + OVERFLOW_LONG_WORD.length);
  });
});
