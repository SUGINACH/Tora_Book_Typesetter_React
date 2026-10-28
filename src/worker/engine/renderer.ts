import type { FinalPage, RenderedPage, Settings, ParsedDocument, Block, PageType } from '../../types';
import { toGematria } from '../../lib/gematria';

// סוגי עמודים שאין בהם כותרת עליונה ומספר עמוד
const NO_HEADER_PAGE_TYPES: PageType[] = ['main-shaar', 'sub-shaar', 'back-shaar'];

// סוגי עמודים שהם "שער" — מבנה מיוחד
const SHAAR_PAGE_TYPES: PageType[] = ['main-shaar', 'sub-shaar', 'back-shaar'];

/**
 * רינדור FinalPage ל-HTML string.
 */
export function renderToHtml(
  page: FinalPage,
  pageNumber: number,
  settings: Settings,
  doc: ParsedDocument
): RenderedPage {
  const html = renderPageHtml(page, pageNumber, settings, doc);
  return {
    pageNumber,
    pageType: page.pageType,
    html,
    geometry: {
      width: settings.pageSize.width,
      height: settings.pageSize.height,
      columns: page.columns.map((c, i) => ({
        index: i as 0 | 1,
        width: c.width,
        height: c.height,
        blockCount: c.blocks.length,
        lineCount: c.blocks.reduce((acc, b) => acc + (b.content.split('\n').length || 1), 0),
      })),
      footnoteAreaHeight: page.footnotes?.height,
      hasShaar: SHAAR_PAGE_TYPES.includes(page.pageType),
    },
  };
}

function renderPageHtml(
  page: FinalPage,
  pageNumber: number,
  settings: Settings,
  doc: ParsedDocument
): string {
  const isShaar = SHAAR_PAGE_TYPES.includes(page.pageType);
  const showHeader = !NO_HEADER_PAGE_TYPES.includes(page.pageType);
  const isH2Page = page.pageType === 'chapter-opener';

  // עמוד שער — מבנה מיוחד
  if (isShaar) {
    return renderShaarPage(page, pageNumber, settings, doc);
  }

  // עמוד רגיל או פתיחת פרק
  const runningHeader = showHeader ? renderRunningHeader(page, settings, doc) : '';
  const columns = page.columns.map((col, i) => renderColumn(col, i, settings)).join('');
  const footnotes = page.footnotes ? renderFootnotes(page.footnotes, settings) : '';
  const pageNumberHtml = showHeader ? renderPageNumber(pageNumber, settings) : '';
  const headingHtml = page.heading ? renderHeading(page.heading, settings) : '';

  return `
    <div class="tora-page ${isH2Page ? 'tora-page-h2' : ''}" data-page="${pageNumber}" data-page-type="${page.pageType}">
      ${runningHeader}
      ${isH2Page ? `<div class="h2-top-ornament"></div>` : ''}
      ${headingHtml ? `<div class="tora-heading-wrapper">${headingHtml}</div>` : ''}
      ${isH2Page ? `<div class="h2-bottom-ornament"></div>` : ''}
      <div class="tora-columns">
        ${columns}
      </div>
      ${footnotes}
      ${pageNumberHtml}
    </div>
  `.trim();
}

/**
 * רינדור עמוד שער — מבנה מיוחד, ממורכז, ללא כותרות עליונות.
 */
function renderShaarPage(
  page: FinalPage,
  _pageNumber: number,
  settings: Settings,
  doc: ParsedDocument
): string {
  const meta = doc.metadata;
  const isMainShaar = page.pageType === 'main-shaar';
  const isBackShaar = page.pageType === 'back-shaar';
  const isSubShaar = page.pageType === 'sub-shaar';

  // שער ראשי — מציג את כל שדות ה-metadata
  if (isMainShaar) {
    return `
      <div class="tora-page tora-page-shaar tora-page-main-shaar" data-page-type="main-shaar">
        <div class="tora-shaar-content">
          ${meta.bookName ? `<div class="tora-shaar-title">${escapeHtml(meta.bookName)}</div>` : ''}
          ${meta.subject ? `<div class="tora-shaar-subtitle">${escapeHtml(meta.subject)}</div>` : ''}
          ${meta.detailedSubject ? `<div class="tora-shaar-desc">${escapeHtml(meta.detailedSubject)}</div>` : ''}
          ${meta.editionDetails ? `<div class="tora-shaar-sections">${escapeHtml(meta.editionDetails)}</div>` : ''}
          ${meta.authorName ? `<div class="tora-shaar-author">${escapeHtml(meta.authorName)}</div>` : ''}
          ${meta.placeAndYear ? `<div class="tora-shaar-year">${escapeHtml(meta.placeAndYear)}</div>` : ''}
        </div>
      </div>
    `.trim();
  }

  // שער אחורי — מציג פרטי זכויות והוצאה לאור
  if (isBackShaar) {
    return `
      <div class="tora-page tora-page-shaar tora-page-back-shaar" data-page-type="back-shaar">
        <div class="tora-shaar-content tora-shaar-back">
          ${meta.copyright ? `<div class="tora-shaar-copyright">${escapeHtml(meta.copyright)}</div>` : ''}
          ${meta.publisherDetails ? `<div class="tora-shaar-publisher">${escapeHtml(meta.publisherDetails)}</div>` : ''}
          ${meta.contactDetails ? `<div class="tora-shaar-contact">${escapeHtml(meta.contactDetails)}</div>` : ''}
          ${meta.additionalDetails ? `<div class="tora-shaar-extra">${escapeHtml(meta.additionalDetails)}</div>` : ''}
        </div>
      </div>
    `.trim();
  }

  // שער משנה — מציג את כותרת החלק
  if (isSubShaar && page.heading) {
    return `
      <div class="tora-page tora-page-shaar tora-page-sub-shaar" data-page-type="sub-shaar">
        <div class="tora-shaar-content tora-shaar-sub">
          <div class="tora-shaar-title">${escapeHtml(page.heading.text)}</div>
        </div>
      </div>
    `.trim();
  }

  // fallback
  return `<div class="tora-page tora-page-shaar" data-page-type="${page.pageType}"></div>`;
}

function renderColumn(col: import('../../types').ColumnContent, idx: number, settings: Settings): string {
  const cls = idx === 0 ? 'tora-column-right' : 'tora-column-left';
  const divider = settings.grid.columnDivider !== 'none'
    ? `<div class="tora-column-divider tora-divider-${settings.grid.columnDivider}"></div>`
    : '';

  return `
    <div class="tora-column ${cls}">
      ${col.blocks.map((b) => renderBlock(b, settings)).join('')}
    </div>
    ${idx === 0 ? divider : ''}
  `.trim();
}

function renderBlock(block: Block, settings: Settings): string {
  switch (block.type) {
    case 'paragraph':
      return `<p class="tora-body-text">${escapeHtml(block.content)}</p>`;
    case 'heading':
      if (block.headingLevel === undefined) return '';
      const h = settings.typography.headings[block.headingLevel as 0|1|2|3|4|5|6|7];
      const fontCss = h ? fontConfigToCss(h.font) : '';
      return `<div class="tora-heading tora-heading-${block.headingLevel}" style="${fontCss}">${escapeHtml(block.content)}</div>`;
    case 'footnote':
      return `<div class="tora-footnote">${escapeHtml(block.content)}</div>`;
    case 'ornament':
      return `<div class="tora-ornament">${block.content}</div>`;
    case 'page-break':
      return '';
    default:
      return `<p>${escapeHtml(block.content)}</p>`;
  }
}

function renderHeading(heading: { level: number; text: string; simanNumber?: number }, settings: Settings): string {
  const level = heading.level as 0|1|2|3|4|5|6|7;
  const cfg = settings.typography.headings[level];
  const fontCss = cfg ? fontConfigToCss(cfg.font) : '';
  const simanBadge = heading.simanNumber ? `<div class="tora-siman-badge">סימן ${toGematria(heading.simanNumber)}</div>` : '';
  return `
    <div class="tora-heading tora-heading-level-${level}" style="${fontCss}">
      ${escapeHtml(heading.text)}
    </div>
    ${simanBadge}
  `.trim();
}

function renderRunningHeader(page: FinalPage, settings: Settings, doc: ParsedDocument): string {
  const cfg = settings.runningHeader;
  const right = getHeaderContent(cfg.rightContent, page, doc);
  const center = getHeaderContent(cfg.centerContent, page, doc);
  const left = getHeaderContent(cfg.leftContent, page, doc);
  return `
    <div class="tora-running-header">
      <div class="tora-rh-right" style="text-align: ${cfg.rightAlign};">${right}</div>
      <div class="tora-rh-center" style="text-align: ${cfg.centerAlign};">${center}</div>
      <div class="tora-rh-left" style="text-align: ${cfg.leftAlign};">${left}</div>
    </div>
  `.trim();
}

function getHeaderContent(
  source: import('../../types').HeaderContentSource,
  page: FinalPage,
  doc: ParsedDocument
): string {
  switch (source) {
    case 'book-name':
      return escapeHtml(doc.metadata.bookName ?? '');
    case 'chapter-name':
      return escapeHtml(page.heading?.text ?? '');
    case 'page-number':
      return toGematria(page.pageNumber);
    case 'h4':
      return '';
    case 'first-word-last-word':
      return '';
    default:
      return '';
  }
}

function renderFootnotes(footnotes: import('../../types').FootnoteBlock, settings: Settings): string {
  if (footnotes.notes.length === 0) return '';
  const dividerClass = `tora-fn-divider-${footnotes.dividerStyle}`;
  const noteSize = settings.notes.noteMarkerSize;
  return `
    <div class="tora-footnotes-area">
      <div class="tora-fn-divider ${dividerClass}"></div>
      ${footnotes.notes.map((fn, i) => {
        const marker = i + 1;
        return `
          <div class="tora-footnote" style="font-size: ${noteSize}pt;">
            <span class="tora-fn-marker">${toGematria(marker)}</span>
            <span class="tora-fn-text">${escapeHtml(fn.text)}</span>
          </div>
        `.trim();
      }).join('')}
    </div>
  `.trim();
}

function renderPageNumber(num: number, settings: Settings): string {
  const format = settings.grid.pageNumberFormat;
  let display: string;
  if (format === 'hebrew-letter') {
    display = toGematria(num);
  } else if (format === 'hebrew-letter-daf') {
    display = `דף ${toGematria(num)}`;
  } else {
    display = String(num);
  }

  const frame = settings.grid.pageNumberFrame;
  const framed = applyFrame(display, frame);
  return `<div class="tora-page-number tora-pn-${settings.grid.pageNumberPosition}">${framed}</div>`;
}

function applyFrame(text: string, frame: import('../../types').PageNumberFrame): string {
  switch (frame) {
    case 'none':
      return text;
    case 'circle':
      return `<span class="tora-frame-circle">${text}</span>`;
    case 'square':
      return `<span class="tora-frame-square">${text}</span>`;
    case 'round-parens':
      return `(${text})`;
    case 'square-brackets':
      return `[${text}]`;
    case 'diamond':
      return `◆${text}◆`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function fontConfigToCss(font: import('../../types').FontConfig): string {
  const size = typeof font.size === 'number' ? `${font.size}pt` : font.size;
  const weight = font.weight ?? 400;
  const italic = font.italic ? 'italic' : 'normal';
  const family = font.family.map((f) => `'${f}'`).join(', ');
  const color = font.color ?? '#000000';
  const lineHeight = typeof font.lineHeight === 'number' ? font.lineHeight : 1.34;
  return `font-family: ${family}; font-size: ${size}; font-weight: ${weight}; font-style: ${italic}; color: ${color}; line-height: ${lineHeight};`;
}
