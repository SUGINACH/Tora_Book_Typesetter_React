import { chromium } from '@playwright/test';
import * as fs from 'fs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const longText = fs.readFileSync('public/long_test_text.txt', 'utf8');
  console.log(`טקסט: ${longText.length} תווים`);

  await page.addInitScript(() => localStorage.clear());
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForSelector('h1');
  await page.locator('textarea').first().fill(longText);
  await page.locator('button', { hasText: /עדכן/ }).first().click();
  await page.waitForSelector('.tora-page', { timeout: 120000 });
  await page.waitForTimeout(5000);

  // קריאת נתונים מה-DOM החי
  const data = await page.evaluate(() => {
    const pages = document.querySelectorAll('.tora-page');
    const results: any[] = [];
    pages.forEach((p, i) => {
      const el = p as HTMLElement;
      const pageType = el.getAttribute('data-page-type') || 'unknown';
      const pageNum = el.getAttribute('data-page') || '0';
      const scrollH = el.scrollHeight;
      const clientH = el.clientHeight;
      const overflow = scrollH > clientH + 5;
      
      const rightCol = el.querySelector('.tora-column-right');
      const leftCol = el.querySelector('.tora-column-left');
      const singleCol = el.querySelector('.tora-single-column');
      
      const rightBlocks = rightCol ? rightCol.querySelectorAll('.tora-body-text, .tora-heading').length : 0;
      const leftBlocks = leftCol ? leftCol.querySelectorAll('.tora-body-text, .tora-heading').length : 0;
      const rightLines = rightCol ? rightCol.querySelectorAll('.tora-line').length : 0;
      const leftLines = leftCol ? leftCol.querySelectorAll('.tora-line').length : 0;
      const singleLines = singleCol ? singleCol.querySelectorAll('.tora-line').length : 0;
      
      // מדידת רוחב טור אמיתי
      let rightWidth = 0, leftWidth = 0;
      if (rightCol) rightWidth = rightCol.getBoundingClientRect().width;
      if (leftCol) leftWidth = leftCol.getBoundingClientRect().width;
      
      // מדידת רווחים בין שורות
      const allLines = el.querySelectorAll('.tora-line');
      const lineData: any[] = [];
      let prevBottom = -1;
      allLines.forEach(l => {
        const lineEl = l as HTMLElement;
        const rect = lineEl.getBoundingClientRect();
        const text = lineEl.textContent || '';
        const gap = prevBottom > 0 ? rect.top - prevBottom : 0;
        if (gap > 0 && gap < 200) {
          lineData.push({ width: rect.width, gap, textLen: text.length });
        }
        prevBottom = rect.bottom;
      });
      
      const bigGaps = lineData.filter(d => d.gap > 30).length;
      const shortLines = lineData.filter(d => d.width < 100).length;
      
      results.push({
        idx: i, pageNum, pageType, overflow,
        scrollH, clientH,
        rightBlocks, leftBlocks, rightLines, leftLines, singleLines,
        rightWidth: Math.round(rightWidth), leftWidth: Math.round(leftWidth),
        bigGaps, shortLines,
        totalLines: rightLines + leftLines + singleLines,
      });
    });
    return results;
  });

  // דוח
  console.log('\n=== דוח עמודים ===');
  let issues = 0;
  for (const d of data) {
    const problems: string[] = [];
    if (d.overflow) problems.push('OVERFLOW');
    if (d.pageType === 'regular' && d.totalLines === 0) problems.push('ריק');
    if (d.pageType === 'regular' && d.leftBlocks === 0 && d.rightBlocks > 0) problems.push('טור שמאלי ריק');
    if (d.bigGaps > 0) problems.push(`${d.bigGaps} רווחים גדולים`);
    if (d.shortLines > 0) problems.push(`${d.shortLines} שורות קצרות`);
    if (d.pageType === 'chapter-opener' && d.singleLines > 0) problems.push('H2 עם single-column!');
    
    if (problems.length > 0) {
      issues += problems.length;
      console.log(`עמוד ${d.pageNum} (${d.pageType}): ${problems.join(', ')}`);
      console.log(`  ימין:${d.rightBlocks}ב/${d.rightLines}ש שמאל:${d.leftBlocks}ב/${d.leftLines}ש רוחב:${d.rightWidth}/${d.leftWidth}px`);
    }
  }
  
  console.log(`\nסה"כ: ${data.length} עמודים, ${issues} בעיות`);
  
  // סיכום
  const overflowCount = data.filter(d => d.overflow).length;
  const emptyCount = data.filter(d => d.pageType === 'regular' && d.totalLines === 0).length;
  const leftEmptyCount = data.filter(d => d.pageType === 'regular' && d.leftBlocks === 0 && d.rightBlocks > 0).length;
  const totalBigGaps = data.reduce((s, d) => s + d.bigGaps, 0);
  const totalShortLines = data.reduce((s, d) => s + d.shortLines, 0);
  
  console.log(`\n=== סיכום ===`);
  console.log(`overflow: ${overflowCount}`);
  console.log(`עמודים ריקים: ${emptyCount}`);
  console.log(`טור שמאלי ריק: ${leftEmptyCount}`);
  console.log(`רווחים גדולים: ${totalBigGaps}`);
  console.log(`שורות קצרות: ${totalShortLines}`);
  
  // רוחב טור אמיתי
  const sample = data.find(d => d.rightWidth > 0);
  if (sample) {
    console.log(`\nרוחב טור אמיתי: ימין=${sample.rightWidth}px שמאל=${sample.leftWidth}px`);
    console.log(`רוחב טור בקוד: 230px (מחושב)`);
  }

  // ייצוא HTML
  console.log('\nמייצא HTML...');
  const htmlBtn = page.locator('button', { hasText: /HTML/ }).first();
  if (await htmlBtn.isVisible()) {
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 15000 }).catch(() => null),
      htmlBtn.click(),
    ]);
    if (dl) {
      await dl.saveAs('/tmp/exported-check.html');
      console.log('HTML נשמר');
    }
  }
  
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
