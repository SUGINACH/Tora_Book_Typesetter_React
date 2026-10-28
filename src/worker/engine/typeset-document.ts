import type { Settings, ParsedDocument, FinalPage, ColumnContent, Block, RenderedPage, AuditFinding, TraceEvent } from '../../types';
import type { TextMeasurer } from '../measurement/text-metrics';
import { breakLines } from '../measurement/text-metrics';
import { renderToHtml } from './renderer';
import { auditGeometry } from '../../audit/geometry-audit';
import { fnv1a32 } from '../inputs/fnv-hash';

/**
 * פונקציה ראשית — טהורה.
 * מקבלת מסמך מזוהה + הגדרות + מודד, מחזירה עמודים מרונדרים.
 */
export function typesetDocument(
  doc: ParsedDocument,
  settings: Settings,
  measurer: TextMeasurer,
  onProgress?: (stage: string, percent: number, msg?: string) => void
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
  const fixedPages = pagesWithFootnotes.map((p) => fixWidowsAndOrphans(p, settings));

  // 7. רינדור ל-HTML
  onProgress?.('finalizing', 90, 'מרנדר...');
  const renderedPages = fixedPages.map((page, idx) =>
    renderToHtml(page, idx + 1, settings, doc)
  );

  // 8. בדיקת גיאומטריה
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

    // חלוקה בין טורים — איזון פשוט
    const targetHeight = pageHeight * 0.85; // מותיר מקום ל-footnotes
    if (leftHeight <= rightHeight && leftHeight + block.height <= targetHeight) {
      leftBlocks.push(block);
      leftHeight += block.height;
    } else if (rightHeight + block.height <= targetHeight) {
      rightBlocks.push(block);
      rightHeight += block.height;
    } else {
      // שני הטורים מלאים — פותחים עמוד חדש
      startNewPage('regular');
      leftBlocks.push(block);
      leftHeight = block.height;
    }
  }

  if (currentPage) {
    const finalPage: FinalPage = currentPage;
    finalPage.columns = [
      { index: 0, blocks: leftBlocks, height: leftHeight, width: 0 },
      { index: 1, blocks: rightBlocks, height: rightHeight, width: 0 },
    ];
    pages.push(finalPage);
  }

  return pages;
}

/**
 * איזון טורים בעמוד — פשוט לעת עתה (כבר מאוזן מהחלוקה).
 */
function balanceColumnsInPage(page: FinalPage, _settings: Settings, _pageHeight: number): FinalPage {
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
 * תיקון אלמנות/יתומים — לעת עתה ללא שינוי (placeholder).
 */
function fixWidowsAndOrphans(page: FinalPage, _settings: Settings): FinalPage {
  // TODO: יישום מלא — העברת שורות בין טורים
  return page;
}
