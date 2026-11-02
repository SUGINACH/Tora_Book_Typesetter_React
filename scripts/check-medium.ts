import { chromium } from '@playwright/test';
import * as fs from 'fs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const longText = fs.readFileSync('/tmp/medium-text.txt', 'utf8');
  console.log('טקסט:', longText.length, 'תווים');

  await page.addInitScript(() => localStorage.clear());
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForSelector('h1');
  await page.locator('textarea').first().fill(longText);
  console.log('לוחץ על כפתור...');
  await page.locator('button', { hasText: /עדכן/ }).first().click();
  console.log('ממתין לרינדור...');
  await page.waitForSelector('.tora-page', { timeout: 120000 });
  await page.waitForTimeout(5000);

  const count = await page.locator('.tora-page').count();
  const lines = await page.locator('.tora-line').count();
  const overflow = await page.evaluate(() => {
    let c = 0;
    document.querySelectorAll('.tora-page').forEach(p => {
      const el = p as HTMLElement;
      if (el.scrollHeight > el.clientHeight + 5) c++;
    });
    return c;
  });
  console.log(`עמודים: ${count}, tora-line: ${lines}, overflow: ${overflow}`);

  // ייצוא HTML
  console.log('מייצא HTML...');
  const htmlBtn = page.locator('button', { hasText: /HTML/ }).first();
  if (await htmlBtn.isVisible()) {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
      htmlBtn.click(),
    ]);
    if (dl) {
      await dl.saveAs('/tmp/exported-long.html');
      console.log('HTML נשמר ל-/tmp/exported-long.html');
    } else {
      console.log('ייצוא נכשל — קורא מ-DOM');
      const html = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.tora-page')).map(p => p.outerHTML).join('\n');
      });
      fs.writeFileSync('/tmp/exported-long.html', html);
      console.log('DOM נשמר');
    }
  }
  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
