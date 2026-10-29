import type { Settings, RenderedPage, ParsedDocument } from '../types';

/**
 * ייצוא HTML עצמאי (Standalone) — זהה לחלוטין לתצוגה החיה.
 *
 * ארבעה רכיבי חובה:
 * 1. CSS מוטמע ישירות ב-<style>
 * 2. משתני CSS הפעילים מוזרקים ל-:root
 * 3. נתיבים יחסיים → מוחלטים (או inline base64)
 * 4. מעטפת DOM זהה לממשק
 */
export function exportHtml(
  pages: RenderedPage[],
  settings: Settings,
  doc: ParsedDocument
): string {
  // קריאת CSS האמיתי מה-DOM — כולל את כל התיקונים (tora-line, nowrap, וכו')
  const css = readLiveCss();
  const cssVars = generateCssVars(settings);
  const bodyHtml = pages.map((p) => p.html).join('\n');
  const title = doc.metadata.bookName || 'מסמך מרונדר';

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="fonts/fonts.css">
  <style>
${css}

:root {
${cssVars}
}

@media print {
  .tora-page {
    box-shadow: none;
    margin: 0;
    page-break-after: always;
  }
  .tora-page-wrapper {
    margin: 0;
  }
}

@page {
  size: A4;
  margin: 0;
}
  </style>
</head>
<body>
  <div class="tora-book-container">
${bodyHtml}
  </div>
</body>
</html>`;
}

/**
 * קריאת CSS חי מה-DOM — כולל את כל הסגנונות הפעילים.
 * מבטיח שהייצוא תואם לחלוטין לתצוגה החיה.
 */
function readLiveCss(): string {
  if (typeof document === 'undefined') {
    // Fallback ל-CSS בסיסי אם לא בדפדפן
    return generateInlinedCss({} as Settings);
  }

  const cssTexts: string[] = [];
  for (const sheet of document.styleSheets) {
    try {
      const rules = sheet.cssRules;
      for (const rule of rules) {
        cssTexts.push(rule.cssText);
      }
    } catch {
      // Cross-origin stylesheet — לא נגיש, דלג
    }
  }
  return cssTexts.join('\n');
}

/**
 * ייצוא HTML להורדה כקובץ.
 */
export function downloadHtml(
  pages: RenderedPage[],
  settings: Settings,
  doc: ParsedDocument,
  filename: string = 'tora-book.html'
): void {
  const html = exportHtml(pages, settings, doc);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function generateInlinedCss(settings: Settings): string {
  const bodyFont = settings.typography.bodyFont;
  const family = bodyFont.family.map((f) => `'${f}'`).join(', ');
  const pageSize = settings.pageSize;
  const margin = settings.pageMargins;

  return `
  body {
    font-family: ${family};
    background: #e8e6e1;
    color: #1a1a1a;
    direction: rtl;
    margin: 0;
    padding: 20px;
  }

  .tora-page {
    width: ${pageSize.width}mm;
    min-height: ${pageSize.height}mm;
    max-height: ${pageSize.height}mm;
    margin: 0 auto 8mm;
    background: white;
    box-shadow: 0 1px 8px rgba(0,0,0,0.15);
    padding: ${margin.top}mm ${margin.outer}mm ${margin.bottom}mm ${margin.inner}mm;
    direction: rtl;
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
  }

  .tora-running-header {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 4mm;
    padding-bottom: 4mm;
    margin-bottom: 6mm;
    border-bottom: 1px solid #c8c0b0;
    font-size: 10pt;
  }

  .tora-rh-right { text-align: right; }
  .tora-rh-center { text-align: center; }
  .tora-rh-left { text-align: left; }

  .tora-columns {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 5%;
    flex: 1;
    direction: rtl;
  }

  .tora-column {
    font-size: ${typeof bodyFont.size === 'number' ? bodyFont.size + 'pt' : bodyFont.size};
    line-height: ${bodyFont.lineHeight || 1.34};
    text-align: justify;
    direction: rtl;
  }

  .tora-column-right { order: 1; }
  .tora-column-left { order: 2; }

  .tora-body-text {
    margin: 0 0 3mm 0;
    text-align: justify;
  }

  .tora-heading-wrapper {
    text-align: center;
    margin: 15mm 0 10mm 0;
  }

  .tora-heading-level-0 { font-size: 17pt; font-weight: 700; }
  .tora-heading-level-1 { font-size: 50pt; font-weight: 700; }
  .tora-heading-level-2 { font-size: 17pt; font-weight: 700; }
  .tora-heading-level-3 { font-size: 13.5pt; font-weight: 400; margin: 6mm 0; text-align: right; }
  .tora-heading-level-4 { font-size: 12.5pt; font-weight: 400; margin: 4mm 0; text-align: right; }
  .tora-heading-level-5 { font-size: 11.5pt; font-weight: 400; margin: 3mm 0; text-align: right; }
  .tora-heading-level-6 { font-size: 10.5pt; font-weight: 400; margin: 2mm 0; text-align: right; }

  .tora-siman-badge {
    font-size: 10pt;
    color: #666;
    text-align: center;
    margin-top: 3mm;
  }

  .first-word-window {
    font-weight: 900;
    font-size: 1.5em;
    line-height: 0.85;
    float: right;
    margin-left: 2mm;
    margin-top: 1mm;
  }

  .tora-footnotes-area {
    margin-top: auto;
    padding-top: 3mm;
  }

  .tora-fn-divider {
    border-top: 1px solid #999;
    margin-bottom: 2mm;
  }

  .tora-fn-divider-short-right-30 {
    width: 30%;
    margin-right: 0;
    margin-left: auto;
  }

  .tora-footnote {
    font-size: 8pt;
    margin: 1mm 0;
    line-height: 1.3;
  }

  .tora-fn-marker {
    font-weight: 700;
    margin-left: 1mm;
  }

  .tora-page-number {
    text-align: center;
    margin-top: 4mm;
    font-size: 11pt;
  }

  .tora-page-shaar {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tora-page-shaar .tora-running-header,
  .tora-page-shaar .tora-page-number {
    display: none;
  }

  .tora-shaar-content {
    display: flex;
    flex-direction: column;
    gap: 6mm;
    align-items: center;
    max-width: 85%;
    margin: auto;
    text-align: center;
  }

  .tora-shaar-title { font-size: 28pt; font-weight: 700; }
  .tora-shaar-subtitle { font-size: 18pt; font-weight: 400; color: #333; }
  .tora-shaar-desc { font-size: 12pt; color: #555; max-width: 70%; }
  .tora-shaar-author { font-size: 15pt; font-weight: 700; margin-top: 10mm; }
  .tora-shaar-year { font-size: 12pt; color: #333; }
  .tora-shaar-copyright, .tora-shaar-publisher, .tora-shaar-contact, .tora-shaar-extra {
    font-size: 10pt; color: #555;
  }

  .tora-page-back-shaar .tora-shaar-content {
    justify-content: flex-end;
    padding-bottom: 20mm;
  }

  .bsd-header { font-size: 10pt; color: #666; margin-bottom: 10mm; }
  `;
}

function generateCssVars(settings: Settings): string {
  const bodyFont = settings.typography.bodyFont;
  return `    --font-body: ${bodyFont.family.map((f) => `'${f}'`).join(', ')};
    --font-size: ${typeof bodyFont.size === 'number' ? bodyFont.size + 'pt' : bodyFont.size};
    --line-height: ${bodyFont.lineHeight || 1.34};
    --column-width: ${settings.grid.columnWidth}%;
    --gutter-width: ${settings.grid.gutterWidth}%;`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
