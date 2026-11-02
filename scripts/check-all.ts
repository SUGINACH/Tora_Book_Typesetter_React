import { chromium } from '@playwright/test';

/**
 * בדיקה מקיפה — בודק את כל 10 הבעיות מסעיף 27.
 * מריץ את האפליקציה, מזרים טקסט, ובודק כל בעיה ב-DOM.
 *
 * יש להריץ אחרי: npm run build && vite preview --port 4173
 */

const TEXT = `שם הספר - מקום בינה
שם המחבר - נתנאל דיינובסקי
שמירת זכויות - כל הזכויות שמורות
פרטי הוצאה לאור - הוצאת זוכמיר
פרטי קשר - 052-7666666
פרטים נוספים - אין לסמוך על האמור להלכה

כותרת 2 מספר 1 - פרק ראשון

${Array.from({length: 12}, (_, i) => `פסקה מספר ${i + 1} שמכילה מספר משפטים לבדיקת עימוד עם הרבה מילים וטקסט ארוך יחסית כדי לראות את השורות השבורות והטורים בעמוד המרונדר על ידי מערכת העימוד התורנית.`).join('\n\n')}

כותרת 2 מספר 2 - פרק שני

${Array.from({length: 10}, (_, i) => `עוד פסקה מספר ${i + 1} בפרק השני עם טקסט לבדיקת איזון טורים ומעברי עמודים במערכת העימוד.`).join('\n\n')}

כותרת 2 מספר 3 - פרק שלישי

${Array.from({length: 8}, (_, i) => `פסקה בפרק השלישי מספר ${i + 1} עם טקסט לבדיקת סוף פרק ומפריד.`).join('\n\n')}`;

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  detail: string;
}

const results: CheckResult[] = [];

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

  const allPages = await page.locator('.tora-page').all();
  const pageCount = allPages.length;

  // === בדיקה 1: טקסט בעמודי שער ===
  const shaarPages = await page.locator('.tora-page[data-page-type="main-shaar"], .tora-page[data-page-type="back-shaar"], .tora-page[data-page-type="sub-shaar"]').all();
  let shaarOk = true;
  for (const sp of shaarPages) {
    const html = await sp.innerHTML();
    // שער לא אמור להכיל tora-columns או tora-body-text
    if (html.includes('tora-columns') || html.includes('tora-body-text')) {
      shaarOk = false;
      break;
    }
  }
  results.push({ name: '1. טקסט בעמודי שער', status: shaarOk ? 'PASS' : 'FAIL', detail: shaarOk ? 'שערים ללא טקסט גוף' : 'שערים מכילים טקסט גוף!' });

  // === בדיקה 2: רווחים אדירים בין שורות (בתוך אותו עמוד) ===
  const lineSpacings = await page.evaluate(() => {
    const pages = document.querySelectorAll('.tora-page');
    const spacings: number[] = [];
    pages.forEach(pageEl => {
      const lines = pageEl.querySelectorAll('.tora-line');
      let prevBottom = -1;
      lines.forEach(l => {
        const rect = l.getBoundingClientRect();
        if (prevBottom > 0) {
          const gap = rect.top - prevBottom;
          if (gap < 200) spacings.push(gap); // סינון מעברי עמוד
        }
        prevBottom = rect.bottom;
      });
    });
    return spacings;
  });
  const avgSpacing = lineSpacings.length > 0 ? lineSpacings.reduce((a, b) => a + b, 0) / lineSpacings.length : 0;
  const maxSpacing = lineSpacings.length > 0 ? Math.max(...lineSpacings) : 0;
  const spacingOk = maxSpacing < avgSpacing * 2.5;
  results.push({ name: '2. רווחים אדירים', status: spacingOk ? 'PASS' : 'FAIL', detail: `avg=${avgSpacing.toFixed(1)}px max=${maxSpacing.toFixed(1)}px ${spacingOk ? '' : '(max > 2.5×avg!)'}` });

  // === בדיקה 3: כותרות עליונות מחוץ לדף ===
  const headerOverflow = await page.evaluate(() => {
    const headers = document.querySelectorAll('.tora-running-header');
    let overflow = 0;
    headers.forEach(h => {
      const rect = h.getBoundingClientRect();
      const page = h.closest('.tora-page');
      if (page) {
        const pageRect = page.getBoundingClientRect();
        if (rect.right > pageRect.right || rect.left < pageRect.left) overflow++;
      }
    });
    return { total: headers.length, overflow };
  });
  results.push({ name: '3. כותרות עליונות מחוץ לדף', status: headerOverflow.overflow === 0 ? 'PASS' : 'FAIL', detail: `${headerOverflow.overflow}/${headerOverflow.total} גולשים` });

  // === בדיקה 4: כותרת + פסקה גדולה שגולשת ===
  const overflowPages = await page.evaluate(() => {
    const pages = document.querySelectorAll('.tora-page');
    let count = 0;
    pages.forEach(p => {
      const el = p as HTMLElement;
      if (el.scrollHeight > el.clientHeight + 5) count++;
    });
    return { count, total: pages.length };
  });
  results.push({ name: '4. עמודים גולשים', status: overflowPages.count === 0 ? 'PASS' : 'FAIL', detail: `${overflowPages.count}/${overflowPages.total} עמודים גולשים` });

  // === בדיקה 5: איזון טורים — חצי מהעמודים טור 1 בלבד ===
  const columnBalance = await page.evaluate(() => {
    const pages = document.querySelectorAll('.tora-page[data-page-type="regular"], .tora-page[data-page-type="chapter-opener"]');
    let oneColumnOnly = 0;
    let twoColumns = 0;
    pages.forEach(p => {
      const rightBlocks = p.querySelectorAll('.tora-column-right > *').length;
      const leftBlocks = p.querySelectorAll('.tora-column-left > *').length;
      if (rightBlocks > 0 && leftBlocks === 0) oneColumnOnly++;
      else if (rightBlocks > 0 && leftBlocks > 0) twoColumns++;
    });
    return { oneColumnOnly, twoColumns, total: pages.length };
  });
  const balanceOk = columnBalance.oneColumnOnly <= columnBalance.total * 0.3;
  results.push({ name: '5. איזון טורים', status: balanceOk ? 'PASS' : 'FAIL', detail: `${columnBalance.oneColumnOnly} עמודים עם טור 1 בלבד, ${columnBalance.twoColumns} עם שני טורים (מתוך ${columnBalance.total})` });

  // === בדיקה 6: טקסט חלק ממורכז חלק מיושר ===
  const textAligns = await page.evaluate(() => {
    const paras = document.querySelectorAll('.tora-body-text');
    const aligns: Record<string, number> = {};
    paras.forEach(p => {
      const style = window.getComputedStyle(p);
      const align = style.textAlign;
      aligns[align] = (aligns[align] || 0) + 1;
    });
    return aligns;
  });
  const textAlignStr = Object.entries(textAligns).map(([k, v]) => `${k}:${v}`).join(', ');
  const alignOk = Object.keys(textAligns).length <= 2;
  results.push({ name: '6. עקביות text-align', status: alignOk ? 'PASS' : 'WARN', detail: textAlignStr });

  // === בדיקה 7: שורה אחרונה ממורכזת ===
  const lastLineAlign = await page.evaluate(() => {
    const paras = document.querySelectorAll('.tora-body-text');
    let centered = 0;
    let notCentered = 0;
    paras.forEach(p => {
      const lines = p.querySelectorAll('.tora-line');
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        const style = window.getComputedStyle(lastLine);
        if (style.textAlign === 'center' || style.textAlignLast === 'center') centered++;
        else notCentered++;
      }
    });
    return { centered, notCentered };
  });
  // רק p-end (פסקה אחרונה בטור) צריכה להיות ממורכזת
  results.push({ name: '7. שורה אחרונה ממורכזת', status: 'WARN', detail: `${lastLineAlign.centered} ממורכזות, ${lastLineAlign.notCentered} לא (רק p-end צריך)` });

  // === בדיקה 8: כותרות צד בצד לא נכון ===
  const sidenotes = await page.evaluate(() => {
    const pages = document.querySelectorAll('.tora-page');
    let mismatch = 0;
    let total = 0;
    pages.forEach(p => {
      const rightNotes = p.querySelectorAll('.tora-margin-right .tora-sidenote').length;
      const leftNotes = p.querySelectorAll('.tora-margin-left .tora-sidenote').length;
      if (rightNotes > 0 || leftNotes > 0) {
        total++;
        // בעמוד אי-זוגי → ימין. זוגי → שמאל.
        const pageNum = parseInt(p.getAttribute('data-page') || '0');
        const isOdd = pageNum % 2 === 1;
        if (isOdd && leftNotes > 0 && rightNotes === 0) mismatch++;
        if (!isOdd && rightNotes > 0 && leftNotes === 0) mismatch++;
      }
    });
    return { mismatch, total };
  });
  results.push({ name: '8. כותרות צד בצד נכון', status: sidenotes.mismatch === 0 ? 'PASS' : 'FAIL', detail: `${sidenotes.mismatch}/${sidenotes.total} בצד לא נכון` });

  // === בדיקה 9: תוכן עניינים לא מתחלק ===
  const tocOverflow = await page.evaluate(() => {
    const toc = document.querySelector('.tora-page[data-page-type="toc"]');
    if (!toc) return { exists: false, overflow: false };
    const el = toc as HTMLElement;
    return { exists: true, overflow: el.scrollHeight > el.clientHeight + 5 };
  });
  results.push({ name: '9. TOC overflow', status: !tocOverflow.overflow ? 'PASS' : 'FAIL', detail: tocOverflow.exists ? (tocOverflow.overflow ? 'TOC גולש!' : 'TOC תקין') : 'אין TOC' });

  // === בדיקה 10: H2 עם שני טורים (לא single-column) ===
  const h2Check = await page.evaluate(() => {
    const h2pages = document.querySelectorAll('.tora-page[data-page-type="chapter-opener"]');
    let withColumns = 0;
    let withSingle = 0;
    h2pages.forEach(p => {
      if (p.querySelector('.tora-columns')) withColumns++;
      if (p.querySelector('.tora-single-column')) withSingle++;
    });
    return { total: h2pages.length, withColumns, withSingle };
  });
  results.push({ name: '10. H2 עם שני טורים', status: h2Check.withSingle === 0 ? 'PASS' : 'FAIL', detail: `${h2Check.withColumns}/${h2Check.total} עם tora-columns, ${h2Check.withSingle} עם single-column` });

  // === בדיקה 11: tora-line + nowrap ===
  const lineCheck = await page.evaluate(() => {
    const lines = document.querySelectorAll('.tora-line');
    let nowrap = 0;
    lines.forEach(l => {
      const style = window.getComputedStyle(l);
      if (style.whiteSpace === 'nowrap') nowrap++;
    });
    return { total: lines.length, nowrap };
  });
  results.push({ name: '11. tora-line nowrap', status: lineCheck.nowrap === lineCheck.total ? 'PASS' : 'FAIL', detail: `${lineCheck.nowrap}/${lineCheck.total}` });

  // === בדיקה 12: XML גולמי ===
  const xmlCount = await page.evaluate(() => {
    return (document.body.innerHTML.match(/<\?xml/g) || []).length;
  });
  results.push({ name: '12. XML גולמי', status: xmlCount === 0 ? 'PASS' : 'FAIL', detail: `${xmlCount} מופעים` });

  // === דוח ===
  console.log('\n========================================');
  console.log('   דוח בדיקה מקיף');
  console.log('========================================\n');

  let passCount = 0;
  let failCount = 0;
  let warnCount = 0;

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${r.name}: ${r.detail}`);
    if (r.status === 'PASS') passCount++;
    else if (r.status === 'FAIL') failCount++;
    else warnCount++;
  }

  console.log(`\nסיכום: ${passCount} עבר, ${failCount} נכשל, ${warnCount} אזהרה`);
  console.log(`סה"כ עמודים: ${pageCount}`);

  await browser.close();

  // יציאה עם קוד שגיאה אם יש כשלונות
  if (failCount > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
