/**
 * render.ts — render-html v1: היטל HTML טהור ודטרמיניסטי (§15.1; שלב 37).
 *
 * renderHtml(layout, styleManifest?, assetManifest?) — פונקציה טהורה: אין
 * גישה ל-DOM/CSSOM/CDN, אין מדידה, אין פקודת הדפסה. כל הממדים מה־IR
 * בלבד; ההמרה LU→px רציונלית (roundDiv(lu,49152) — לא px/mm היסטורי).
 * מצב קנוני: אותו layout+assets ⇐ ביט-ביט אותם bytes (§15.1).
 *
 * ייצוג הקו ב-v1 (מוקדם מ-ADR-008/שלב 88 — תיקון שורש לכישלון העמדה
 * באתר החי, 2026-11-09): הריצות נושאות טקסט בסדר חזותי מפורש שנפתר
 * במנוע (שמאל→ימין) — ולכן ההיטל מציג אותן כמות־שהן ב-bidi-override
 * כיווני ltr: הדפדפן אינו מפעיל את אלגוריתם הבי-די בשנית (הפעלה כפולה
 * הפכה כל שורה לקריאה הפוכה באתר החי). יישור: קו fit (justify) נמתח
 * לרוחב התיבה (text-align/-last: justify) כפי שהמנוע חילק על הרווחים;
 * קו טבעי עוגן בקצה ההתחלתי של הכיוון (ימין ל-rtl). החלטת הייצוג הסופית
 * (טקסט לוגי + מיפוי selection) — עדיין ADR-008 (שלב 88).
 * גופנים עוגנים לפי manifest (@font-face עם src קבוע); אין גופן רשת.
 * שמות משפחה בתוך style תחומים בגרש בודד — מרכאות כפולות בתוך
 * מאפיין style כפול-מרכאות חתכו את המאפיין והגופן נפל לברירת מחדל.
 */
import type { LayoutDocument, LayoutPage, LineFragment, PositionedNoteMarker, PositionedRun, Rect, LinkTable } from '@tora/layout-api';
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

function renderRun(run: PositionedRun, manifest: AssetManifest | undefined, justified: boolean, isLineVisualStart: boolean): string {
  const fam = fontFamilyOf(run.font.fontId, manifest);
  const size = `${luToCssPx(run.fontSizeLu as never)}px`;
  // סדר חזותי מפורש מהמנוע ⇒ bidi-override + ltr: הדפדפן מציג את התווים
  // בסדר המחרוזת כמות שהם, בלי היפוך בי-די שני (תיקון שורש 2026-11-09 —
  // הצבת dir="rtl" על מחרוזת בסדר חזותי הפכה כל שורה לקריאה הפוכה).
  // יישור: justify לקו fit (המנוע חילק את מתיחת הרווחים על תיבת הריצה);
  // קו טבעי עוגן בקצה ההתחלתי — ימין לריצת rtl (פער מדידה דולף לסוף הקו).
  const align = justified
    ? 'text-align:justify;text-align-last:justify'
    : `text-align:${run.direction === 'rtl' ? 'right' : 'left'}`;
  // גופן בגרש בודד בתוך ה-style — מרכאות כפולות חתכו את המאפיין (HTML)
  // והגופן נפל לברירת המחדל של הדפדפן (אותר באתר החי: Times במקום גוטמן).
  // רווחי סוף-הקו המאופסים (trailingZero) מוצגים בדפדפן ברוחב טבעי —
  // רוחב רפאים; הם בראש המחרוזת של הריצה השמאלית (runs חזותיים שמאל→ימין).
  let displayText = run.text;
  if (isLineVisualStart) {
    let i = 0;
    while (i < displayText.length && displayText.charCodeAt(i) === 0x20) i += 1;
    if (i > 0) displayText = displayText.slice(i);
  }
  return `<span class="tora-run" dir="ltr" data-run-id="${escapeAttr(run.id)}" `
    + `style="left:${px(run.startLu)};top:0;width:${px(run.widthLu)};height:100%;unicode-bidi:bidi-override;direction:ltr;${align};font-family:'${fam}';font-size:${size}">`
    + `${escapeHtmlText(displayText)}</span>`;
}

function renderMarker(marker: PositionedNoteMarker, fam: string | undefined, linkOf?: (noteId: string) => ProjectedLinkInfo | undefined): string {
  const topLu = (marker.baseline as number) - (marker.rect.y as number);
  const top = `${luToCssPx(topLu as never)}px`;
  const link = linkOf?.(marker.noteId);
  const linkAttrs = link === undefined ? '' : ` data-link-id="${escapeAttr(link.id)}" data-link-kind="${escapeAttr(link.kind)}"`
    + (link.targetPage !== undefined ? ` data-link-target-page="${link.targetPage}"` : '');
  // v0: כל השימושים באותו גופן הגוף — הסמן עוגן למשפחת ה-manifest (בלי
  // עיגון הוא נפל לגופן ברירת המחדל וחרג מהמדידה). גרש בודד — כמו בריצות.
  const fontAttr = fam === undefined ? '' : `;font-family:'${fam}'`;
  return `<span class="tora-note-marker" dir="ltr" data-note-id="${escapeAttr(marker.noteId)}"${linkAttrs} `
    + `style="left:${px(marker.rect.x as never)};top:${top};width:${px(marker.rect.width as never)};height:${px(marker.rect.height as never)};line-height:1${fontAttr}">`
    + `${escapeHtmlText(marker.label)}</span>`;
}

function renderLine(line: LineFragment, manifest: AssetManifest | undefined): string {
  // breakReason 'fit' ⇔ המנוע הצדיק את הקו לרוחב הטור (dp.ts justificationOf);
  // ההיטל משחזר את המתיחה בדפדפן כדי שהקו ימלא את תיבתו כפי שחושב.
  const justified = line.breakReason === 'fit';
  const runs = line.runs.map((r, i) => renderRun(r, manifest, justified, i === 0)).join('');
  return `<div class="tora-line" dir="auto" data-fragment-id="${escapeAttr(line.id)}" data-source-id="${escapeAttr(line.blockId)}" `
    + `data-region-id="${escapeAttr(line.regionId)}" data-break-reason="${line.breakReason}" data-continuation="${line.continuation}" `
    + `style="${styleOfRect(line.rect)}">${runs}</div>`;
}


/** מידע קישור להיטל — מיוצר מ-LinkTable מסופק (שלב 72). */
export interface ProjectedLinkInfo {
  readonly id: string;
  readonly kind: string;
  readonly targetPage?: number;
  readonly target?: string;
}

function renderPage(page: LayoutPage, manifest: AssetManifest | undefined, markerLinkOf?: (noteId: string) => ProjectedLinkInfo | undefined, anchorLinkOf?: (anchorId: string) => ProjectedLinkInfo | undefined): string {
  const regions = page.regions
    .map((r) => `<div class="tora-region" data-region-id="${escapeAttr(r.id)}" data-region-kind="${r.kind}" style="${styleOfRect(r.rect)}"></div>`)
    .join('');
  const markerFont = manifest === undefined || manifest.fonts.length === 0
    ? undefined
    : fontFamilyOf(manifest.fonts[0]!.fontId, manifest);
  const items = page.items
    .map((item) => {
      switch (item.kind) {
        case 'line': return renderLine(item, manifest);
        case 'note-marker': return renderMarker(item, markerFont, markerLinkOf);
        case 'anchor': {
          const link = anchorLinkOf?.(item.anchorId);
          const linkAttrs = link === undefined ? '' : ` data-link-id="${escapeAttr(link.id)}" data-link-kind="${escapeAttr(link.kind)}"`
            + (link.target !== undefined ? ` data-link-target="${escapeAttr(link.target)}"` : '');
          return `<span class="tora-anchor" data-anchor-id="${escapeAttr(item.anchorId)}"${linkAttrs} style="${styleOfRect(item.rect)}"></span>`;
        }
        default: return '';
      }
    })
    .join('');
  const folio = page.printedFolio !== undefined ? ` data-folio="${escapeAttr(page.printedFolio)}"` : '';
  return `<section class="tora-page" dir="rtl" data-page-id="${escapeAttr(page.id)}" data-page-kind="${escapeAttr(page.kind)}" `
    + `data-parity="${page.parity}"${folio} style="width:${px(page.size.width)};height:${px(page.size.height)}">${regions}${items}</section>`;
}

/**
 * renderHtml — היטל HTML מה־IR בלבד (§15.1). טהור: אותם קלטים ⇐ אותם bytes;
 * אין תאריך יצירה בתוכן (מטה-דטה נפרדת אם תידרש).
 */
export function renderHtml(layout: LayoutDocument, styleManifest?: StyleManifest, assetManifest?: AssetManifest, links?: LinkTable): RenderHtmlResult {
  void styleManifest;
  const css = buildCss(assetManifest);
  // שלב 72: אינדקס הקישורים להיטל — סמן הערה ⇒ ההפניה הקדימה אליה; עוגן כותרת ⇒ חזרה ל-TOC.
  // כשלא סופקת טבלה — הפלט זהה לקודם (התנהגות קיימת לא נשברת; goldens נשמרים).
  const noteForward = new Map<string, ProjectedLinkInfo>();
  const anchorBack = new Map<string, ProjectedLinkInfo>();
  if (links !== undefined) {
    for (const r of links.records) {
      if (r.kind === 'note' && r.target.kind === 'note') {
        noteForward.set(r.target.id, { id: r.linkId, kind: r.kind, targetPage: r.target.physicalPage });
      }
      if (r.kind === 'toc-back' && r.source.kind === 'heading') {
        anchorBack.set(r.source.id, { id: r.linkId, kind: r.kind, target: r.target.id });
      }
    }
  }
  const markerLinkOf = links === undefined ? undefined : (noteId: string) => noteForward.get(noteId);
  const anchorLinkOf = links === undefined ? undefined : (anchorId: string) => anchorBack.get(anchorId);
  const pages = layout.pages.map((p) => renderPage(p, assetManifest, markerLinkOf, anchorLinkOf)).join('');
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8">`
    + `<title>${escapeHtmlText(layout.policyId)}</title>`
    + `<style>${css}</style></head><body><div class="tora-root" data-policy-id="${escapeAttr(layout.policyId)}" data-schema-version="${layout.schemaVersion}">${pages}</div></body></html>`;
  return Object.freeze({ html, css });
}
