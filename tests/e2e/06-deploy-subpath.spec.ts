/**
 * 06-deploy-subpath.spec.ts — רגרסיית הפריסה בתת־נתיב (GitHub Pages).
 *
 * שורש התקלה שנתפס באתר החי (בדיקת-עין של המשתמש: "ניסיתי לעמד
 * באתר החי של פייג'ס, ולא הצלחתי"): צרור הנכסים נטען מנתיב שורש
 * מוחלט (‎/fonts/manifest.json ⇒ שורש הדומיין) — בתת־הנתיב של Pages
 * זה 404, ההעמדה נחסמה בשקט (הבטחה נטושה; הפאזה נשארה idle) והכפתור
 * "לא עשה כלום". ה-E2E של שלב 85 לא תפס זאת כי ‎vite preview מגיש
 * בשורת הדומיין, שבה נתיב מוחלט עובד.
 *
 * מה ננעל כאן — שתי בדיקות:
 *   1. הרצה מלאה מתת־הנתיב: אפס כשלי נכסים (4xx/5xx) מתחת לקידומת,
 *      העמדה עד done עם layoutHash מלא, וטעינת גופן אמיתית דרך
 *      fonts.css (document.fonts.check — נועל את הנתיבים היחסיים ב-CSS).
 *   2. כישלון צרור גלוי ומתאושש: חסימת המניפסט ⇒ פאזת error עם הקוד
 *      הקטלוגי ב-UI (לא כפתור אילם) ⇒ ביטול החסימה ולחיצה חוזרת
 *      מצליחה (אין הבטחה דחויה כלואה בזמן־הריצה).
 *
 * אין צילומי מסך ואין sleeps (כללי הסוויטה; ההמתנה רק על תנאי נצפה).
 */
import { expect, test } from '@playwright/test';
import { layoutHashOf, runAndWaitDone, waitForImportedSample } from './helpers.js';

const SUBPATH = '/Tora_Book_Typesetter_React';
const APP_URL = `http://localhost:4174${SUBPATH}/`;
const SAMPLE = './widow-orphan.txt';

test('העמדה מלאה מתת־נתיב (כמו GitHub Pages) — אפס כשלי נכסים, עד done ו-layoutHash', async ({ page }) => {
  const failedAssets: string[] = [];
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes(`${SUBPATH}/`) && res.status() >= 400 && !/favicon/.test(url)) {
      failedAssets.push(`${res.status()} ${url}`);
    }
  });

  await page.goto(APP_URL);
  await expect(page.getByTestId('run-typeset')).toHaveAttribute('data-run-phase', 'idle');

  // דוגמה דרך ה-select — fetch יחסי למסמך, מתחת לקידומת
  await page.selectOption('[data-testid="import-sample"]', SAMPLE);
  await waitForImportedSample(page, SAMPLE);

  // ההעמדה עצמה — הצרור (מניפסט+גופן+wasm+מפענחן) חייב להיטען מתת־הנתיב
  await runAndWaitDone(page);
  const hash = await layoutHashOf(page);
  expect(hash).toMatch(/^[0-9a-f]{64}$/);

  // הגופן האמיתי נטען דרך fonts.css היחסי (תיקון הנתיבים ב-CSS):
  // אם ה-@font-face מצביע לשורש הדומיין — הבדיקה נכשלת כאן.
  const frankLoaded = await page.evaluate(async () => {
    try {
      await document.fonts.load("16px 'FrankRuehl'");
      return document.fonts.check("16px 'FrankRuehl'");
    } catch {
      return false;
    }
  });
  expect(frankLoaded).toBe(true);

  // אפס כשלי נכסים מתחת לקידומת — ה-404 של המניפסט/הגופנים הוא בדיוק
  // התקלה שנתפסה בייצור.
  expect(failedAssets).toEqual([]);
});

test('כישלון צרור הנכסים גלוי ב-UI — פאזת error עם קוד קטלוגי, והתאוששות בלחיצה חוזרת', async ({ page }) => {
  // המניפסט נחסם — כישלון רשת מבוקר, בדיוק כמו 404 בייצור הישן
  await page.route(`**${SUBPATH}/fonts/manifest.json`, (route) =>
    route.fulfill({ status: 404, body: 'not found' }),
  );

  await page.goto(APP_URL);
  await page.selectOption('[data-testid="import-sample"]', SAMPLE);
  await waitForImportedSample(page, SAMPLE);

  // הלחיצה חייבת להניב שגיאה גלויה — לא idle שקט (התנהגות האתר החי הישן)
  await page.getByTestId('run-typeset').click();
  await expect(page.getByTestId('run-typeset')).toHaveAttribute('data-run-phase', 'error', { timeout: 30_000 });
  const shownCode = await page.locator('[data-error-code]').first().getAttribute('data-error-code');
  expect(shownCode).toBe('errors.assets.MANIFEST_UNREADABLE');

  // התאוששות: ביטול החסימה ← לחיצה חוזרת בונה את זמן־הריצה מחדש
  // (אין דחייה כלואה במטמון) וההעמדה מסתיימת בהצלחה
  await page.unroute(`**${SUBPATH}/fonts/manifest.json`);
  await page.getByTestId('run-typeset').click();
  await runAndWaitDone(page);
  const hash = await layoutHashOf(page);
  expect(hash).toMatch(/^[0-9a-f]{64}$/);
});
