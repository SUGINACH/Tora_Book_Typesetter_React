import type { FinalPage, RenderedPage, Settings, ParsedDocument, Block, PageType } from '../../types';
import { toGematria } from '../../lib/gematria';
import type { ShaarDesign } from '../../lib/shaar-loader';
import type { OrnamentDesign } from '../../lib/ornament-loader';

const NO_HEADER_PAGE_TYPES: PageType[] = ['main-shaar', 'sub-shaar', 'back-shaar'];
const SHAAR_PAGE_TYPES: PageType[] = ['main-shaar', 'sub-shaar', 'back-shaar'];

export interface ShaarDesignData {
  main?: ShaarDesign | null;
  back?: ShaarDesign | null;
  sub?: ShaarDesign | null;
}

export interface OrnamentData {
  h2Top?: OrnamentDesign | null;
  h2Bottom?: OrnamentDesign | null;
  h3Right?: OrnamentDesign | null;
  h3Left?: OrnamentDesign | null;
}

export function renderToHtml(
  page: FinalPage,
  pageNumber: number,
  settings: Settings,
  doc: ParsedDocument,
  shaarDesigns?: ShaarDesignData,
  ornaments?: OrnamentData
): RenderedPage {
  const html = renderPageHtml(page, pageNumber, settings, doc, shaarDesigns, ornaments);
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
  doc: ParsedDocument,
  shaarDesigns?: ShaarDesignData,
  ornaments?: OrnamentData
): string {
  const isShaar = SHAAR_PAGE_TYPES.includes(page.pageType);
  const showHeader = !NO_HEADER_PAGE_TYPES.includes(page.pageType);
  const isH2Page = page.pageType === 'chapter-opener';
  const isH0Page = page.heading?.level === 0;

  if (isShaar) {
    return renderShaarPage(page, pageNumber, settings, doc, shaarDesigns);
  }

  const runningHeader = showHeader ? renderRunningHeader(page, settings, doc) : '';
  const columns = page.columns.map((col, i) => renderColumn(col, i, settings)).join('');
  const footnotes = page.footnotes ? renderFootnotes(page.footnotes, settings) : '';
  const pageNumberHtml = showHeader ? renderPageNumber(pageNumber, settings) : '';

  const isChapterOpener = isH2Page || isH0Page;
  const headingHtml = page.heading ? renderHeading(page.heading, settings) : '';

  // עיטורי כותרות — SVG מ-JSON (רק ל-H2/H0)
  const h2TopOrn = isChapterOpener && ornaments?.h2Top?.svg ? ornaments.h2Top.svg : '';
  const h2BottomOrn = isChapterOpener && ornaments?.h2Bottom?.svg ? ornaments.h2Bottom.svg : '';

  const rightSidenotes = renderSidenotes(page, doc, 'right');
  const leftSidenotes = renderSidenotes(page, doc, 'left');

  return `
    <div class="tora-page ${isChapterOpener ? 'tora-page-h2' : ''} ${isH0Page ? 'tora-page-h0' : ''}" data-page="${pageNumber}" data-page-type="${page.pageType}">
      <div class="tora-page-header">
        ${runningHeader}
      </div>
      <div class="tora-page-body">
        <div class="tora-text-area">
          <div class="tora-margin-right">${rightSidenotes}</div>
          <div class="tora-text-main ${isChapterOpener ? 'has-single-column' : ''}">
            ${h2TopOrn ? `<div class="tora-heading-ornament-top">${h2TopOrn}</div>` : ''}
            ${headingHtml ? `<div class="tora-heading-wrapper">${headingHtml}</div>` : ''}
            ${h2BottomOrn ? `<div class="tora-heading-ornament-bottom">${h2BottomOrn}</div>` : ''}
            <div class="tora-columns">
              ${columns}
            </div>
            <div class="tora-single-column">
              ${headingHtml ? `<div class="tora-heading-wrapper">${headingHtml}</div>` : ''}
            </div>
          </div>
          <div class="tora-margin-left">${leftSidenotes}</div>
        </div>
        ${footnotes}
      </div>
      <div class="tora-page-footer">
        ${pageNumberHtml}
      </div>
    </div>
  `.trim();
}

/**
 * רינדור הערות צד (H7) בשוליים.
 * מקבל את העמוד ואת המסמך, מחזיר HTML לשוליים הימניים או השמאליים.
 */
function renderSidenotes(page: FinalPage, doc: ParsedDocument, side: 'right' | 'left'): string {
  if (!doc.sidenotes || doc.sidenotes.length === 0) return '';

  const notes: string[] = [];
  for (const sn of doc.sidenotes) {
    notes.push(`<div class="tora-sidenote">${escapeHtml(sn.text)}</div>`);
  }

  // חלוקה: בעמודים אי-זוגיים → ימין, בזוגיים → שמאל
  const isOddPage = page.pageNumber % 2 === 1;
  if (side === 'right' && isOddPage) return notes.join('');
  if (side === 'left' && !isOddPage) return notes.join('');
  return '';
}

/**
 * רינדור עמוד שער — משתמש ב-SVG מקובץ JSON חיצוני כרקע.
 * אין עיצובים מוטמעים בקוד — הכל מגיע מה-SVG.
 */
function renderShaarPage(
  page: FinalPage,
  _pageNumber: number,
  _settings: Settings,
  doc: ParsedDocument,
  shaarDesigns?: ShaarDesignData
): string {
  const meta = doc.metadata;

  if (page.pageType === 'main-shaar') {
    // טעינת SVG מעיצוב השער הראשי
    const svg = shaarDesigns?.main?.svg ?? '';
    return `
      <div class="tora-page tora-page-shaar" data-page-type="main-shaar">
        ${svg ? `<div class="tora-shaar-svg-bg">${svg}</div>` : ''}
        <div class="tora-shaar-overlay">
          <div class="tora-shaar-field bsd">בס"ד</div>
          ${meta.bookName ? `<div class="tora-shaar-field title">${escapeHtml(meta.bookName)}</div>` : ''}
          ${meta.subject ? `<div class="tora-shaar-field subtitle">${escapeHtml(meta.subject)}</div>` : ''}
          ${meta.detailedSubject ? `<div class="tora-shaar-field desc">${escapeHtml(meta.detailedSubject)}</div>` : ''}
          ${meta.editionDetails ? `<div class="tora-shaar-field sections">${escapeHtml(meta.editionDetails)}</div>` : ''}
          ${meta.authorName ? `<div class="tora-shaar-field author">${escapeHtml(meta.authorName)}</div>` : ''}
          ${meta.placeAndYear ? `<div class="tora-shaar-field year">${escapeHtml(meta.placeAndYear)}</div>` : ''}
        </div>
      </div>
    `.trim();
  }

  if (page.pageType === 'back-shaar') {
    // שער אחורי = גב השער הראשי (עמוד 2)
    const svg = shaarDesigns?.back?.svg ?? '';
    return `
      <div class="tora-page tora-page-shaar" data-page-type="back-shaar">
        ${svg ? `<div class="tora-shaar-svg-bg">${svg}</div>` : ''}
        <div class="tora-shaar-overlay back">
          ${meta.copyright ? `<div class="tora-shaar-field copyright-title">כל הזכויות שמורות</div><div class="tora-shaar-field copyright">${escapeHtml(meta.copyright)}</div>` : ''}
          ${meta.publisherDetails ? `<div class="tora-shaar-field publisher">${escapeHtml(meta.publisherDetails)}</div>` : ''}
          ${meta.contactDetails ? `<div class="tora-shaar-field contact">${escapeHtml(meta.contactDetails)}</div>` : ''}
          ${meta.additionalDetails ? `<div class="tora-shaar-field disclaimer">${escapeHtml(meta.additionalDetails)}</div>` : ''}
        </div>
      </div>
    `.trim();
  }

  // sub-shaar: H1 — מפצל את הטקסט על המקף הראשון
  if (page.pageType === 'sub-shaar' && page.heading) {
    const parts = page.heading.text.split(' - ');
    const mainTitle = parts[0] || page.heading.text;
    const subTitle = parts.slice(1).join(' - ');
    const svg = shaarDesigns?.sub?.svg ?? '';

    return `
      <div class="tora-page tora-page-shaar" data-page-type="sub-shaar">
        ${svg ? `<div class="tora-shaar-svg-bg">${svg}</div>` : ''}
        <div class="tora-shaar-overlay sub">
          <div class="tora-shaar-field title">${escapeHtml(mainTitle)}</div>
          ${subTitle ? `<div class="tora-shaar-field subtitle">${escapeHtml(subTitle)}</div>` : ''}
        </div>
      </div>
    `.trim();
  }

  return `<div class="tora-page tora-page-shaar" data-page-type="${page.pageType}"></div>`;
}

function renderColumn(col: import('../../types').ColumnContent, idx: number, settings: Settings): string {
  const cls = idx === 0 ? 'tora-column-right' : 'tora-column-left';
  const divider = settings.grid.columnDivider !== 'none' && idx === 0
    ? `<div class="tora-column-divider tora-divider-${settings.grid.columnDivider}"></div>`
    : '';
  const totalBlocks = col.blocks.length;

  return `
    <div class="tora-column ${cls}">
      ${col.blocks.map((b, i) => renderBlock(b, settings, i, totalBlocks)).join('')}
    </div>
    ${divider}
  `.trim();
}

/**
 * רינדור בלוק — פסקה או כותרת.
 * כולל: מילה ראשונה מוגדלת, דיבור המתחיל (ד"ה), p-end/p-cut,
 * סמני הערות שוליים בגוף הטקסט.
 */
function renderBlock(block: Block, settings: Settings, blockIndex: number, totalBlocks: number): string {
  switch (block.type) {
    case 'paragraph': {
      let text = block.content;
      const dropWordMode = settings.typography.dropWordMode;
      const isLastInColumn = blockIndex === totalBlocks - 1;

      // p-end = פסקה אחרונה בטור → שורה אחרונה ממורכזת
      const paraClass = isLastInColumn ? 'tora-body-text p-end' : 'tora-body-text p-cut';
      const paraStyle = isLastInColumn ? 'text-align-last: center;' : '';

      // החלפת סמני הערות שוליים (\u0001FN:id\u0002) בסמן עילי ויזואלי
      text = renderFootnoteMarkers(text, settings);

      // החלת מילה ראשונה מוגדלת אם פעיל
      if (dropWordMode !== 'none' && text.length > 20) {
        const dropWordCount = settings.typography.dropWordCount;
        const words = text.split(/\s+/);
        if (words.length >= 4) {
          const dropWords = words.slice(0, dropWordCount).join(' ');
          const restWords = words.slice(dropWordCount).join(' ');
          const dropWordHtml = dropWordMode === 'bold'
            ? `<span class="first-word-bold">${escapeHtml(dropWords)}</span>`
            : `<span class="first-word-window">${escapeHtml(dropWords)}</span>`;
          return `<p class="${paraClass}" style="${paraStyle}">${dropWordHtml} ${escapeHtml(restWords)}</p>`;
        }
      }

      // דיבור המתחיל (ד"ה) — זיהוי אוטומטי
      const dhConfig = settings.typography.dibburHamatchil;
      if (dhConfig?.enabled) {
        const dhResult = detectDibburHamatchil(text, dhConfig.terminators);
        if (dhResult) {
          const dhFontCss = fontConfigToCss(dhConfig.font);
          return `<p class="${paraClass}" style="${paraStyle}"><span class="dibbur-hamatchil" style="${dhFontCss}">${escapeHtml(dhResult.opening)}</span> ${escapeHtml(dhResult.rest)}</p>`;
        }
      }

      return `<p class="${paraClass}" style="${paraStyle}">${escapeHtml(text)}</p>`;
    }

    case 'heading': {
      if (block.headingLevel === undefined) return '';
      const level = block.headingLevel as 0|1|2|3|4|5|6|7;
      const h = settings.typography.headings[level];
      const fontCss = h ? fontConfigToCss(h.font) : '';
      const cls = level <= 3 ? 'tora-heading-inline-wide' : 'tora-heading-inline';
      return `<div class="tora-heading tora-heading-level-${level} ${cls}" style="${fontCss}">${escapeHtml(block.content)}</div>`;
    }

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

/**
 * זיהוי דיבור המתחיל (ד"ה).
 */
function detectDibburHamatchil(
  text: string,
  terminators: readonly string[]
): { opening: string; rest: string } | null {
  if (text.length < 5) return null;
  const termPattern = terminators.map((t) => escapeRegex(t)).join('');
  const regex = new RegExp(`^([^${termPattern}]{1,80}[${termPattern}])\\s*(.+)$`, 's');
  const match = text.match(regex);
  if (!match) return null;
  const opening = match[1]!.trim();
  const rest = match[2]!.trim();
  if (rest.length < 10) return null;
  return { opening, rest };
}

/**
 * החלפת סמני הערות שוליים בטקסט בסמן עילי ויזואלי.
 *
 * סמן פנימי: \u0001FN:id\u0002
 * החלפה: <sup class="tora-fn-inline" data-fn-id="id">marker</sup>
 *
 * הסמן ממוספר לפי סדר הופעה בעמוד.
 */
function renderFootnoteMarkers(text: string, settings: Settings): string {
  const markerStyle = settings.notes.bodyMarkerStyle;
  const markerClass = markerStyle === 'superscript' ? 'tora-fn-inline'
    : markerStyle === 'subscript' ? 'tora-fn-inline tora-fn-sub'
    : markerStyle === 'brackets' ? 'tora-fn-inline tora-fn-bracket'
    : 'tora-fn-inline tora-fn-normal';

  let counter = 0;
  return text.replace(/\u0001FN:([^\u0002]+)\u0002/g, (_match, fnId) => {
    counter++;
    const marker = toGematria(counter);
    if (markerStyle === 'brackets') {
      return `<sup class="${markerClass}" data-fn-id="${fnId}">[${marker}]</sup>`;
    }
    return `<sup class="${markerClass}" data-fn-id="${fnId}">${marker}</sup>`;
  });
}

/**
 * עיטור סיום פרק — מתווסף לעמוד האחרון של כל פרק (H2).
 * מבנה: ❖ ❖ ❖ (פירמידת מעויינים)
 */
function renderChapterEndDivider(): string {
  return '<div class="tora-chapter-end">❖ &nbsp; ❖ &nbsp; ❖</div>';
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * רינדור כותרת ראשית של עמוד פתיחה (H0/H2).
 */
function renderHeading(heading: { level: number; text: string; simanNumber?: number }, settings: Settings): string {
  const level = heading.level as 0|1|2|3|4|5|6|7;
  const cfg = settings.typography.headings[level];
  const fontCss = cfg ? fontConfigToCss(cfg.font) : '';
  const simanBadge = heading.simanNumber
    ? `<div class="tora-siman-badge">סימן ${toGematria(heading.simanNumber)}</div>`
    : '';
  return `
    <div class="tora-heading tora-heading-level-${level}" style="${fontCss}">
      ${escapeHtml(heading.text)}
    </div>
    ${simanBadge}
  `.trim();
}

function renderRunningHeader(page: FinalPage, settings: Settings, doc: ParsedDocument): string {
  const cfg = settings.runningHeader;
  const bookName = doc.metadata.bookName ?? '';
  const isOddPage = page.pageNumber % 2 === 1; // אי-זוגי = ימני (recto)

  // חצי-חצי: פיצול שם הספר בין שני הצדדים החיצוניים
  if (cfg.halfHalfBookName && bookName) {
    const words = bookName.split(/\s+/);
    if (words.length >= 2 && words.length % 2 === 0) {
      const mid = words.length / 2;
      const rightHalf = words.slice(0, mid).join(' ');
      const leftHalf = words.slice(mid).join(' ');
      // בעמוד ימני: החצי הראשון בימין, השני בשמאל
      // בעמוד שמאלי: החצי השני בימין, הראשון בשמאל (התחלפות)
      const right = isOddPage ? rightHalf : leftHalf;
      const left = isOddPage ? leftHalf : rightHalf;
      const center = getHeaderContent(cfg.centerContent, page, doc);
      return `
        <div class="tora-running-header">
          <div class="tora-rh-right" style="text-align: ${cfg.rightAlign};">${escapeHtml(right)}</div>
          <div class="tora-rh-center" style="text-align: ${cfg.centerAlign};">${center}</div>
          <div class="tora-rh-left" style="text-align: ${cfg.leftAlign};">${escapeHtml(left)}</div>
        </div>
      `.trim();
    }
  }

  // מתחלפות (Recto/Verso): החלפת ימין/שמאל בעמודים זוגיים
  if (cfg.alternating) {
    const right = isOddPage
      ? getHeaderContent(cfg.rightContent, page, doc)
      : getHeaderContent(cfg.leftContent, page, doc);
    const left = isOddPage
      ? getHeaderContent(cfg.leftContent, page, doc)
      : getHeaderContent(cfg.rightContent, page, doc);
    const center = getHeaderContent(cfg.centerContent, page, doc);
    return `
      <div class="tora-running-header">
        <div class="tora-rh-right" style="text-align: ${cfg.rightAlign};">${right}</div>
        <div class="tora-rh-center" style="text-align: ${cfg.centerAlign};">${center}</div>
        <div class="tora-rh-left" style="text-align: ${cfg.leftAlign};">${left}</div>
      </div>
    `.trim();
  }

  // רגיל (לא מתחלפות)
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
        const marker = toGematria(i + 1);
        return `
          <div class="tora-footnote" style="font-size: ${noteSize}pt;">
            <span class="tora-fn-marker">${marker}</span>
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
    case 'none': return text;
    case 'circle': return `<span class="tora-frame-circle">${text}</span>`;
    case 'square': return `<span class="tora-frame-square">${text}</span>`;
    case 'round-parens': return `(${text})`;
    case 'square-brackets': return `[${text}]`;
    case 'diamond': return `◆${text}◆`;
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
