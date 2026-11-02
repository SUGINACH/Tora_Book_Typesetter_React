import { chromium } from '@playwright/test';
import * as fs from 'fs';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const text = fs.readFileSync('/tmp/short-test.txt', 'utf8');
  console.log(`טקסט: ${text.length} תווים`);

  await page.addInitScript(() => localStorage.clear());
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForSelector('h1');
  await page.locator('textarea').first().fill(text);
  await page.locator('button', { hasText: /עדכן/ }).first().click();
  await page.waitForSelector('.tora-page', { timeout: 60000 });
  await page.waitForTimeout(3000);

  const data = await page.evaluate(() => {
    const pages = document.querySelectorAll('.tora-page');
    const results: any[] = [];
    pages.forEach(p => {
      const el = p as HTMLElement;
      const pt = el.getAttribute('data-page-type') || '?';
      const pn = el.getAttribute('data-page') || '0';
      const ov = el.scrollHeight > el.clientHeight + 5;
      const r = el.querySelector('.tora-column-right');
      const l = el.querySelector('.tora-column-left');
      const rb = r ? r.querySelectorAll('.tora-body-text,.tora-heading').length : 0;
      const lb = l ? l.querySelectorAll('.tora-body-text,.tora-heading').length : 0;
      const rl = r ? r.querySelectorAll('.tora-line').length : 0;
      const ll = l ? l.querySelectorAll('.tora-line').length : 0;
      const rw = r ? Math.round(r.getBoundingClientRect().width) : 0;
      const lw = l ? Math.round(l.getBoundingClientRect().width) : 0;
      
      // רווחים
      const lines = el.querySelectorAll('.tora-line');
      let bigGaps = 0;
      let prevB = -1;
      lines.forEach(line => {
        const rect = (line as HTMLElement).getBoundingClientRect();
        if (prevB > 0) {
          const g = rect.top - prevB;
          if (g > 0 && g < 200 && g > 30) bigGaps++;
        }
        prevB = rect.bottom;
      });
      
      results.push({ pn, pt, ov, rb, lb, rl, ll, rw, lw, bigGaps, total: rl+ll });
    });
    return results;
  });

  console.log(`\nעמודים: ${data.length}`);
  let issues = 0;
  for (const d of data) {
    const probs: string[] = [];
    if (d.ov) probs.push('OVERFLOW');
    if (d.pt === 'regular' && d.total === 0) probs.push('ריק');
    if (d.pt === 'regular' && d.lb === 0 && d.rb > 0) probs.push('שמאל ריק');
    if (d.bigGaps > 0) probs.push(`${d.bigGaps} רווחים`);
    if (d.pt === 'chapter-opener') probs.push(`H2: ימין=${d.rb} שמאל=${d.lb}`);
    if (probs.length > 0) {
      issues += probs.length;
      console.log(`עמוד ${d.pn} (${d.pt}): ${probs.join(', ')} [ימין:${d.rb}ב/${d.rl}ש שמאל:${d.lb}ב/${d.ll}ש ${d.rw}/${d.lw}px]`);
    }
  }
  console.log(`\nסה"כ: ${issues} בעיות`);
  
  const sample = data.find(d => d.rw > 0);
  if (sample) console.log(`רוחב טור אמיתי: ${sample.rw}x / ${sample.lw}px`);

  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
