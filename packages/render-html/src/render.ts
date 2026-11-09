/**
 * render.ts — render-html v1: היטל HTML טהור ודטרמיניסטי (§15.1; שלב 37).
 *
 * renderHtml(layout, styleManifest?, assetManifest?) — פונקציה טהורה: אין
 * גישה ל-DOM/CSSOM/CDN, אין מדידה, אין פקודת הדפסה. כל הממדים מה־IR
 * בלבד; ההמרה LU→px רציונלית (roundDiv(lu,49152) — לא px/mm היסטורי).
 * מצב קנוני: אותו layout+assets ⇐ ביט-ביט אותם bytes (§15.1).
 *
 * ייצוג הקו (תיקון שורש 2026-11-09/ב' — מראות תווים באתר החי): המנוע פולט
 * את run.text בסדר אטומים חזותי עם תווים לוגיים — ההיטל משחזר את הטקסט
 * הלוגי (logicalTextOfRun; טווחי המקור מקודדים במזהי האטומים) ומציגו
 * בכיוון הטבעי של הריצה — הדפדפן מפעיל את UAX#9 בעצמו. bidi-override
 * על המחרוזת החזותית מראה כל מילה (אומת באתר החי במדידת מיקומי תווים).
 * יישור: קו fit (justify) נמתח לרוחב התיבה כפי שהמנוע חילק על הרווחים;
 * קו טבעי עוגן בקצה ההתחלתי של הכיוון (ימין ל-rtl). מיפוי selection —
 * עדיין ADR-008 (שלב 88).
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

// ─────────────────────── טקסט לוגי של ריצה (תיקון 2026-11-09/ב') ───────────────────────

/**
 * שחזור טקסט אטום מזההו — מזהי האטומים מקודדים את טווח המקור
 * (‎atom:v1|<docId>|<stream>|<start>+<end>|<origin|src>|<ordinal>‎ — 6 שדות;
 * deriveAtomId ב-content-model; הקידוד אוכף היעדר '|' בשדות). אטום מקור
 * נחתך מהמקור בטווחו; אטום החדרה של איחוי פסקאות הוא רווח בודד
 * (parse.ts — makeTextAtom(' ', …, origin='parser:paragraph-join')).
 * מקור לא מוכר/טווח חורג ⇐ שגיאה קולנית — אין תצוגה שגויה בשקט.
 * זהה ביט־ביט ל-atomTextOf הפרטי של preview-model (אפליקציה) — נעול בבדיקות.
 */
function atomTextOf(atomId: string, source: string): string {
  const parts = atomId.split('|');
  if (parts.length !== 6 || parts[0] !== 'atom:v1') {
    throw new Error(`errors.render.ATOM_ID_UNPARSEABLE: ${atomId.slice(0, 80)}`);
  }
  const origin = parts[4] as string;
  if (origin === 'parser:paragraph-join') return ' ';
  if (origin !== 'src') {
    throw new Error(`errors.render.UNKNOWN_ATOM_ORIGIN: ${origin.slice(0, 40)}`);
  }
  const range = (parts[3] as string).split('+');
  const start = Number(range[0]);
  const end = range.length === 2 ? Number(range[1]) : Number.NaN;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 0 || end < start || end > source.length) {
    throw new Error(`errors.render.ATOM_SPAN_OUT_OF_SOURCE: ${atomId.slice(0, 80)}`);
  }
  return source.slice(start, end);
}

/**
 * הטקסט הלוגי של ריצה — זהה ביט־ביט ל-logicalTextOfRun של preview-model.
 *
 * ריצת rtl: האטומים ב-run.text ערוכים בסדר חזותי (שמאל→ימין; placeLineVisually)
 * — היפוך סדר האטומים משחזר את הסדר הלוגי, וכל אטום נחתך מהמקור בטווחו
 * (תווי האטום עצמם לוגיים תמיד). ריצת ltr: חזותי === לוגי (אומת מול כל
 * קורפוס הבדיקה — 196,416 ריצות, 0 חריגות). ריצה נגזרת (ללא אטומים —
 * כותרות תוכן/עמודות): הטקסט לוגי מטבעו (compose-v0 בונה אותו ישירות).
 * מקור חסר לריצה עם אטומים ⇐ שגיאה קולנית — אין תצוגה שגויה בשקט.
 */
export function logicalTextOfRun(run: PositionedRun, source: string | undefined): string {
  if (run.atomIds.length === 0) return run.text;
  if (source === undefined) {
    throw new Error(`errors.render.SOURCE_REQUIRED: ${run.id.slice(0, 80)}`);
  }
  if (run.direction === 'ltr') return run.text;
  const parts: string[] = [];
  for (let i = run.atomIds.length - 1; i >= 0; i -= 1) {
    parts.push(atomTextOf(run.atomIds[i] as string, source));
  }
  return parts.join('');
}

// ─────────────────────────── היטל ───────────────────────────

function renderRun(run: PositionedRun, manifest: AssetManifest | undefined, justified: boolean, isLineVisualStart: boolean, source: string | undefined): string {
  const fam = fontFamilyOf(run.font.fontId, manifest);
  const size = `${luToCssPx(run.fontSizeLu as never)}px`;
  // תיקון שורש 2026-11-09/ב' (מראות תווים באתר החי): המנוע פולט את run.text
  // בסדר אטומים חזותי (שמאל→ימין) ותווי כל אטום לוגיים — הצגת המחרוזת
  // כמות־שהיא (bidi-override) מראה כל מילה ("יורה דעה" נקרא "הרוי העד";
  // אומת במדידת מיקומי תווים באתר החי). ההיטל משחזר את הטקסט הלוגי
  // (logicalTextOfRun מפענח את טווחי המקור המקודדים במזהי האטומים) ומציגו
  // בכיוון הטבעי של הריצה — הדפדפן מפעיל את UAX#9 בעצמו (מראוי סוגריים,
  // ספרות ומיזוגים). יישור: justify לקו fit (המנוע חילק את מתיחת הרווחים
  // על תיבת הריצה); קו טבעי עוגן בקצה ההתחלתי — ימין לריצת rtl.
  const align = justified
    ? 'text-align:justify;text-align-last:justify'
    : `text-align:${run.direction === 'rtl' ? 'right' : 'left'}`;
  // גופן בגרש בודד בתוך ה-style — מרכאות כפולות חתכו את המאפיין (HTML)
  // והגופן נפל לברירת המחדל של הדפדפן (אותר באתר החי: Times במקום גוטמן).
  // רווחי סוף-הקו המאופסים (trailingZero) מוצגים בדפדפן ברוחב טבעי — רוחב
  // רפאים; הם בקצה הלוגי של הריצה השמאלית — בזנב הטקסט הלוגי של ריצת rtl
  // או בראש הטקסט של ריצת ltr (חיתוך U+0020 בלבד — NBSP נשמר, ADR-004).
  let displayText = logicalTextOfRun(run, source);
  if (isLineVisualStart) {
    if (run.direction === 'rtl') {
      let i = displayText.length;
      while (i > 0 && displayText.charCodeAt(i - 1) === 0x20) i -= 1;
      if (i < displayText.length) displayText = displayText.slice(0, i);
    } else {
      let j = 0;
      while (j < displayText.length && displayText.charCodeAt(j) === 0x20) j += 1;
      if (j > 0) displayText = displayText.slice(j);
    }
  }
  return `<span class="tora-run" dir="${run.direction}" data-run-id="${escapeAttr(run.id)}" data-run-direction="${run.direction}" `
    + `style="left:${px(run.startLu)};top:0;width:${px(run.widthLu)};height:100%;direction:${run.direction};${align};font-family:'${fam}';font-size:${size}">`
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

function renderLine(line: LineFragment, manifest: AssetManifest | undefined, source: string | undefined): string {
  // breakReason 'fit' ⇔ המנוע הצדיק את הקו לרוחב הטור (dp.ts justificationOf);
  // ההיטל משחזר את המתיחה בדפדפן כדי שהקו ימלא את תיבתו כפי שחושב.
  const justified = line.breakReason === 'fit';
  const runs = line.runs.map((r, i) => renderRun(r, manifest, justified, i === 0, source)).join('');
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

function renderPage(page: LayoutPage, manifest: AssetManifest | undefined, source: string | undefined, markerLinkOf?: (noteId: string) => ProjectedLinkInfo | undefined, anchorLinkOf?: (anchorId: string) => ProjectedLinkInfo | undefined): string {
  const regions = page.regions
    .map((r) => `<div class="tora-region" data-region-id="${escapeAttr(r.id)}" data-region-kind="${r.kind}" style="${styleOfRect(r.rect)}"></div>`)
    .join('');
  const markerFont = manifest === undefined || manifest.fonts.length === 0
    ? undefined
    : fontFamilyOf(manifest.fonts[0]!.fontId, manifest);
  const items = page.items
    .map((item) => {
      switch (item.kind) {
        case 'line': return renderLine(item, manifest, source);
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
export interface RenderHtmlOptions {
  /**
   * מקור המסמך — נחוץ לשחזור הטקסט הלוגי של הריצות (תיקון שורש
   * 2026-11-09/ב'): מזהי האטומים מקודדים טווחי מקור וההיטל משחזר מהם
   * את סדר הקריאה. ריצה עם אטומים בלי מקור ⇐ שגיאה קולנית.
   */
  readonly source?: string;
}

export function renderHtml(layout: LayoutDocument, styleManifest?: StyleManifest, assetManifest?: AssetManifest, links?: LinkTable, opts?: RenderHtmlOptions): RenderHtmlResult {
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
  const pages = layout.pages.map((p) => renderPage(p, assetManifest, opts?.source, markerLinkOf, anchorLinkOf)).join('');
  const html = `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8">`
    + `<title>${escapeHtmlText(layout.policyId)}</title>`
    + `<style>${css}</style></head><body><div class="tora-root" data-policy-id="${escapeAttr(layout.policyId)}" data-schema-version="${layout.schemaVersion}">${pages}</div></body></html>`;
  return Object.freeze({ html, css });
}
