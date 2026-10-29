import { chromium } from '@playwright/test';

const TEXT = `שם הספר - ספר בדיקה
שם המחבר - מחבר

כותרת 2 מספר 1 - פרק ראשון

${Array.from({length: 8}, (_, i) => `פסקה מספר ${i + 1} שמכילה מספר משפטים לבדיקת עימוד עם הרבה מילים וטקסט ארוך יחסית כדי לראות את השורות השבורות והטורים בעמוד המרונדר.`).join('\n\n')}

כותרת 2 מספר 2 - פרק שני

${Array.from({length: 6}, (_, i) => `עוד פסקה מספר ${i + 1} בפרק השני עם טקסט לבדיקת איזון טורים ומעברי עמודים במערכת העימוד.`).join('\n\n')}`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // לקלוט console errors
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('[CONSOLE ERROR]', msg.text());
  });

  await page.addInitScript(() => localStorage.clear());
  await page.goto('http://0.0.0.0:4173/');
  await page.waitForSelector('h1');
  await page.locator('textarea').first().fill(TEXT);
  await page.locator('button', { hasText: /עדכן/ }).first().click();
  await page.waitForSelector('.tora-page', { timeout: 60_000 });
  await page.waitForTimeout(3000);

  const toraLineCount = await page.locator('.tora-line').count();
  const toraBodyTextCount = await page.locator('.tora-body-text').count();
  const pageCount = await page.locator('.tora-page').count();
  
  console.log('=== בדיקת DOM אמיתי ===');
  console.log(`עמודים: ${pageCount}`);
  console.log(`tora-body-text (פסקאות): ${toraBodyTextCount}`);
  console.log(`tora-line (שורות ידניות): ${toraLineCount}`);
  
  if (toraBodyTextCount > 0 && toraLineCount > 0) {
    console.log(`שורות לפסקה: ${(toraLineCount / toraBodyTextCount).toFixed(1)}`);
  }

  // בדיקת nowrap
  const nowrapCount = await page.evaluate(() => {
    const lines = document.querySelectorAll('.tora-line');
    let count = 0;
    lines.forEach(l => {
      const style = window.getComputedStyle(l);
      if (style.whiteSpace === 'nowrap') count++;
    });
    return count;
  });
  console.log(`nowrap: ${nowrapCount}/${toraLineCount}`);

  // בדיקת overflow
  const overflow = await page.evaluate(() => {
    const pages = document.querySelectorAll('.tora-page');
    let count = 0;
    pages.forEach(p => {
      const el = p as HTMLElement;
      if (el.scrollHeight > el.clientHeight + 5) count++;
    });
    return count;
  });
  console.log(`overflow: ${overflow}/${pageCount}`);

  // בדיקת פסקאות ללא tora-line
  const parasWithoutLines = await page.evaluate(() => {
    const paras = document.querySelectorAll('.tora-body-text');
    let count = 0;
    paras.forEach(p => {
      if (!p.querySelector('.tora-line')) count++;
    });
    return count;
  });
  console.log(`פסקאות ללא tora-line: ${parasWithoutLines}/${toraBodyTextCount}`);

  // בדיקת תוכן בכמה פסקאות
  const firstParaLines = await page.evaluate(() => {
    const para = document.querySelector('.tora-body-text');
    if (!para) return [];
    const lines = para.querySelectorAll('.tora-line');
    return Array.from(lines).map(l => l.textContent?.slice(0, 40) || '');
  });
  console.log(`\nפסקה ראשונה — ${firstParaLines.length} שורות:`);
  firstParaLines.forEach((l, i) => console.log(`  ${i+1}: "${l}"`));

  await browser.close();
}

main().catch(e => { console.error(e); process.exit(1); });
