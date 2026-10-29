import { chromium } from '@playwright/test';
import * as fs from 'fs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const text = fs.readFileSync('public/long_test_text.txt', 'utf8').split('\n').slice(0, 200).join('\n');

  await page.addInitScript(() => localStorage.clear());
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForSelector('h1');
  await page.locator('textarea').first().fill(text);
  await page.locator('button', { hasText: /עדכן/ }).first().click();
  await page.waitForSelector('.tora-page', { timeout: 60000 });
  await page.waitForTimeout(3000);

  // בדוק עמוד 3 (הריק)
  const pages = await page.locator('.tora-page').all();
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    const pt = await p.getAttribute('data-page-type');
    const pn = await p.getAttribute('data-page');
    const html = await p.innerHTML();
    const hasBody = html.includes('tora-body-text');
    const hasHeading = html.includes('tora-heading');
    const hasLine = html.includes('tora-line');
    const hasColumns = html.includes('tora-columns');
    const htmlLen = html.length;
    
    if (!hasBody && !hasLine && pt !== 'main-shaar' && pt !== 'back-shaar' && pt !== 'toc' && pt !== 'sub-shaar') {
      console.log(`עמוד ${pn || i} (${pt}): ריק! html=${htmlLen} chars`);
      console.log(`  heading: ${hasHeading}, columns: ${hasColumns}`);
      // הדפס את ה-HTML הפנימי (מקוצר)
      const preview = html.slice(0, 500).replace(/\s+/g, ' ');
      console.log(`  preview: ${preview}`);
    }
  }

  // בדוק את ה-TOC
  const tocPage = pages.find(async p => (await p.getAttribute('data-page-type')) === 'toc');
  if (tocPage) {
    const tocHeight = await tocPage.evaluate(el => (el as HTMLElement).scrollHeight);
    const tocClient = await tocPage.evaluate(el => (el as HTMLElement).clientHeight);
    console.log(`\nTOC: scrollHeight=${tocHeight}px, clientHeight=${tocClient}px, overflow=${tocHeight > tocClient}`);
  }

  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
