/**
 * 02-cli-oracle.spec.ts — האורקל הסמנטי ואי־זליגת מצב ממשק (שלב 85).
 *
 * תכנית שלב 85: "השוואת layoutHash ל־CLI כאורקל סמנטי" — האפליקציה
 * (דפדפן + Worker + ספק אמיתי) וה־CLI (Node + אותם חבילות) חייבים לתת
 * אותו hash מלא על אותו קלט ואותן הגדרות אפקטיביות. ה־documentId נקבע
 * ל־'cli-reference' משני הצדדים (שלד 39; ראש helpers).
 *
 * שעת M9 (rollback): "שינויי UI אינם משנים engine SHA או goldens" — זום,
 * פתיחת לוח הגדרות וגודל ויוטפורט אינם נוגעים למודל (§17.2#1, #5).
 * שם המסמך אינו "UI בלבד" — הוא ה־documentId וחלק מזהות הריצה.
 */
import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import {
  gotoApp, importTextViaChooser, runAndWaitDone, layoutHashOf, setDocumentName,
  openSettings, setSettingSelect, expectRunBlocked,
  REFERENCE_SOURCE, ORACLE_DOCUMENT_ID, REPO_ROOT, cliLayoutRun,
} from './helpers';

/** מסמך רב־עמודים קטן (18 עמודים, ריצה שניות אחתות) — לבדיקות הווירטואליזציה. */
const MULTI_PAGE = join(REPO_ROOT, 'test-triggers', 'test-all-triggers.txt');

test.describe('שלב 85 — אורקל CLI ואי־זליגת UI (M9)', () => {
  test('אורקל, ברירת מחדל: hash האפליקציה === hash ה־CLI על אותו קובץ (64 תווים, זהות מלאה)', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await setDocumentName(page, ORACLE_DOCUMENT_ID);
    await runAndWaitDone(page);
    const appHash = await layoutHashOf(page);
    const cli = cliLayoutRun({ input: REFERENCE_SOURCE });
    expect(cli.layoutHash).toMatch(/^[0-9a-f]{64}$/);
    expect(appHash).toBe(cli.layoutHash);
    // מספר העמודים נגזר מאותו IR — גם הוא זהה
    const pagesAttr = Number(await page.locator('.tora-preview-root').getAttribute('data-layout-pages'));
    expect(pagesAttr).toBe(cli.pages);
  });

  test('סדר קריאה נכון בפועל: מיקומי התווים על המסך ⇒ הקורא העברי קורא את המקור (תיקון 2026-11-09/ב\')', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await setDocumentName(page, ORACLE_DOCUMENT_ID);
    await runAndWaitDone(page);
    // מדידה דטרמיניסטית של מיקומי התווים בפועל (Range API — לא צילום מסך):
    // bidi-override על המחרוזת החזותית מראה כל מילה ("יורה דעה" נקרא
    // "הרוי העד" — כך אובחן באתר החי). הקורא העברי קורא ימין←שמאל; ההוכחה
    // החזקה: הקריאה בפועל שווה בדיוק לטקסט הלוגי שב-DOM.
    const readings = await page.evaluate(() => {
      const spans = [...document.querySelectorAll('.tora-preview-root [data-run-id]')] as HTMLElement[];
      const out: { domText: string; rtlReading: string; dir: string; bidi: string }[] = [];
      for (const span of spans.slice(0, 40)) {
        const tn = span.firstChild;
        if (tn === null || tn.textContent === null || tn.textContent.length < 6) continue;
        if (!/[\u0590-\u05FF]/.test(tn.textContent)) continue;
        const chars: { ch: string; x: number }[] = [];
        for (let i = 0; i < tn.textContent.length; i += 1) {
          const r = document.createRange();
          r.setStart(tn, i); r.setEnd(tn, i + 1);
          chars.push({ ch: tn.textContent![i]!, x: r.getBoundingClientRect().x });
        }
        const ltr = [...chars].sort((a, b) => a.x - b.x).map((c) => c.ch).join('');
        const cs = getComputedStyle(span);
        out.push({ domText: span.textContent ?? '', rtlReading: [...ltr].reverse().join(''), dir: cs.direction, bidi: cs.unicodeBidi });
        if (out.length >= 5) break;
      }
      return out;
    });
    expect(readings.length).toBeGreaterThanOrEqual(3);
    for (const r of readings) {
      // ההיטל: כיוון טבעי, בלי bidi-override (isolate — ברירת המחדל של
      // ה-UA לאלמנט עם dir; תקין: זה בידוד טבעי, לא כפיית סדר תווים)
      expect(r.dir).toBe('rtl');
      expect(r.bidi).not.toMatch(/override/);
      // הקריאה בפועל === הטקסט הלוגי — שום מראה תווים ושום היפוך מילים
      expect(r.rtlReading).toBe(r.domText);
    }
  });

  test('אורקל לאחר שינוי הגדרה: body-last-line-align=right ⇒ hash השתנה ושווה ל־CLI עם אותה דלתא', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await setDocumentName(page, ORACLE_DOCUMENT_ID);
    await runAndWaitDone(page);
    const defaultHash = await layoutHashOf(page);
    // שינוי מהמרשם דרך הטופס הנגול (שלב 78) — לא הזרקה
    await openSettings(page);
    await setSettingSelect(page, 'body-last-line-align', 'right');
    await runAndWaitDone(page);
    const changedHash = await layoutHashOf(page);
    expect(changedHash).not.toBe(defaultHash); // ההגדרה משפיעה פריסה — affectsLayout
    // אותה דלתא בצד ה־CLI (שכבת מסמך על ברירות המחדל של המרשם)
    const cli = cliLayoutRun({ input: REFERENCE_SOURCE, settings: { 'body-last-line-align': 'right' } });
    expect(changedHash).toBe(cli.layoutHash);
  });

  test('שינויי UI בלבד אינם משנים את המודל: זום ופתיחת לוח — ריצה חוזרת נותנת אותו hash (§17.2#1; rollback M9)', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await setDocumentName(page, ORACLE_DOCUMENT_ID);
    await runAndWaitDone(page);
    const hash1 = await layoutHashOf(page);
    // זום ×2 (10 לחיצות של 0.1) + לוח הגדרות פתוח — מצב ממשק טהור
    for (let i = 0; i < 10; i += 1) await page.getByTestId('zoom-in').click();
    await openSettings(page);
    await expect(page.locator('.tora-preview-root')).toBeVisible();
    const duringUi = await page.locator('[data-layout-hash]').getAttribute('data-layout-hash');
    expect(String(duringUi)).toBe(hash1); // ההיטל זז; המודל לא
    await runAndWaitDone(page);
    const hash2 = await layoutHashOf(page);
    expect(hash2).toBe(hash1);
    // חזרה לזום 1:1 — ושוב אותו hash (הזום הוא תצוגה בלבד, שלב 83)
    await page.getByTestId('zoom-reset').click();
    await runAndWaitDone(page);
    expect(await layoutHashOf(page)).toBe(hash1);
  });

  test('viewport קטן/גדול אינו משנה את המודל: הטווח הווירטואלי מצטמצם, העמודים וה־hash קבועים (§17.2#5)', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, MULTI_PAGE); // 18 עמודים — יש מה להסתיר
    await setDocumentName(page, ORACLE_DOCUMENT_ID);
    await runAndWaitDone(page);
    const hash = await layoutHashOf(page);
    const pages = Number(await page.locator('.tora-preview-root').getAttribute('data-layout-pages'));
    expect(pages).toBeGreaterThanOrEqual(8);
    const wideRange = await page.locator('.tora-preview-root').getAttribute('data-virtual-range');
    // חלון צר ונמוך — ההיטל מצטמצם; המודל לא. הטווח בשני הגדלים מכסה
    // חלק מהעמודים בלבד (וירטואליזציה פעילה); הנקודה — המודל קבוע.
    await page.setViewportSize({ width: 500, height: 400 });
    const narrow = await page.locator('.tora-preview-root').getAttribute('data-virtual-range');
    const [nf, nl] = String(narrow).split('-').map(Number);
    const [wf, wl] = String(wideRange).split('-').map(Number);
    expect(nf).toBe(0);
    expect(nl).toBeLessThan(pages - 1); // לא הכל מוצג בחלון הקטן
    expect(wl).toBeLessThan(pages - 1); // וגם בגדול — הווירטואליזציה פעילה
    expect(Number(await page.locator('.tora-preview-root').getAttribute('data-layout-pages'))).toBe(pages);
    // חזרה לחלון המלא — הטווח נפתח חזרה; ה־hash לא זז לאורך כל הדרך
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.locator('.tora-preview-root')).toHaveAttribute('data-virtual-range', String(wideRange));
    expect(await layoutHashOf(page)).toBe(hash);
  });

  test('שדה לא חוקי: סוגיה מתורגמת בעברית על השדה; הריצה חסומה; תיקון מחזיר הרצה', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await setDocumentName(page, ORACLE_DOCUMENT_ID);
    await openSettings(page);
    // builder-main-top: מספר (קלט מספר) — ריק ⇐ NaN ונדחה (schema.ts: NaN נדחה
    // בהחלטה; הערך אינו נכנס ל־draft)
    const input = page.locator('[data-setting-key="builder-main-top"]').locator('input');
    await input.fill('');
    const issue = page.locator('[data-setting-issue="builder-main-top"]');
    await expect(issue).toBeVisible();
    const issueText = String(await issue.textContent());
    expect(issueText).toMatch(/[\u0590-\u05FF]/); // עברית — תרגום מהקטלוג הסגור
    expect(issueText.trim().length).toBeGreaterThan(3); // הודעה אמיתית, לא קוד גולם
    // הריצה חסומה — אין "כמעט תקין" (§13.3)
    await expectRunBlocked(page);
    // תיקון השדה — הסוגיה יורדת והריצה חוזרת. הערך חייב להיות שונה
    // מהמוצג ('20'): fill על ערך זהה לא מפעיל input (והסוגיה הישנה נשארת).
    await input.fill('21');
    await expect(issue).toHaveCount(0);
    await runAndWaitDone(page);
    expect(await layoutHashOf(page)).toMatch(/^[0-9a-f]{64}$/);
  });

  test('דטרמיניזם בריצות חוזרות: שלוש ריצות רצופות ⇒ אותו hash (§17.2#1)', async ({ page }) => {
    await gotoApp(page);
    await importTextViaChooser(page, REFERENCE_SOURCE);
    await setDocumentName(page, ORACLE_DOCUMENT_ID);
    await runAndWaitDone(page);
    const h1 = await layoutHashOf(page);
    await runAndWaitDone(page);
    const h2 = await layoutHashOf(page);
    await runAndWaitDone(page);
    const h3 = await layoutHashOf(page);
    expect(h2).toBe(h1);
    expect(h3).toBe(h1);
  });
});
