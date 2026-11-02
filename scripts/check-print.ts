import { chromium } from '@playwright/test';

const TEXT = `שם הספר - ספר בדיקה
שם המחבר - מחבר
כותרת 2 מספר 1 - פרק ראשון
פסקה ראשונה לבדיקת עימוד עם הרבה מילים וטקסט ארוך.
פסקה שנייה לבדיקת עימוד.
כותרת 2 מספר 2 - פרק שני
עוד פסקה לבדיקה.`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('http://0.0.0.0:4173/');
  await page.waitForSelector('h1');
  await page.locator('textarea').first().fill(TEXT);
  await page.locator('button', { hasText: /עדכן/ }).first().click();
  await page.waitForSelector('.tora-page', { timeout: 60000 });
  await page.waitForTimeout(2000);

  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(500);

  // בדיקה פשוטה — בלי פונקציות פנימיות
  const styles = await page.evaluate(() => {
    const results: Record<string, string> = {};
    const els: Array<[string, string]> = [
      ['.tora-page', 'tora-page'],
      ['header', 'header'],
      ['button', 'button'],
      ['textarea', 'textarea'],
    ];
    for (const [sel, name] of els) {
      const el = document.querySelector(sel);
      if (el) {
        results[name] = window.getComputedStyle(el).display;
      } else {
        results[name] = 'missing';
      }
    }
    return results;
  });

  console.log('=== Print mode ===');
  for (const [name, display] of Object.entries(styles)) {
    const ok = (name === 'tora-page' && display !== 'none') || (name !== 'tora-page' && display === 'none');
    console.log(`${name}: ${display} ${ok ? '✅' : '❌'}`);
  }

  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
