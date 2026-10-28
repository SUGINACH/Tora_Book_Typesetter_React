import type { FinalPage, RenderedPage, Settings, ParsedDocument, Block } from '../../types';
import { toGematria } from '../../lib/gematria';

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
      hasShaar: page.pageType === 'main-shaar' || page.pageType === 'sub-shaar' || page.pageType === 'back-shaar',
    },
  };
}

function renderPageHtml(
  page: FinalPage,
  pageNumber: number,
  settings: Settings,
  doc: ParsedDocument
): string {
  const isH2Page = page.pageType === 'chapter-opener';
  const runningHeader = renderRunningHeader(page, settings, doc);
  const columns = page.columns.map((col, i) => renderColumn(col, i, settings)).join('');
  const footnotes = page.footnotes ? renderFootnotes(page.footnotes, settings) : '';
  const pageNumberHtml = renderPageNumber(pageNumber, settings);
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
        const marker = i + 1; // זמנית מספרים
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
