import { chromium } from '@playwright/test';

const TEXT = `שם הספר - ספר בדיקה
שם המחבר - מחבר

כותרת 2 מספר 1 - פרק ראשון

${Array.from({length: 10}, (_, i) => `פסקה מספר ${i + 1} שמכילה מספר משפטים לבדיקת עימוד עם הרבה מילים וטקסט ארוך יחסית כדי לראות את השורות השבורות והטורים.`).join('\n\n')}

כותרת 2 מספר 2 - פרק שני

${Array.from({length: 8}, (_, i) => `עוד פסקה מספר ${i + 1} בפרק השני עם טקסט לבדיקת איזון טורים ומעברי עמודים.`).join('\n\n')}`;

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

  // === בדיקה 1: כמות עמודים ===
  const pageCount = await page.locator('.tora-page').count();
  console.log(`עמודים: ${pageCount}`);

  // === בדיקה 2: תוכן בעמודי chapter-opener ===
  const chapterPages = await page.locator('.tora-page[data-page-type="chapter-opener"]').all();
  console.log(`עמודי chapter-opener: ${chapterPages.length}`);
  for (let i = 0; i < chapterPages.length; i++) {
    const p = chapterPages[i]!;
    const singleColBlocks = await p.locator('.tora-single-column > div, .tora-single-column > p, .tora-single-column .tora-line').count();
    const headingText = await p.locator('.tora-heading').first().textContent();
    console.log(`  עמוד ${i + 1}: "${headingText?.trim().slice(0, 40)}" — ${singleColBlocks} אלמנטים ב-single-column`);
  }

  // === בדיקה 3: שורות ידניות (tora-line) ===
  const toraLines = await page.locator('.tora-line').count();
  console.log(`\nשורות ידניות (.tora-line): ${toraLines}`);

  // === בדיקה 4: nowrap ===
  const nowrapCount = await page.evaluate(() => {
    const lines = document.querySelectorAll('.tora-line');
    let count = 0;
    lines.forEach(l => {
      const style = window.getComputedStyle(l);
      if (style.whiteSpace === 'nowrap') count++;
    });
    return count;
  });
  console.log(`שורות עם white-space:nowrap: ${nowrapCount}/${toraLines}`);

  // === בדיקה 5: overflow ===
  const overflow = await page.evaluate(() => {
    const pages = document.querySelectorAll('.tora-page');
    let overflowCount = 0;
    pages.forEach(p => {
      const el = p as HTMLElement;
      if (el.scrollHeight > el.clientHeight + 5) overflowCount++;
    });
    return { overflowCount, total: pages.length };
  });
  console.log(`\nOverflow: ${overflow.overflowCount}/${overflow.total} עמודים`);

  // === בדיקה 6: פסקאות בעמוד רגיל ===
  const regularPages = await page.locator('.tora-page[data-page-type="regular"]').all();
  console.log(`\nעמודים רגילים: ${regularPages.length}`);
  for (let i = 0; i < Math.min(regularPages.length, 5); i++) {
    const p = regularPages[i]!;
    const rightBlocks = await p.locator('.tora-column-right .tora-line, .tora-column-right p, .tora-column-right .tora-heading').count();
    const leftBlocks = await p.locator('.tora-column-left .tora-line, .tora-column-left p, .tora-column-left .tora-heading').count();
    const pageType = await p.getAttribute('data-page');
    console.log(`  עמוד ${pageType}: ימין=${rightBlocks}, שמאל=${leftBlocks}`);
  }

  // === בדיקה 7: text-align ===
  const textAlign = await page.evaluate(() => {
    const cols = document.querySelectorAll('.tora-column');
    const styles: string[] = [];
    cols.forEach(c => {
      const style = window.getComputedStyle(c);
      styles.push(style.textAlign);
    });
    return styles;
  });
  console.log(`\ntext-align בטורים: ${textAlign.slice(0, 5).join(', ')}`);

  // === בדיקה 8: סיידנוטים ===
  const sidenoteCount = await page.locator('.tora-sidenote').count();
  console.log(`\nסיידנוטים: ${sidenoteCount}`);

  // === בדיקה 9: SVG raw ===
  const xmlCount = await page.evaluate(() => {
    return document.querySelectorAll('*').length > 0
      ? (document.body.innerHTML.match(/<\?xml/g) || []).length
      : 0;
  });
  console.log(`<?xml> גולמי ב-HTML: ${xmlCount}`);

  // === סיכום ===
  console.log('\n=== סיכום ===');
  console.log(`עמודים: ${pageCount}`);
  console.log(`שורות ידניות: ${toraLines} (nowrap: ${nowrapCount})`);
  console.log(`Overflow: ${overflow.overflowCount}/${overflow.total}`);
  console.log(`סיידנוטים: ${sidenoteCount}`);
  console.log(`XML גולמי: ${xmlCount}`);

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
