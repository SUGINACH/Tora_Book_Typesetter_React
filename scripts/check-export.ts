import { chromium } from '@playwright/test';
import * as fs from 'fs';

const TEXT = `שם הספר - ספר בדיקה
שם המחבר - מחבר

כותרת 2 מספר 1 - פרק ראשון

${Array.from({length: 6}, (_, i) => `פסקה מספר ${i + 1} לבדיקת עימוד עם הרבה מילים וטקסט ארוך.`).join('\n\n')}

כותרת 2 מספר 2 - פרק שני

${Array.from({length: 4}, (_, i) => `עוד פסקה מספר ${i + 1} בפרק השני.`).join('\n\n')}`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  await page.addInitScript(() => localStorage.clear());
  await page.goto('http://0.0.0.0:4173/');
  await page.waitForSelector('h1');
  await page.locator('textarea').first().fill(TEXT);
  await page.locator('button', { hasText: /עדכן/ }).first().click();
  await page.waitForSelector('.tora-page', { timeout: 60_000 });
  await page.waitForTimeout(3000);

  // בדיקת ייצוא HTML — קליק על כפתור HTML
  const htmlButton = page.locator('button', { hasText: /HTML/ }).first();
  if (await htmlButton.isVisible()) {
    console.log('=== בדיקת ייצוא HTML ===');

    // האם הייצוא מכיל tora-line?
    const htmlContent = await page.evaluate(() => {
      // סימולציה: קריאת ה-HTML שייוצא
      const pages = document.querySelectorAll('.tora-page');
      const bodyHtml = Array.from(pages).map(p => p.outerHTML).join('\n');
      // קריאת CSS חי
      const cssTexts: string[] = [];
      for (const sheet of document.styleSheets) {
        try {
          for (const rule of sheet.cssRules) {
            cssTexts.push(rule.cssText);
          }
        } catch {}
      }
      const css = cssTexts.join('\n');
      return { bodyHtml, css };
    });

    const hasToraLine = htmlContent.css.includes('tora-line');
    const hasNowrap = htmlContent.css.includes('nowrap');
    const hasOverflowHidden = htmlContent.css.includes('overflow:hidden') || htmlContent.css.includes('overflow: hidden');
    const toraLineInBody = (htmlContent.bodyHtml.match(/tora-line/g) || []).length;

    console.log(`tora-line ב-CSS החי: ${hasToraLine ? 'כן ✅' : 'לא ❌'}`);
    console.log(`nowrap ב-CSS החי: ${hasNowrap ? 'כן ✅' : 'לא ❌'}`);
    console.log(`overflow:hidden ב-CSS: ${hasOverflowHidden ? 'כן ✅' : 'לא ❌'}`);
    console.log(`tora-line ב-HTML: ${toraLineInBody} פעמים`);

    // בדיקת print CSS
    const hasPrintCss = htmlContent.css.includes('@media print');
    const printHidesUI = htmlContent.css.includes('display:none') || htmlContent.css.includes('display: none');
    console.log(`@media print קיים: ${hasPrintCss ? 'כן ✅' : 'לא ❌'}`);
    console.log(`print מסתיר UI: ${printHidesUI ? 'כן ✅' : 'לא ❌'}`);
  } else {
    console.log('כפתור HTML לא נראה — בדיקת ניתוח CSS ישירות');
  }

  // בדיקת print — סימולציה ע"י emulation
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(500);

  const visibleInPrint = await page.evaluate(() => {
    const elements = {
      'tora-page': document.querySelectorAll('.tora-page:not([style*="display: none"])').length,
      'header': document.querySelectorAll('header:not([style*="display: none"])').length,
      'button': document.querySelectorAll('button:not([style*="display: none"])').length,
      'textarea': document.querySelectorAll('textarea:not([style*="display: none"])').length,
    };
    return elements;
  });

  console.log(`\n=== בדיקת print mode ===`);
  console.log(`tora-page גלוי: ${visibleInPrint['tora-page']}`);
  console.log(`header גלוי: ${visibleInPrint['header']} (צריך להיות 0)`);
  console.log(`button גלוי: ${visibleInPrint['button']} (צריך להיות 0)`);
  console.log(`textarea גלוי: ${visibleInPrint['textarea']} (צריך להיות 0)`);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
