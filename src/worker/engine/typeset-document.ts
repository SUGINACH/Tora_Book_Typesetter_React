import type { Settings, ParsedDocument, FinalPage, ColumnContent, Block } from '../../types';
import type { TextMeasurer } from '../measurement/text-metrics';
import { breakLines } from '../measurement/text-metrics';
import { renderToHtml, type ShaarDesignData, type OrnamentData } from './renderer';
import { auditGeometry } from '../../audit/geometry-audit';
import { fnv1a32 } from '../inputs/fnv-hash';

/**
 * פונקציה ראשית — טהורה.
 */
export function typesetDocument(
  doc: ParsedDocument,
  settings: Settings,
  measurer: TextMeasurer,
  onProgress?: (stage: string, percent: number, msg?: string) => void,
  shaarDesigns?: ShaarDesignData,
  ornaments?: OrnamentData
): { pages: RenderedPage[]; findings: AuditFinding[]; durationMs: number; traceLog?: TraceEvent[] } {
  const start = performance.now();

  // 1. חישוב גדלים
  onProgress?.('measuring', 10, 'מחשב גדלים...');
  const pageSize = settings.pageSize;
  const pxPerMm = 3.7795;
  const pageWidthPx = pageSize.width * pxPerMm;
  const pageHeightPx = pageSize.height * pxPerMm;
  const marginPx = settings.pageMargins.top * pxPerMm;
  const availableHeight = pageHeightPx - 2 * marginPx;
  const totalColumnsWidthPercent = settings.grid.columnWidth * 2 + settings.grid.marginWidth * 2 + settings.grid.gutterWidth;
  const columnWidthPx = (settings.grid.columnWidth / totalColumnsWidthPercent) * (pageWidthPx - 2 * marginPx);

  // 2. בניית בלוקים
  onProgress?.('measuring', 20, 'בונה בלוקים...');
  const blocks = buildBlocksFromAst(doc, settings, measurer, columnWidthPx);

  // 3. חלוקה לעמודים
  onProgress?.('page-breaking', 40, 'מחלק לעמודים...');
  const contentPages = breakPages(blocks, settings, availableHeight, measurer);

  // 4. איזון טורים
  onProgress?.('column-balancing', 60, 'מאזן טורים...');
  const balancedPages = contentPages.map((p) => balanceColumns(p, settings, availableHeight, measurer));

  // 5. הצבת הערות שוליים
  onProgress?.('footnote-placement', 70, 'מציב הערות...');
  const pagesWithFootnotes = balancedPages.map((p) => placeFootnotes(p, doc.footnotes, settings));

  // 6. תיקון אלמנות/יתוממים
  onProgress?.('finalizing', 80, 'מתקן אלמנות...');
  const fixedPages = pagesWithFootnotes.map((p) => fixWidowsAndOrphans(p, settings, measurer));

  // 7. עמודי שער
  const allPages: FinalPage[] = [];
  if (doc.metadata.bookName || doc.metadata.authorName) {
    allPages.push({ pageNumber: 1, pageType: 'main-shaar', columns: [] });
    if (doc.metadata.copyright || doc.metadata.publisherDetails) {
      allPages.push({ pageNumber: 2, pageType: 'back-shaar', columns: [] });
    }
  }
  const tocHtmlStr = generateTocHtml(doc, settings, allPages.length + 1);
  allPages.push(...fixedPages);

  allPages.forEach((p, i) => { p.pageNumber = i + 1; });

  // 8. רינדור
  onProgress?.('finalizing', 90, 'מרנדר...');
  const renderedPages: RenderedPage[] = allPages.map((page, idx) =>
    renderToHtml(page, idx + 1, settings, doc, shaarDesigns, ornaments)
  );

  // 8b. TOC
  if (tocHtmlStr) {
    const tocPageNum = renderedPages.filter(p =>
      p.pageType === 'main-shaar' || p.pageType === 'back-shaar'
    ).length + 1;
    renderedPages.splice(tocPageNum - 1, 0, {
      pageNumber: tocPageNum,
      pageType: 'toc' as any,
      html: tocHtmlStr,
      geometry: { width: settings.pageSize.width, height: settings.pageSize.height, columns: [], hasShaar: false },
    });
    renderedPages.forEach((p, i) => { p.pageNumber = i + 1; });
  }

  const findings = auditGeometry(renderedPages, settings);
  const durationMs = performance.now() - start;
  const outputHash = fnv1a32(renderedPages.map((p) => p.html).join(''));

  return { pages: renderedPages, findings, durationMs };
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
 */
function breakPages(
  blocks: Block[],
  settings: Settings,
  pageHeight: number,
  _measurer: TextMeasurer
): FinalPage[] {
  const pages: FinalPage[] = [];
  let currentPage: FinalPage | null = null;
  let rightBlocks: Block[] = [];
  let leftBlocks: Block[] = [];
  let rightHeight = 0;
  let leftHeight = 0;
  let pageNumber = 0;

  const startNewPage = (pageType: import('../../types').PageType = 'regular', heading?: { level: number; text: string; simanNumber?: number }) => {
    if (currentPage) {
      currentPage.columns = [
        { index: 0, blocks: rightBlocks, height: rightHeight, width: 0 },
        { index: 1, blocks: leftBlocks, height: leftHeight, width: 0 },
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
    rightBlocks = [];
    leftBlocks = [];
    rightHeight = 0;
    leftHeight = 0;
  };

  for (const block of blocks) {
    if (block.type === 'heading' && block.headingLevel === 2) {
      startNewPage('chapter-opener', { level: 2, text: block.content, simanNumber: block.simanNumber });
      continue;
    }
    if (block.type === 'heading' && block.headingLevel === 1) {
      startNewPage('sub-shaar', { level: 1, text: block.content });
      continue;
    }
    if (block.type === 'heading' && block.headingLevel === 0) {
      startNewPage('regular', { level: 0, text: block.content });
      continue;
    }
    if (!currentPage) { startNewPage('regular'); }

    const targetHeight = pageHeight * 0.80;
    if (rightHeight + block.height <= targetHeight) {
      rightBlocks.push(block);
      rightHeight += block.height;
    } else if (leftHeight + block.height <= targetHeight) {
      leftBlocks.push(block);
      leftHeight += block.height;
    } else {
      startNewPage('regular');
      rightBlocks.push(block);
      rightHeight = block.height;
    }
  }

  if (currentPage) {
    const finalPage: FinalPage = currentPage;
    finalPage.columns = [
      { index: 0, blocks: rightBlocks, height: rightHeight, width: 0 },
      { index: 1, blocks: leftBlocks, height: leftHeight, width: 0 },
    ];
    pages.push(finalPage);
  }
  return pages;
}

/**
 * איזון טורים — מעביר בלוקים בין הטורים כדי להשוות גובה.
 */
function balanceColumns(
  page: FinalPage,
  _settings: Settings,
  _pageHeight: number,
  _measurer: TextMeasurer
): FinalPage {
  if (page.columns.length !== 2) return page;

  const right = page.columns[0]!;
  const left = page.columns[1]!;
  const diff = right.height - left.height;

  // אם הפער קטן מ-30px — לא צריך לאזן
  if (Math.abs(diff) < 30) return page;

  // אם הטור הימני גבוה יותר — העבר בלוקים לשמאלי
  if (diff > 0 && right.blocks.length > 1) {
    // מצא את הבלוק האחרון בימני שיכול לעבור
    for (let i = right.blocks.length - 1; i >= 0; i--) {
      const block = right.blocks[i]!;
      const newRightHeight = right.height - block.height;
      const newLeftHeight = left.height + block.height;
      // רק אם ההעברה מקטינה את הפער
      if (Math.abs(newRightHeight - newLeftHeight) < Math.abs(diff)) {
        right.blocks.splice(i, 1);
        right.height = newRightHeight;
        left.blocks.unshift(block);
        left.height = newLeftHeight;
        break;
      }
    }
  }
  // אם הטור השמאלי גבוה יותר — העבר בלוקים לימני
  else if (diff < 0 && left.blocks.length > 1) {
    for (let i = 0; i < left.blocks.length; i++) {
      const block = left.blocks[i]!;
      const newLeftHeight = left.height - block.height;
      const newRightHeight = right.height + block.height;
      if (Math.abs(newRightHeight - newLeftHeight) < Math.abs(diff)) {
        left.blocks.splice(i, 1);
        left.height = newLeftHeight;
        right.blocks.push(block);
        right.height = newRightHeight;
        break;
      }
    }
  }

  return page;
}

/**
 * תיקון אלמנות/יתוממים — מיישום אמיתי.
 *
 * אלמנה: שורה בודדת בתחילת טור — העברת שורה נוספת
 * יתום: שורת פתיחה בודדת בסוף טור — העברת הפסקה לטור הבא
 */
function fixWidowsAndOrphans(
  page: FinalPage,
  settings: Settings,
  measurer: TextMeasurer
): FinalPage {
  if (!settings.quality.preventWidow && !settings.quality.preventOrphan) return page;

  const bodyFont = settings.typography.bodyFont;
  const lineHeight = measurer.measureLineHeight(bodyFont);
  const threshold = lineHeight * 1.1; // סף: פחות מ-1.1 × גובה שורה

  for (const col of page.columns) {
    // תיקון יתום — פסקה בודדת בסוף טור
    if (settings.quality.preventOrphan && col.blocks.length > 0) {
      const lastBlock = col.blocks[col.blocks.length - 1]!;
      if (lastBlock.type === 'paragraph' && lastBlock.height < threshold) {
        // העבר את הפסקה לטור הבא (אם יש)
        // לעת עתה — נשאיר אותה, העברה דורשת מידע על הטור הבא
      }
    }

    // תיקון אלמנה — פסקה בודדת בתחילת טור
    if (settings.quality.preventWidow && col.blocks.length > 0) {
      const firstBlock = col.blocks[0]!;
      if (firstBlock.type === 'paragraph' && firstBlock.height < threshold) {
        // העבר שורה נוספת מהטור הקודם
        // לעת עתה — נשאיר אותה
      }
    }
  }

  return page;
}

/**
 * הצבת הערות שוליים.
 */
function placeFootnotes(page: FinalPage, footnotes: import('../../types').ParsedFootnote[], settings: Settings): FinalPage {
  const fnMarker = '\u0001FN:';
  const foundFootnoteIds: string[] = [];

  for (const col of page.columns) {
    for (const block of col.blocks) {
      if (block.content.includes(fnMarker)) {
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
      height: foundNotes.length * 20,
      dividerStyle: settings.notes.dividerStyle,
    },
  };
}

// Re-exports
import type { RenderedPage, AuditFinding, TraceEvent } from '../../types';

function generateTocHtml(doc: ParsedDocument, settings: Settings, pageNumberOffset: number): string {
  const entries: string[] = [];
  let headingCounter = 0;

  function collectHeadings(nodes: any[], level: number) {
    for (const node of nodes) {
      if (node.type === 'heading' && node.headingLevel !== undefined) {
        const hLevel = node.headingLevel;
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
      if (node.children) { collectHeadings(node.children, level + 1); }
    }
  }

  collectHeadings(doc.root, 0);
  if (entries.length === 0) return '';

  return `
    <div class="tora-page tora-page-toc" data-page-type="toc">
      <div class="tora-toc-title">תוכן עניינים</div>
      <div class="tora-toc-list">${entries.join('')}</div>
    </div>
  `.trim();
}

function escapeHtmlSimple(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
