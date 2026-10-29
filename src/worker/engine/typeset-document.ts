import type { Settings, ParsedDocument, FinalPage, ColumnContent, Block, RenderedPage, AuditFinding, TraceEvent } from '../../types';
import type { TextMeasurer } from '../measurement/text-metrics';
import { breakLines } from '../measurement/text-metrics';
import { renderToHtml, type ShaarDesignData } from './renderer';
import { auditGeometryWithDoc } from '../../audit/geometry-audit';
import { fnv1a32 } from '../inputs/fnv-hash';
import { protectParens } from './paren-protector';

/**
 * פונקציה ראשית — טהורה.
 * מקבלת מסמך מזוהה + הגדרות + מודד, מחזירה עמודים מרונדרים.
 */
export function typesetDocument(
  doc: ParsedDocument,
  settings: Settings,
  measurer: TextMeasurer,
  onProgress?: (stage: string, percent: number, msg?: string) => void,
  shaarDesigns?: ShaarDesignData
): { pages: RenderedPage[]; findings: AuditFinding[]; durationMs: number; traceLog?: TraceEvent[] } {
  const start = performance.now();

  // 1. חישוב גדלים
  onProgress?.('measuring', 10, 'מחשב גדלים...');
  const pageSize = settings.pageSize;
  const pxPerMm = 3.7795; // 96 DPI
  const pageWidthPx = pageSize.width * pxPerMm;
  const pageHeightPx = pageSize.height * pxPerMm;
  const marginPx = settings.pageMargins.top * pxPerMm;
  const availableHeight = pageHeightPx - 2 * marginPx;
  const totalColumnsWidthPercent = settings.grid.columnWidth * 2 + settings.grid.marginWidth * 2 + settings.grid.gutterWidth;
  const columnWidthPx = (settings.grid.columnWidth / totalColumnsWidthPercent) * (pageWidthPx - 2 * marginPx);

  // 2. בניית בלוקים מה-AST
  onProgress?.('measuring', 20, 'בונה בלוקים...');
  const blocks = buildBlocksFromAst(doc, settings, measurer, columnWidthPx);

  // 3. חלוקה לעמודים
  onProgress?.('page-breaking', 40, 'מחלק לעמודים...');
  const pages = breakPages(blocks, settings, availableHeight, measurer);

  // 4. איזון טורים בכל עמוד
  onProgress?.('column-balancing', 60, 'מאזן טורים...');
  const balancedPages = pages.map((p) => balanceColumnsInPage(p, settings, availableHeight));

  // 5. הצבת הערות שוליים
  onProgress?.('footnote-placement', 70, 'מציב הערות...');
  const pagesWithFootnotes = balancedPages.map((p) => placeFootnotes(p, doc.footnotes, settings));

  // 6. תיקון אלמנות/יתומים
  onProgress?.('finalizing', 80, 'מתקן אלמנות...');
  let fixedPages = pagesWithFootnotes.map((p) => fixWidowsAndOrphans(p, settings));

  // 6b. הגנת סוגריים — שמירת זוגות [...] באותו עמוד/טור
  fixedPages = protectParens(fixedPages, settings);

  // 7. הוספת עמודי שער
  // מבנה: עמוד 1 = שער ראשי, עמוד 2 = שער אחורי (הגב של אותו דף), אחר כך TOC, אחר כך תוכן
  // שער משנה מופיע בתחילת כל חלק (H1) — כבר מטופל ב-breakPages
  const allPages: FinalPage[] = [];
  if (doc.metadata.bookName || doc.metadata.authorName) {
    // עמוד 1: שער ראשי
    allPages.push({
      pageNumber: 1,
      pageType: 'main-shaar',
      columns: [],
    });
    // עמוד 2: שער אחורי (גב השער הראשי)
    if (doc.metadata.copyright || doc.metadata.publisherDetails) {
      allPages.push({
        pageNumber: 2,
        pageType: 'back-shaar',
        columns: [],
      });
    }
  }
  // עמוד TOC: תוכן עניינים (לאחר השער, לפני התוכן)
  const tocHtmlStr = generateTocHtml(doc, settings, allPages.length + 1);
  // תוכן הספר
  allPages.push(...fixedPages);

  // מספור עמודים מחדש (רציף)
  allPages.forEach((p, i) => { p.pageNumber = i + 1; });

  // 8. רינדור ל-HTML
  onProgress?.('finalizing', 90, 'מרנדר...');
  const renderedPages: RenderedPage[] = allPages.map((page, idx) =>
    renderToHtml(page, idx + 1, settings, doc, shaarDesigns)
  );

  // 8b. הכנסת עמוד TOC לאחר השער ולפני התוכן
  if (tocHtmlStr) {
    const tocPageNumber = renderedPages.filter(p =>
      p.pageType === 'main-shaar' || p.pageType === 'back-shaar'
    ).length + 1;
    renderedPages.splice(tocPageNumber - 1, 0, {
      pageNumber: tocPageNumber,
      pageType: 'toc' as any,
      html: tocHtmlStr,
      geometry: {
        width: settings.pageSize.width,
        height: settings.pageSize.height,
        columns: [],
        hasShaar: false,
      },
    });
    // מספור מחדש
    renderedPages.forEach((p, i) => { p.pageNumber = i + 1; });
  }

  // 8. בדיקת גיאומטריה
  const findings = auditGeometryWithDoc(renderedPages, settings, doc);

  const durationMs = performance.now() - start;
  const outputHash = fnv1a32(renderedPages.map((p) => p.html).join(''));

  return { pages: renderedPages, findings, durationMs };
}

/**
 * יצירת עמוד תוכן עניינים מתוך ה-AST.
 * רשימת כותרות רמה 1-3 עם מספרי עמוד.
 */
function generateTocHtml(doc: ParsedDocument, settings: Settings, pageNumberOffset: number): string {
  const entries: string[] = [];
  let headingCounter = 0;

  function collectHeadings(nodes: any[], level: number) {
    for (const node of nodes) {
      if (node.type === 'heading' && node.headingLevel !== undefined) {
        const hLevel = node.headingLevel;
        // רק רמות שמופיעות בהגדרות תוכן העניינים
        if (settings.toc.generalLevels.includes(hLevel as 1|2|3|4|5|6)) {
          headingCounter++;
          const indent = (hLevel - 1) * 10;
          const pageEstimate = headingCounter + pageNumberOffset;
          entries.push(
            `<div class="tora-toc-entry tora-toc-level-${hLevel}" style="padding-right: ${indent}mm;">` +
            `<span class="tora-toc-title">${escapeHtmlSimple(node.text)}</span>` +
            `<span class="tora-toc-dots">·····································</span>` +
            `<span class="tora-toc-page">${pageEstimate}</span>` +
            `</div>`
          );
        }
      }
      if (node.children) {
        collectHeadings(node.children, level + 1);
      }
    }
  }

  collectHeadings(doc.root, 0);

  if (entries.length === 0) return '';

  return `
    <div class="tora-page tora-page-toc" data-page-type="toc">
      <div class="tora-toc-title">תוכן עניינים</div>
      <div class="tora-toc-list">
        ${entries.join('')}
      </div>
    </div>
  `.trim();
}

function escapeHtmlSimple(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * בניית בלוקים מה-AST.
 */
function buildBlocksFromAst(
  doc: ParsedDocument,
  settings: Settings,
  measurer: TextMeasurer,
  columnWidthPx: number
): Block[] {
  const blocks: Block[] = [];
  const bodyFont = settings.typography.bodyFont;

  for (const node of doc.root) {
    if (node.type === 'heading' && node.headingLevel !== undefined) {
      const headingCfg = settings.typography.headings[node.headingLevel];
      const headingFont = headingCfg?.font ?? bodyFont;
      const lines = breakLines(node.text, headingFont, columnWidthPx, measurer);
      const height = measurer.measureBlockHeight(lines, headingFont) + headingCfg?.marginTop + headingCfg?.marginBottom;
      blocks.push({
        type: 'heading',
        content: node.text,
        textType: 'heading',
        headingLevel: node.headingLevel,
        simanNumber: node.simanNumber,
        height,
        width: columnWidthPx,
      });
      // children
      if (node.children) {
        for (const child of node.children) {
          if (child.type === 'body' || child.type === 'custom') {
            const childLines = breakLines(child.text, bodyFont, columnWidthPx, measurer);
            const childHeight = measurer.measureBlockHeight(childLines, bodyFont);
            blocks.push({
              type: 'paragraph',
              content: child.text,
              textType: child.type === 'custom' ? 'custom' : 'body',
              height: childHeight,
              width: columnWidthPx,
            });
          }
        }
      }
    } else if (node.type === 'body' || node.type === 'custom') {
      const lines = breakLines(node.text, bodyFont, columnWidthPx, measurer);
      const height = measurer.measureBlockHeight(lines, bodyFont);
      blocks.push({
        type: 'paragraph',
        content: node.text,
        textType: node.type === 'custom' ? 'custom' : 'body',
        height,
        width: columnWidthPx,
      });
    }
  }

  return blocks;
}

/**
 * חלוקת בלוקים לעמודים.
 * כללים:
 * - H2 תמיד פותח עמוד חדש
 * - אם בלוק לא נכנס בעמוד הנוכחי, עובר לבא
 */
function breakPages(
  blocks: Block[],
  settings: Settings,
  pageHeight: number,
  _measurer: TextMeasurer
): FinalPage[] {
  const pages: FinalPage[] = [];
  let currentPage: FinalPage | null = null;
  let leftBlocks: Block[] = [];
  let rightBlocks: Block[] = [];
  let leftHeight = 0;
  let rightHeight = 0;
  let pageNumber = 0;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  let pendingHeading: Block | null = null;

  const startNewPage = (pageType: import('../../types').PageType = 'regular', heading?: { level: number; text: string; simanNumber?: number }) => {
    if (currentPage) {
      currentPage.columns = [
        { index: 0, blocks: leftBlocks, height: leftHeight, width: 0 },
        { index: 1, blocks: rightBlocks, height: rightHeight, width: 0 },
      ];
      pages.push(currentPage);
    }
    pageNumber++;
    currentPage = {
      pageNumber,
      pageType,
      columns: [],
      heading: heading ? { level: heading.level as 0|1|2|3|4|5|6|7, text: heading.text, simanNumber: heading.simanNumber } : undefined,
    };
    leftBlocks = [];
    rightBlocks = [];
    leftHeight = 0;
    rightHeight = 0;
  };

  for (const block of blocks) {
    // H2 תמיד פותח עמוד חדש
    if (block.type === 'heading' && block.headingLevel === 2) {
      startNewPage('chapter-opener', {
        level: 2,
        text: block.content,
        simanNumber: block.simanNumber,
      });
      pendingHeading = null;
      continue;
    }

    // H1 גם פותח עמוד חדש (שער משנה)
    if (block.type === 'heading' && block.headingLevel === 1) {
      startNewPage('sub-shaar', {
        level: 1,
        text: block.content,
      });
      continue;
    }

    // H0 פותח עמוד חדש
    if (block.type === 'heading' && block.headingLevel === 0) {
      startNewPage('regular', {
        level: 0,
        text: block.content,
      });
      continue;
    }

    if (!currentPage) {
      startNewPage('regular');
    }

    // 0.92 = ניצול מירבי של העמוד (88% מהגובה הפנוי)
    const targetHeight = pageHeight * 0.92;
    const blockTooBig = block.height > targetHeight;

    // 1) נסה להכניס לטור הימני (RTL — טור ראשון)
    if (rightHeight + block.height <= targetHeight || (blockTooBig && rightHeight === 0)) {
      rightBlocks.push(block);
      rightHeight += block.height;
    }
    // 2) טור ימני מלא — עבור לשמאלי (מילוי הטור השני לפני פתיחת עמוד חדש)
    else if (leftHeight + block.height <= targetHeight || (blockTooBig && leftHeight === 0 && rightHeight > 0)) {
      leftBlocks.push(block);
      leftHeight += block.height;
    }
    // 3) שני הטורים מלאים — פותחים עמוד חדש
    else {
      startNewPage('regular');
      rightBlocks.push(block);
      rightHeight = block.height;
    }
  }

  if (currentPage) {
    const finalPage: FinalPage = currentPage;
    finalPage.columns = [
      { index: 0, blocks: rightBlocks, height: rightHeight, width: 0 },  // ימני = index 0
      { index: 1, blocks: leftBlocks, height: leftHeight, width: 0 },    // שמאלי = index 1
    ];
    pages.push(finalPage);
  }

  return pages;
}

/**
 * איזון טורים — אלגוריתם דו-שלבי.
 *
 * 1) מעביר בלוקים בזה אחר זה מהטור הגבוה לנמוך עד שהפער מתהפך
 * 2) בוחר את המצב עם הפער המינימלי
 */
function balanceColumnsInPage(page: FinalPage, _settings: Settings, _pageHeight: number): FinalPage {
  if (page.columns.length !== 2) return page;

  const right = page.columns[0]!;
  const left = page.columns[1]!;
  const diff = right.height - left.height;
  if (Math.abs(diff) < 30) return page;

  if (diff > 0 && right.blocks.length > 1) {
    // ימני גבוה — העבר מסופו לתחילת השמאלי
    let bestDiff = Math.abs(right.height - left.height);
    let bestRightBlocks = right.blocks;
    let bestLeftBlocks = left.blocks;
    let bestRightH = right.height;
    let bestLeftH = left.height;

    const rightCopy = [...right.blocks];
    const leftCopy = [...left.blocks];
    let rightH = right.height;
    let leftH = left.height;

    while (rightCopy.length > 1) {
      const block = rightCopy.pop()!;
      rightH -= block.height;
      leftCopy.unshift(block);
      leftH += block.height;
      const curDiff = Math.abs(rightH - leftH);
      if (curDiff < bestDiff) {
        bestDiff = curDiff;
        bestRightBlocks = [...rightCopy];
        bestLeftBlocks = [...leftCopy];
        bestRightH = rightH;
        bestLeftH = leftH;
      }
      if (leftH > rightH + 5) break;
    }
    right.blocks = bestRightBlocks;
    right.height = bestRightH;
    left.blocks = bestLeftBlocks;
    left.height = bestLeftH;
  } else if (diff < 0 && left.blocks.length > 1) {
    // שמאלי גבוה — העבר מתחילתו לסוף הימני
    let bestDiff = Math.abs(right.height - left.height);
    let bestRightBlocks = right.blocks;
    let bestLeftBlocks = left.blocks;
    let bestRightH = right.height;
    let bestLeftH = left.height;

    const rightCopy = [...right.blocks];
    const leftCopy = [...left.blocks];
    let rightH = right.height;
    let leftH = left.height;

    while (leftCopy.length > 1) {
      const block = leftCopy.shift()!;
      leftH -= block.height;
      rightCopy.push(block);
      rightH += block.height;
      const curDiff = Math.abs(rightH - leftH);
      if (curDiff < bestDiff) {
        bestDiff = curDiff;
        bestRightBlocks = [...rightCopy];
        bestLeftBlocks = [...leftCopy];
        bestRightH = rightH;
        bestLeftH = leftH;
      }
      if (rightH > leftH + 5) break;
    }
    right.blocks = bestRightBlocks;
    right.height = bestRightH;
    left.blocks = bestLeftBlocks;
    left.height = bestLeftH;
  }

  return page;
}

/**
 * הצבת הערות שוליים — מוסיף FootnoteBlock לעמודים שיש בהם סימני הערות.
 */
function placeFootnotes(page: FinalPage, footnotes: import('../../types').ParsedFootnote[], settings: Settings): FinalPage {
  // חיפוש סימני הערות בתוכן העמוד
  const fnMarker = '\u0001FN:';
  const foundFootnoteIds: string[] = [];

  for (const col of page.columns) {
    for (const block of col.blocks) {
      if (block.content.includes(fnMarker)) {
        // חילוץ מזהי הערות
        const regex = /\u0001FN:([^\u0002]+)\u0002/g;
        let match;
        while ((match = regex.exec(block.content)) !== null) {
          foundFootnoteIds.push(match[1]!);
        }
      }
    }
  }

  if (foundFootnoteIds.length === 0) return page;

  const foundNotes = foundFootnoteIds
    .map((id) => footnotes.find((f) => f.id === id))
    .filter((f): f is import('../../types').ParsedFootnote => f !== undefined);

  return {
    ...page,
    footnotes: {
      notes: foundNotes,
      height: foundNotes.length * 20, // הערכה
      dividerStyle: settings.notes.dividerStyle,
    },
  };
}

/**
 * תיקון אלמנות/יתומים וכותרות תלויות — מימוש אמיתי.
 *
 * 1. כותרת תלויה: אם הבלוק האחרון בטור הימני הוא כותרת — העבר לשמאלי
 * 2. יתום: פסקה קצרה בסוף טור ימני → העבר לשמאלי
 * 3. אלמנה: פסקה קצרה בתחילת טור שמאלי → משוך בלוק מהימני
 */
function fixWidowsAndOrphans(page: FinalPage, settings: Settings): FinalPage {
  if (page.columns.length !== 2) return page;
  const {
    preventWidow,
    preventOrphan,
    preventHangingHeadings,
  } = settings.quality;
  if (!preventWidow && !preventOrphan && !preventHangingHeadings) return page;

  // סף ל"פסקה קצרה" — ~1.5 × גובה שורה (25px ברירת מחדל)
  const shortParagraphThreshold = 25;

  const right = page.columns[0]!;
  const left = page.columns[1]!;

  // 1. כותרת תלויה בסוף טור ימני → העבר לתחילת טור שמאלי
  if (preventHangingHeadings && right.blocks.length > 1) {
    const lastRight = right.blocks[right.blocks.length - 1]!;
    if (lastRight.type === 'heading') {
      right.blocks.pop();
      right.height -= lastRight.height;
      left.blocks.unshift(lastRight);
      left.height += lastRight.height;
    }
  }

  // 2. יתום — פסקה קצרה בסוף טור ימני → העבר לתחילת טור שמאלי
  if (preventOrphan && right.blocks.length > 1) {
    const lastRight = right.blocks[right.blocks.length - 1]!;
    if (lastRight.type === 'paragraph' && lastRight.height < shortParagraphThreshold) {
      right.blocks.pop();
      right.height -= lastRight.height;
      left.blocks.unshift(lastRight);
      left.height += lastRight.height;
    }
  }

  // 3. אלמנה — פסקה קצרה בתחילת טור שמאלי → משוך בלוק מסוף הטור הימני
  if (preventWidow && left.blocks.length > 0 && right.blocks.length > 1) {
    const firstLeft = left.blocks[0]!;
    if (firstLeft.type === 'paragraph' && firstLeft.height < shortParagraphThreshold) {
      const lastRight = right.blocks[right.blocks.length - 1]!;
      if (lastRight.type === 'paragraph') {
        right.blocks.pop();
        right.height -= lastRight.height;
        left.blocks.unshift(lastRight);
        left.height += lastRight.height;
      }
    }
  }

  return page;
}
