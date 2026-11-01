/**
 * render.ts — render-html v1: היטל HTML טהור ודטרמיניסטי (§15.1; שלב 37).
 *
 * renderHtml(layout, styleManifest?, assetManifest?) — פונקציה טהורה: אין
 * גישה ל-DOM/CSSOM/CDN, אין מדידה, אין פקודת הדפסה. כל הממדים מה־IR
 * בלבד; ההמרה LU→px רציונלית (roundDiv(lu,49152) — לא px/mm היסטורי).
 * מצב קנוני: אותו layout+assets ⇐ ביט-ביט אותם bytes (§15.1).
 *
 * ייצוג הקו ב-v1 (זמני, מסומן): ריצות ממוקמות פיזית (left/top) עם dir
 * לפי כיוון הריצה; ההחלטה הסופית על ייצוג הקו — ADR-008 (שלב 88).
 * גופנים עוגנים לפי manifest (@font-face עם src קבוע); אין גופן רשת.
 */
import type { LayoutDocument, LayoutPage, LineFragment, PositionedNoteMarker, PositionedRun, Rect } from '@tora/layout-api';
import { luToCssPx } from '@tora/layout-api';

export interface StyleManifest {
  readonly schemaVersion: 1;
}

export interface FontAssetEntry {
  readonly fontId: string;
  readonly family: string;
  readonly file: string;
  readonly format: 'woff2' | 'woff' | 'sfnt';
  readonly contentSha256: string;
}

export interface AssetManifest {
  readonly schemaVersion: 1;
  readonly fonts: readonly FontAssetEntry[];
  readonly ornaments?: readonly { readonly assetId: string; readonly file: string; readonly sha256: string }[];
}

export interface RenderHtmlResult {
  readonly html: string;
  readonly css: string;
}

// ─────────────────────────── escaping קבוע (§15.1) ───────────────────────────

const HTML_ESC: Readonly<Record<string, string>> = Object.freeze({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;',
});

export function escapeHtmlText(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESC[c] ?? c);
}

export function escapeAttr(value: string): string {
  return escapeHtmlText(value);
}

// ─────────────────────────── עזרי סגנון ───────────────────────────

const px = (lu: number): string => `${luToCssPx(lu as never)}px`;

function fontFamilyOf(fontId: string, manifest: AssetManifest | undefined): string {
  const entry = manifest?.fonts.find((f) => f.fontId === fontId);
  if (entry !== undefined) return `tora-${sanitizeIdent(entry.fontId)}`;
  return `tora-${sanitizeIdent(fontId)}`;
}

function sanitizeIdent(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'font';
}

/** CSS בסדר קבוע — tokens בגרסה קבועה (§15.1). */
export function buildCss(manifest: AssetManifest | undefined): string {
  const fontFaces: string[] = [];
  for (const f of manifest?.fonts ?? []) {
    const fam = `tora-${sanitizeIdent(f.fontId)}`;
    const formatSrc = f.format === 'woff2' ? 'format("woff2")' : f.format === 'woff' ? 'format("woff")' : 'format("opentype")';
    fontFaces.push(`@font-face{font-family:"${fam}";src:url("fonts/${escapeAttr(f.file)}") ${formatSrc};font-weight:normal;font-style:normal}`);
  }
  return [
    ...fontFaces,
    '.tora-root{color:#000;background:#fff}',
    '.tora-page{position:relative;overflow:hidden;background:#fff;box-sizing:border-box}',
    '.tora-region{position:absolute;box-sizing:border-box}',
    '.tora-line{position:absolute;box-sizing:border-box}',
    '.tora-run{position:absolute;white-space:pre;box-sizing:border-box}',
    '.tora-note-marker{position:absolute;white-space:pre;box-sizing:border-box}',
    '.tora-anchor{position:absolute}',
  ].join('\n');
}

function styleOfRect(rect: Rect): string {
  return `left:${px(rect.x)};top:${px(rect.y)};width:${px(rect.width)};height:${px(rect.height)}`;
}

// ─────────────────────────── היטל ───────────────────────────

function renderRun(run: PositionedRun, manifest: AssetManifest | undefined): string {
  const fam = fontFamilyOf(run.font.fontId, manifest);
  const size = `${luToCssPx(run.fontSizeLu as never)}px`;
  return `<span class="tora-run" dir="${run.direction}" data-run-id="${escapeAttr(run.id)}" `
    + `style="left:${px(run.startLu)};top:0;width:${px(run.widthLu)};height:100%;font-family:"${fam}";font-size:${size}">`
    + `${escapeHtmlText(run.text)}</span>`;
}

function renderMarker(marker: PositionedNoteMarker): string {
  const topLu = (marker.baseline as number) - (marker.rect.y as number);
  const top = `${luToCssPx(topLu as never)}px`;
  return `<span class="tora-note-marker" dir="ltr" data-note-id="${escapeAttr(marker.noteId)}" `
    + `style="left:${px(marker.rect.x as never)};top:${top};width:${px(marker.rect.width as never)};height:${px(marker.rect.height as never)};line-height:1">`
    + `${escapeHtmlText(marker.label)}</span>`;
}

function renderLine(line: LineFragment, manifest: AssetManifest | undefined): string {
  const runs = line.runs.map((r) => renderRun(r, manifest)).join('');
  return `<div class="tora-line" dir="auto" data-fragment-id="${escapeAttr(line.id)}" data-source-id="${escapeAttr(line.blockId)}" `
    + `data-region-id="${escapeAttr(line.regionId)}" data-break-reason="${line.breakReason}" data-continuation="${line.continuation}" `
    + `style="${styleOfRect(line.rect)}">${runs}</div>`;
}

function renderPage(page: LayoutPage, manifest: AssetManifest | undefined): string {
  const regions = page.regions
    .map((r) => `<div class="tora-region" data-region-id="${escapeAttr(r.id)}" data-region-kind="${r.kind}" style="${styleOfRect(r.rect)}"></div>`)
    .join('');
  const items = page.items
    .map((item) => {
      switch (item.kind) {
        case 'line': return renderLine(item, manifest);
        case 'note-marker': return renderMarker(item);
        case 'anchor':
          return `<span class="tora-anchor" data-anchor-id="${escapeAttr(item.anchorId)}" style="${styleOfRect(item.rect)}"></span>`;
        default: return '';
      }
    })
    .join('');
  const folio = page.printedFolio !== undefined ? ` data-folio="${escapeAttr(page.printedFolio)}"` : '';
  return `<section class="tora-page" dir="rtl" data-page-id="${escapeAttr(page.id)}" data-page-kind="${page.kind}" `
    + `data-parity="${page.parity}"${folio} style="width:${px(page.size.width)};height:${px(page.size.height)}">${regions}${items}</section>`;
}

/**
 * renderHtml — היטל HTML מה־IR בלבד (§15.1). טהור: אותם קלטים ⇐ אותם bytes;
 * אין תאריך יצירה בתוכן (מטה-דטה נפרדת אם תידרש).
 */
export function renderHtml(layout: LayoutDocument, styleManifest?: StyleManifest, assetManifest?: AssetManifest): RenderHtmlResult {
  void styleManifest;
  const css = buildCss(assetManifest);
  const pages = layout.pages.map((p) => renderPage(p, assetManifest)).join('');
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8">`
    + `<title>${escapeHtmlText(layout.policyId)}</title>`
    + `<style>${css}</style></head><body><div class="tora-root" data-policy-id="${escapeAttr(layout.policyId)}" data-schema-version="${layout.schemaVersion}">${pages}</div></body></html>`;
  return Object.freeze({ html, css });
}
