/**
 * 05-export-visual.spec.ts — פעולת הייצוא הנוכחית, סביבה נעולה ובדיקות
 * ויזואליות להיטל בלבד (שלב 85; אפיון §17.1: "Visual — Playwright נעול:
 * פגמי projection ו־UI, לא נכונות האלגוריתם לבדו").
 *
 * כלל השלב: אין קביעת נכונות שבירה לפי screenshot בלבד — הצילומים כאן
 * מוכיחים **דטרמיניזם תצוגתי** (שתי ריצות מלאות ⇒ פיקסלים זהים) ורגישות
 * לזום; הנכונות עצמה מגיעה מהמודל (hash/IR — מפרט 02).
 *
 * ייצוא (§17.1: "export"): משלב 86 המסלול הסמכותי הוא היטל HTML טהור
 * מה-IR (render-html) — Blob מבלי לגעת בהיטל החי; window.print הוסר
 * מהמעטפת. הבדיקה נועלת את השער: מושבת בלי תוצאה, Blob text/html
 * נוצר פעם אחת מהכפתור, ו-window.print אינו נקרא לעולם.
 */
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import {
  gotoApp, importTextViaChooser, runAndWaitDone, layoutHashOf, setDocumentName,
  REFERENCE_SOURCE, ORACLE_DOCUMENT_ID, APP_URL, REPO_ROOT,
} from './helpers';

/** מסמך רב־עמודים קטן (18 עמודים) — לבדיקת הווירטואליזציה בפועל. */
const MULTI_PAGE = join(REPO_ROOT, 'test-triggers', 'test-all-triggers.txt');

test.describe('שלב 85 — ייצוא, ויזואלי נעול ורשת (M9)', () => {
  test('פעולת הייצוג נעולה על תוצאה קיימת: מושבת בלי תוצאה, מופעלת אחרי ריצה', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await expect(page.getByTestId('export-html')).toBeDisabled();
    await runAndWaitDone(page);
    await expect(page.getByTestId('export-html')).toBeEnabled();
  });

  test('הייצוא הוא היטל טהור: Blob‏ text/html נוצר פעם אחת; window.print אינו נקרא (שלב 86)', async ({ page }) => {
    // סטאב לפני טעינת האפליקציה: סופרים את ה-Blobs שנוצרים ואוכפים
    // ש-window.print לא ייקרא לעולם — המסלול הסמכותי הוא render-html מה-IR.
    await page.addInitScript(() => {
      const w = window as unknown as { __printCalls: number; __exportBlobs: { size: number; type: string }[] };
      w.__printCalls = 0;
      w.__exportBlobs = [];
      window.print = () => { w.__printCalls += 1; };
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (b: Blob) => {
        w.__exportBlobs.push({ size: b.size, type: b.type });
        return orig(b);
      };
    });
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await runAndWaitDone(page);
    await page.getByTestId('export-html').click();
    await page.evaluate(() => new Promise<void>((res) => requestAnimationFrame(() => res())));
    const state = await page.evaluate(() => {
      const w = window as unknown as { __printCalls: number; __exportBlobs: { size: number; type: string }[] };
      return { printCalls: w.__printCalls, blobs: w.__exportBlobs };
    });
    expect(state.printCalls).toBe(0);
    expect(state.blobs.length).toBe(1);
    expect(state.blobs[0]?.type.startsWith('text/html')).toBe(true);
    expect((state.blobs[0]?.size ?? 0)).toBeGreaterThan(1000);
  });

  test('ויזואלי (סביבה נעולה): שתי ריצות מלאות ⇒ פיקסלים זהים ביט־ביט', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await setDocumentName(page, ORACLE_DOCUMENT_ID);
    await runAndWaitDone(page);
    const hash1 = await layoutHashOf(page);
    await expect(page.locator('[data-virtual-page-index="0"]')).toBeVisible();
    const shot1 = await page.getByTestId('preview-scroll').screenshot();

    // מחזור שני מלא: ריעול העמוד, ייבוא וריצה מחדש — אותו מקור, אותן הגדרות
    await page.reload();
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await setDocumentName(page, ORACLE_DOCUMENT_ID);
    await runAndWaitDone(page);
    const hash2 = await layoutHashOf(page);
    expect(hash2).toBe(hash1); // המודל זהה
    await expect(page.locator('[data-virtual-page-index="0"]')).toBeVisible();
    const shot2 = await page.getByTestId('preview-scroll').screenshot();
    // דטרמיניזם תצוגתי: אותו hash ⇒ אותם פיקסלים (דפדפן נעול, גופנים מקומיים)
    expect(shot1.equals(shot2)).toBe(true);
  });

  test('זום משנה היטל בלבד: הסקייל מכפיל, המודל קבוע, הצילום מגיב', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await runAndWaitDone(page);
    const hash = await layoutHashOf(page);
    const base = await page.getByTestId('preview-scroll').screenshot();
    for (let i = 0; i < 10; i += 1) await page.getByTestId('zoom-in').click();
    // הסקייל בפועל ~×2 (צעדים של 0.1)
    const scale = await page.locator('.tora-preview-root').evaluate((el) => {
      const m = getComputedStyle(el).transform.match(/matrix\(([\d.]+),/);
      return m === null ? null : Number(m[1]);
    });
    expect(scale).not.toBeNull();
    expect(Number(scale)).toBeGreaterThan(1.9);
    // המודל לא זז: אותו hash, אותו מספר עמודים (§17.2#5)
    expect(await layoutHashOf(page)).toBe(hash);
    const zoomed = await page.getByTestId('preview-scroll').screenshot();
    expect(base.equals(zoomed)).toBe(false); // ההיטל מגיב — ערוץ התצוגה חי
    await page.getByTestId('zoom-reset').click();
    const back = await page.getByTestId('preview-scroll').screenshot();
    expect(base.equals(back)).toBe(true); // חזרה מדויקת — הזום הפיך
  });

  test('וירטואליזציה בפועל: viewport קטן ⇒ טווח מצטמצם, פסי ריווח, מודל קבוע', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, MULTI_PAGE); // 18 עמודים — יש מה להסתיר
    await runAndWaitDone(page);
    const pages = Number(await page.locator('.tora-preview-root').getAttribute('data-layout-pages'));
    expect(pages).toBeGreaterThanOrEqual(8);
    await page.setViewportSize({ width: 480, height: 420 });
    const range = await page.locator('.tora-preview-root').getAttribute('data-virtual-range');
    expect(String(range)).not.toBe('full');
    const [first, last] = String(range).split('-').map(Number);
    expect(first).toBe(0);
    expect(last).toBeLessThan(pages - 1); // לא הכל מוצג
    await expect(page.getByTestId('preview-spacer-bottom')).toBeVisible();
    expect(Number(await page.locator('.tora-preview-root').getAttribute('data-layout-pages'))).toBe(pages);
  });

  test('אין רשת חיצונית: כל הבקשות בסשן הן same-origin (גופנים ונכסים מקומיים)', async ({ page }) => {
    const urls: string[] = [];
    page.on('request', (r) => urls.push(r.url()));
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await runAndWaitDone(page);
    for (let i = 0; i < 10; i += 1) await page.getByTestId('zoom-in').click();
    await page.getByTestId('zoom-reset').click();
    expect(urls.length).toBeGreaterThan(5); // היו בקשות (גופנים, נכסים, דוגמה)
    const external = urls.filter((u) => !u.startsWith(APP_URL) && !u.startsWith('data:'));
    expect(external).toEqual([]); // אפס CDN/רשת — הסביבה נעולה (§19 offline)
  });
});
