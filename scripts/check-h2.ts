import { chromium } from '@playwright/test';

const TEXT = `שם הספר - ספר בדיקה
שם המחבר - מחבר

כותרת 2 מספר 1 - פרק ראשון

${Array.from({length: 8}, (_, i) => `פסקה מספר ${i + 1} לבדיקת עימוד עם הרבה מילים וטקסט ארוך.`).join('\n\n')}

כותרת 2 מספר 2 - פרק שני

${Array.from({length: 6}, (_, i) => `עוד פסקה מספר ${i + 1} בפרק השני.`).join('\n\n')}`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.addInitScript(() => localStorage.clear());
  await page.goto('http://0.0.0.0:4173/');
  await page.waitForSelector('h1');
  await page.locator('textarea').first().fill(TEXT);
  await page.locator('button', { hasText: /עדכן/ }).first().click();
  await page.waitForSelector('.tora-page', { timeout: 60000 });
  await page.waitForTimeout(3000);

  // בדיקת עמודי chapter-opener — האם יש בהם tora-columns (שני טורים)?
  const chapterPages = await page.locator('.tora-page[data-page-type="chapter-opener"]').all();
  console.log(`עמודי chapter-opener (H2): ${chapterPages.length}`);
  for (let i = 0; i < chapterPages.length; i++) {
    const p = chapterPages[i]!;
    const hasColumns = await p.locator('.tora-columns').count() > 0;
    const hasSingleColumn = await p.locator('.tora-single-column').count() > 0;
    const hasToraLine = await p.locator('.tora-line').count();
    const headingText = await p.locator('.tora-heading').first().textContent();
    console.log(`  עמוד ${i + 1}: "${headingText?.trim().slice(0, 30)}"`);
    console.log(`    tora-columns: ${hasColumns ? 'כן ✅' : 'לא ❌'}`);
    console.log(`    tora-single-column: ${hasSingleColumn ? 'כן ❌ (לא צריך!)' : 'לא ✅'}`);
    console.log(`    tora-line: ${hasToraLine}`);
  }

  // בדיקת עמודים רגילים
  const regularPages = await page.locator('.tora-page[data-page-type="regular"]').all();
  console.log(`\nעמודים רגילים: ${regularPages.length}`);
  for (let i = 0; i < Math.min(regularPages.length, 3); i++) {
    const p = regularPages[i]!;
    const hasColumns = await p.locator('.tora-columns').count() > 0;
    const rightLines = await p.locator('.tora-column-right .tora-line').count();
    const leftLines = await p.locator('.tora-column-left .tora-line').count();
    console.log(`  עמוד ${i + 1}: tora-columns=${hasColumns}, ימין=${rightLines} שורות, שמאל=${leftLines} שורות`);
  }

  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
