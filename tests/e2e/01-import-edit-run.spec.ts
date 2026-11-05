/**
 * 01-import-edit-run.spec.ts — זרימות הייבוא, העריכה וההרצה (שלב 85; אפיון
 * §17.1: "edit→run", §13–14). הכל דרך ה־UI האמיתי: filechooser, עורך,
 * חמשת ה־stores וה־Worker — אין הזרקות.
 *
 * שגיאות מתורגמות (שעת M9): כישלון ייבוא ושגיאת פרסור מוצגים בעברית מהקטלוג
 * הסגור (§16) — עם הפרמטרים בפנים, לא קוד גולם.
 */
import { test, expect } from '@playwright/test';
import {
  gotoApp, importTextViaChooser, writeTemp, runAndWaitDone, expectRunBlocked,
  REFERENCE_SOURCE, OVERFLOW_TEXT, PARSE_ERROR_TEXT,
} from './helpers';

test.describe('שלב 85 — ייבוא, עריכה והרצה (M9)', () => {
  test('ייבוא קובץ טקסט: המקור נכנס לעורך, השם נקבע, הסקירה מופיעה והריצה זמינה', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await expect(page.getByTestId('source-editor')).toHaveValue(/פרק/, { timeout: 10_000 });
    const editorText = await page.getByTestId('source-editor').inputValue();
    expect(editorText.length).toBeGreaterThan(50);
    await expect(page.getByTestId('document-name')).toHaveValue('reference-source.txt');
    await expect(page.getByTestId('import-insights')).toBeVisible();
    // סקירת המסמך (שלב 80) נוכחת כבר לפני הריצה הראשונה
    await expect(page.getByTestId('insights-overview')).toBeVisible();
    // אין תוצאה עדיין — הריצה היא פעולה מפורשת (§12.1)
    await expect(page.locator('[data-layout-hash]')).toHaveCount(0);
    await expect(page.getByTestId('run-typeset')).toBeEnabled();
  });

  test('ריצה מלאה: done; מספר העמודים בפריסה = מונה ה־IR; hash מלא נגיש ב־UI', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await runAndWaitDone(page);
    const pagesAttr = await page.locator('.tora-preview-root').getAttribute('data-layout-pages');
    expect(Number(pagesAttr)).toBeGreaterThanOrEqual(1);
    // המונה שבפס הכלים של התצוגה נגזר מאותו IR — שני הצדדים נבדקים בנפרד
    // (הכלי מציג "N עמודים"): לקיחה ישירה של הטקסט מהפס
    const toolbar = await page.locator('.bg-white.border-b').filter({ hasText: 'עמודים' }).first().textContent();
    expect(String(toolbar)).toContain(`${pagesAttr} עמודים`);
    const hash = await page.locator('[data-layout-hash]').getAttribute('data-layout-hash');
    expect(String(hash)).toMatch(/^[0-9a-f]{64}$/);
    // ההיטל מציג בפועל את העמודים (וירטואליזציה — לפחות עמוד גלוי אחד)
    await expect(page.locator('[data-virtual-page-index="0"]')).toBeVisible();
  });

  test('עריכה מסמנת dirty ומיישנת את התוצאה עד ריצה חוזרת', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await runAndWaitDone(page);
    const hashBefore = await page.locator('[data-layout-hash]').getAttribute('data-layout-hash');
    await page.getByTestId('source-editor').click();
    await page.getByTestId('source-editor').pressSequentially(' שורה נוספת', { delay: 10 });
    // dirty + הפריסה איננה עדכנית (שער הטריות של שלב 81)
    await expect(page.getByTestId('preview-stale')).toBeVisible();
    // ה־hash של התוצאה המתקבלת נותר של הריצה הקודמת — העריכה לא זלגה למודל
    await expect(page.locator('[data-layout-hash]')).toHaveAttribute('data-layout-hash', String(hashBefore));
    await runAndWaitDone(page);
    await expect(page.getByTestId('preview-stale')).toHaveCount(0);
    const hashAfter = await page.locator('[data-layout-hash]').getAttribute('data-layout-hash');
    expect(String(hashAfter)).not.toBe(String(hashBefore)); // מקור שונה ⇒ פריסה שונה
  });

  test('מעבר בין מסמכים: ייבוא שני מנקה את התוצאה הקודמת — אין הצגת תוצאה ישנה', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await runAndWaitDone(page);
    expect(await page.locator('[data-layout-hash]').count()).toBe(1);
    // מסמך שני — טקסט שונה לחלוטין
    await importTextViaChooser(page, writeTemp('second-doc.txt', 'פרק שני\n\n' + OVERFLOW_TEXT));
    await expect(page.locator('[data-layout-hash]')).toHaveCount(0);
    await expect(page.getByTestId('run-typeset')).toBeEnabled();
    await runAndWaitDone(page);
    expect(await page.locator('[data-layout-hash]').count()).toBe(1);
  });

  test('כישלון ייבוא מתורגם: פורמט לא נתמך בעברית עם הסיומת; אינו מחליף מסמך', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await expect(page.getByTestId('source-editor')).toHaveValue(/פרק/);
    const before = await page.getByTestId('source-editor').inputValue();
    // קובץ שאינו טקסט — הקלסיפיקציה לפי תכונות הקובץ, לא לפי message גולם (§16)
    const chooserP = page.waitForEvent('filechooser');
    await page.getByTestId('import-text').click();
    const chooser = await chooserP;
    await chooser.setFiles({ name: 'corrupt.bin', mimeType: 'application/octet-stream', buffer: Buffer.from('not text') });
    const failure = page.getByTestId('insights-import-failure');
    await expect(failure).toBeVisible();
    const text = String(await failure.textContent());
    expect(text).toContain('פורמט קובץ לא נתמך');
    expect(text).toContain('bin');
    expect(text).toMatch(/[\u0590-\u05FF]/); // עברית — שגיאה מתורגמת, לא קוד גולם
    // המסמך לא הוחלף — המקור נשאר
    await expect(page.getByTestId('source-editor')).toHaveValue(before);
  });

  test('שגיאת פרסור חוסמת ריצה: מוצגת עם מיקום; לחיצה מדגישה את התו האסור בעורך', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, writeTemp('broken.txt', PARSE_ERROR_TEXT));
    const err = page.getByTestId('insights-parse-error');
    await expect(err).toBeVisible();
    const text = String(await err.textContent());
    expect(text).toContain('הריצה חסומה');
    expect(text).toMatch(/שורה \d/);
    expect(text).toMatch(/[\u0590-\u05FF]/); // מתורגם
    // לחיצה מדגישה את התו האסור — הבחירה בעורך האמיתי
    await err.click();
    const sel = await page.getByTestId('source-editor').evaluate((el) => {
      const t = el as HTMLTextAreaElement;
      return { start: t.selectionStart, end: t.selectionEnd };
    });
    const sentinelIdx = PARSE_ERROR_TEXT.indexOf('\u0001');
    expect(sentinelIdx).toBeGreaterThan(0);
    expect(sel.start).toBeLessThanOrEqual(sentinelIdx);
    expect(sel.end).toBeGreaterThan(sentinelIdx);
    // והריצה חסומה — אין job, הפאזה נשארת idle (אין "כמעט תקין")
    await expectRunBlocked(page);
  });
});
