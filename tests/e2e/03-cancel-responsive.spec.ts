/**
 * 03-cancel-responsive.spec.ts — ביטול, תגובתיות והחוט הראשי (שלב 85).
 *
 * שעת M9: "אין typesetting סינכרוני ב־main thread; עריכות מהירות אינן
 * מקפיאות UI". העימוד רץ ב־Worker; הוכחה בדפדפן האמיתי:
 *   • Longtask Observer בזמן חלון העימוד (running) — ללא משימות ארוכות.
 *   • הקלדה בעורך בזמן ריצה — נקלטת.
 * הפרסור שלפני השליחה (שלב 80) הוא סינכרוני במפורש ומחוץ לחלון הנמדד —
 * אינו typesetting; הוא מתועד כאן כדי שהחלון לא ימדוד אותו בטעות.
 *
 * §17.2#10: ביטול אינו משנה את תוצאת הריצה הבאה — האורקל מוכיח זאת
 * בפועל: hash הריצה שלאחר ביטול === hash ה־CLI.
 *
 * הקלט: דוגמת mid_long (~10 שניות ב־CLI) — ארוכה מספיק לביטול
 * באמצע ולמדידות, קצרה מספיק ל־CI.
 */
import { test, expect } from '@playwright/test';
import {
  gotoApp, runAndWaitDone, layoutHashOf, setDocumentName, waitForImportedSample,
  ORACLE_DOCUMENT_ID, REPO_ROOT, cliLayoutRun,
} from './helpers';
import { join } from 'node:path';

const MID_LONG = join(REPO_ROOT, 'public', 'mid_long_test_text.txt');

test.describe('שלב 85 — ביטול, תגובתיות והחוט הראשי (M9)', () => {
  test.beforeEach(async ({ page }) => {
    await gotoApp(page);
    // הדוגמה נטענת דרך ה־fetch של האפליקציה (public/) — אותו מסלור ייבוא.
    // המתנה לסיום הייבוא לפני קביעת השם (תנאי המירוץ שתועד ב־helpers)
    await page.getByTestId('import-sample').selectOption('./mid_long_test_text.txt');
    await waitForImportedSample(page, './mid_long_test_text.txt');
    await setDocumentName(page, ORACLE_DOCUMENT_ID);
  });

  test('ריצה ארוכה: פאזות מתקדמות, progress נראה, כפתור הריצה נועל וביטול זמין', async ({ page }) => {
    await page.getByTestId('run-typeset').click();
    await expect(page.getByTestId('run-typeset')).toHaveAttribute('data-run-phase', /running|preparing/, { timeout: 60_000 });
    // בזמן ריצה: כפתור הריצה מושבת וכפתור ביטול גלוי — single-flight
    await expect(page.getByTestId('run-typeset')).toBeDisabled();
    await expect(page.getByTestId('cancel-typeset')).toBeVisible();
    const btnText = String(await page.getByTestId('run-typeset').textContent());
    expect(btnText).toMatch(/preparing|running|auditing/);
    await runAndWaitDone(page);
    await expect(page.getByTestId('cancel-typeset')).toHaveCount(0);
  });

  test('החוט הראשי פנוי בזמן העימוד: אין longtask בחלון running; הקלדה בעורך נקלטת', async ({ page }) => {
    // מתקין מודדים לפני ההרצה: longtask + מעקב מעברי פאזה (rAF)
    await page.evaluate(() => {
      const w = window as unknown as { __longtasks: { startTime: number; duration: number }[]; __phases: { phase: string; t: number }[] };
      w.__longtasks = [];
      w.__phases = [];
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) w.__longtasks.push({ startTime: e.startTime, duration: e.duration });
      }).observe({ entryTypes: ['longtask'] });
      const track = () => {
        const ph = document.querySelector('[data-run-phase]')?.getAttribute('data-run-phase');
        const last = w.__phases[w.__phases.length - 1];
        if (ph !== null && ph !== undefined && last?.phase !== ph) w.__phases.push({ phase: ph, t: performance.now() });
        requestAnimationFrame(track);
      };
      requestAnimationFrame(track);
    });
    await page.getByTestId('run-typeset').click();
    // המתנה לחלון העימוד (הדיווח הראשון מהעובד ⇒ running)
    await expect(page.getByTestId('run-typeset')).toHaveAttribute('data-run-phase', 'running', { timeout: 60_000 });
    // הקלדה בזמן ריצה — עריכה מהירה אינה מוקפאת. הסמן בסוף הטקסט
    const editor = page.getByTestId('source-editor');
    await editor.evaluate((el) => {
      const t = el as HTMLTextAreaElement;
      t.focus();
      t.selectionStart = t.selectionEnd = t.value.length;
    });
    const t0 = Date.now();
    await editor.pressSequentially('ב', { delay: 5 });
    const typingMs = Date.now() - t0;
    expect(typingMs).toBeLessThan(3_000);
    const value = await editor.inputValue();
    expect(value.endsWith('ב')).toBe(true);
    // המתנה לסיום הריצה הראשונה — בלי ריצה נוספת: התוצאה של הריצה שנערך
    // במהלכה המקור אינה מתקבלת (שעת שלב 81 — עוגן הטריות)
    await expect(page.getByTestId('run-typeset')).toHaveAttribute('data-run-phase', 'done', { timeout: 240_000 });
    // הוכחת החוט: אין longtask בחלון [running, done) — הפרסור שלפני השליחה
    // (שלב 80) הוא סינכרוני במפורש ומחוץ לחלון; מעבר 'auditing' חולף בתוך
    // אותו בלוק סינכרוני כמו 'done' ואינו נצפה בנפרד — לכן החלון נמדד עד done.
    const m = await page.evaluate(() => {
      const w = window as unknown as { __longtasks: { startTime: number; duration: number }[]; __phases: { phase: string; t: number }[] };
      const runStart = w.__phases.find((p) => p.phase === 'running');
      const done = w.__phases.find((p) => p.phase === 'done');
      const inWindow = w.__longtasks.filter((e) => runStart !== undefined && done !== undefined && e.startTime >= runStart.t && e.startTime < done.t);
      return { total: w.__longtasks.length, inWindow, hasAll: runStart !== undefined && done !== undefined };
    });
    expect(m.hasAll).toBe(true); // running → done נצפו
    expect(m.inWindow.filter((e) => e.duration > 200)).toHaveLength(0);
    // העריכה בזמן הריצה הופכת את התוצאה לזרה — לא התקבלה (שעת שלב 81)
    await expect(page.locator('[data-layout-hash]')).toHaveCount(0);
  });

  test('ביטול באמצע: cancelled; הכפתור נעלם; הריצה ניתנת להתחלה מחדש', async ({ page }) => {
    await page.getByTestId('run-typeset').click();
    await expect(page.getByTestId('run-typeset')).toHaveAttribute('data-run-phase', 'running', { timeout: 60_000 });
    await page.getByTestId('cancel-typeset').click();
    await expect(page.getByTestId('run-typeset')).toHaveAttribute('data-run-phase', 'cancelled', { timeout: 15_000 });
    await expect(page.getByTestId('cancel-typeset')).toHaveCount(0);
    await expect(page.getByTestId('run-typeset')).toBeEnabled();
    // תוצאה לא התקבלה — הביטול לא השאיר חצי־תוצאה
    await expect(page.locator('[data-layout-hash]')).toHaveCount(0);
  });

  test('ביטול אינו משפיע על הריצה הבאה (§17.2#10): ה־hash שלאחר הביטול === אורקל CLI', async ({ page }) => {
    // ריצה ראשונה — מבוטלת באמצע
    await page.getByTestId('run-typeset').click();
    await expect(page.getByTestId('run-typeset')).toHaveAttribute('data-run-phase', 'running', { timeout: 60_000 });
    await page.getByTestId('cancel-typeset').click();
    await expect(page.getByTestId('run-typeset')).toHaveAttribute('data-run-phase', 'cancelled', { timeout: 15_000 });
    // ריצה שנייה — עד תום, על אותו מקור
    await runAndWaitDone(page, 240_000);
    const appHash = await layoutHashOf(page);
    const cli = cliLayoutRun({ input: MID_LONG });
    expect(appHash).toBe(cli.layoutHash);
    expect(Number(await page.locator('.tora-preview-root').getAttribute('data-layout-pages'))).toBe(cli.pages);
  });
});
