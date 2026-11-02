/**
 * templates.ts — תבניות עמוד, parity ובניית אזורים (שלב 50; פרק ז/M6).
 *
 * אסמכתא: אפיון §9.3 ("סדר חישוב של עמוד": בחירת תבנית ← מדידת
 * header/footer/ornaments ← בניית regions ← candidates), §5 (מלאי חלקי
 * העמוד — transfer-inventory `page-parts`), §10.1 (H0/H1 forcePageTemplate),
 * §11.1 (same_as_even; כותרות רצות — הגובה שמור בתבנית כבר בפריסה), §11.2
 * (שערים — נכס לפי מזהה ו־sha256, אין SVG מוטמע), §6.1 (גאומטריה ב-LU בלבד).
 *
 * עקרונות (שער השלב: "כל חלקי העמוד במלאי מיוצגים או מתועדת זניחה"):
 *   1. תבנית = הגדרה גאומטרית מלאה של סוג עמוד × parity: אזורים סטטיים
 *      כמלבני LU (header, טורי גוף, footer, outer-notes, ornament,
 *      custom-box) — כל תבנית נבנית מכמות מדודה או נעולה: גאומטריית
 *      העמוד מנוסחאות v0 הנעולות (A4, 25mm, נוסחת הטורים של הישן), וגובה
 *      header/footer מקלט מדוד (provider) — אין מספר קסם ואין תבנית
 *      בלתי-מדודה.
 *   2. **אזור ההערות הוא עוגן, לא אזור סטטי** (§9.3#5): גובהו נקבע
 *      לכל candidate בחיפוש ("רק אחר כך נקבע שטח הגוף הפנוי") — לכן
 *      התבנית נושאת ‎footnoteAnchor‎: מלבן המיקום המרבי בתחתית אזור
 *      התוכן, שממנו צומחת ההערה כלפי מעלה. אזורי הגוף מתפרשים על מלוא
 *      התוכן; אין חפיפה אסורה בין אזורים סטטיים — הכרעת הפיצול
 *      גוף/הערות היא החלטת חיפוש מתועדת (שלב 53), לא ניחוש תבנית.
 *   3. parity: recto (אי-זוגי, עמוד 1) ו-verso (זוגי). ספר עברי נפתח
 *      מימין לשמאל — על דף פרוש, העמוד האי-זוגי (recto) מופיע בצד שמאל
 *      של הפריסה הכפולה והקצה החיצוני שלו הוא קצה שמאל; ה-verso ההפוך.
 *      זה קובע את צד אזור ההערות החיצוני ואת מיקום פוליו-חוץ (§10.3:
 *      "recto/verso קובעים outer region, לא מספר עמוד לבדו").
 *   4. sameAs: כשאין הבדל גאומטרי בין recto ל-verso (אין פוליו-חוץ
 *      ואין אזור חיצוני), תבנית ה-verso מסומנת כראי של ה-recto —
 *      same_as_even במלאי הישן (hdr-distinct-even-odd=false ⇒ ירושת
 *      התוכן; הגאומטריה זהה ממילא).
 *   5. שערים (main/back/sub): העמוד כולו אזור ornament + custom-box
 *      המקושר לנכס לפי מזהה ו־sha256 מהמניפסט (§11.2) — אין SVG מוטמע
 *      ואין קריאת רשת. פענוח תיבות הטקסט של השער נדחה במפורש לשלב 68
 *      (M8; תיעוד ב-transfer-inventory) — לא זניחה שקטה.
 *   6. מזהי אזורים בעת הצבה (instantiatePageRegions) תואמים את v0
 *      במדויק (‏page:{N}:col:0, page:{N}:col:1, page:{N}:notes) — כך
 *      החיפוש (שלב 51) מזרים את אותם מזהים גם ל־PaginationState
 *      (remainingByRegion) וגם ל־IR.
 */
import { asLu, type LayoutUnit, type Rect } from '@tora/layout-api';
import type { PageKind, PageParity, RegionKind } from '@tora/layout-api';
import { LayoutEngineError } from '../errors.js';

// ─────────────────────────── התבנית ───────────────────────────

/** תפקיד אזור בתבנית — כמו RegionKind של ה־IR (§6.5), בלי מזהה עמוד. */
export type TemplateRegionRole = RegionKind;

/** אזור סטטי בתבנית: תפקיד + מלבן LU מלא (+טור, לגוף בלבד). */
export interface TemplateRegionSpec {
  readonly role: TemplateRegionRole;
  readonly rect: Rect;
  /** אינדקס טור — חוקי רק ל־body-column (0=ימין, 1=שמאל; §9.3). */
  readonly columnIndex?: 0 | 1;
}

/**
 * עוגן אזור הערות שוליים — המיקום המרבי שממנו צומחות ההערות כלפי מעלה
 * (§9.3#5). הגובה בפועל נקבע לכל candidate בחיפוש; העוגן נועל את הרוחב,
 * את תחתית הצמיחה ואת מספר טורי ההערות (fn-columns של הישן; סדר הקריאה
 * והמילוי — policy, §10.3).
 */
export interface FootnoteAnchor {
  /** מלבן המיקום המרבי — תחתיתו צמודה לראש ה-footer (או תחתית התוכן). */
  readonly rect: Rect;
  readonly columns: 1 | 2;
}

/** נכס שער/עיטור המקושר לתבנית — לפי מזהה ו־sha256 מהמניפסט (§11.2). */
export interface TemplateAssetRef {
  readonly assetId: string;
  readonly sha256: string;
  /** viewBox של הנכס (יחידות SVG) — לתיעוד ולפרופורציה בלבד. */
  readonly viewBox: { readonly width: number; readonly height: number };
}

/** מדיניות פוליו מודפס לסוג עמוד (§11.1 — המספר המודפס נגזר מ-AnchorTable). */
export type FolioPolicy = 'show' | 'hide';

/** תבנית עמוד — סוג × parity; immutable וקפואה ביצירה. */
export interface PageTemplate {
  /** ‎tpl:{kind}:{parity}‎ — קנוני. */
  readonly id: string;
  readonly kind: PageKind;
  readonly parity: PageParity;
  readonly columns: 1 | 2;
  readonly size: { readonly width: LayoutUnit; readonly height: LayoutUnit };
  readonly regions: readonly TemplateRegionSpec[];
  /** עוגן הערות השוליים — קיים בתבניות תוכן (body/toc) בלבד. */
  readonly footnoteAnchor?: FootnoteAnchor;
  /** תבנית שהיא ראי גאומטרי שלה (same_as_even) — מתועד, לא משוכפל בשקט. */
  readonly sameAs?: string;
  /** נכס שער/עיטור מקושר (אין SVG מוטמע). */
  readonly asset?: TemplateAssetRef;
  readonly folio: FolioPolicy;
}

// ─────────────────────────── קלט הבנייה ───────────────────────────

/**
 * קלט בניית סט התבניות. הגאומטריה מ-V0Geometry (נוסחאות נעולות של
 * הישן); גבהי header/footer הם כמויות מדודות (קו כותרת רצה/פוליו בגובה
 * שורה אצל הספק) — חובה חיוביים; אין ברירת מחדל שקטה.
 */
export interface TemplateSetInput {
  /** גאומטריה נעולה מ-readV0Settings (A4, שוליים, טורים, תוכן עליון/תחתון). */
  readonly geometry: {
    readonly pageWidth: LayoutUnit;
    readonly pageHeight: LayoutUnit;
    readonly margin: LayoutUnit;
    readonly mainX: LayoutUnit;
    readonly mainWidth: LayoutUnit;
    readonly columnWidth: LayoutUnit;
    readonly columnGap: LayoutUnit;
    readonly contentTop: LayoutUnit;
    readonly contentBottom: LayoutUnit;
  };
  /** גובה אזור כותרת רצה — מדוד (שורת header אחת; §9.3#2). */
  readonly headerHeightLu: LayoutUnit;
  /** גובה אזור פוטר/פוליו — מדוד (שורת פוליו אחת). */
  readonly footerHeightLu: LayoutUnit;
  /** מספר טורי גוף: 2 ברירת הישן; 1 חוקי. */
  readonly columns: 1 | 2;
  /** מספר טורי הערות שוליים (fn-columns של הישן): 1 או 2. */
  readonly footnoteColumns: 1 | 2;
  /** מיקום פוליו (page-num-position): מרכז או חוץ (צד לפי parity). */
  readonly folioPosition: 'bottom_center' | 'bottom_outer';
  /** האם להציג פוליו בעמודי תוכן (עמודי שער אינם ממוספרים אצל הישן). */
  readonly showFolio: boolean;
  /** רוחב אזור הערות החיצוניות (הערות צד; §9.3#3) — null = אין אזור. */
  readonly sidenoteWidthLu: LayoutUnit | null;
  /** נכסי שער לפי סוג — מקושרים מהמניפסט; חסר = תבניות שער בלי נכס (מתועד). */
  readonly shaarAssets?: Readonly<Partial<Record<'main-shaar' | 'back-shaar' | 'sub-shaar', TemplateAssetRef>>>;
}

// ─────────────────────────── אימות ───────────────────────────

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}

function rectIssues(r: unknown, label: string): string[] {
  const v = r as Record<string, unknown> | null;
  if (typeof v !== 'object' || v === null) return [`${label}:not-a-rect`];
  const out: string[] = [];
  for (const f of ['x', 'y', 'width', 'height'] as const) {
    const val = v[f];
    const ok = isPositiveInt(val) || ((f === 'x' || f === 'y') && val === 0);
    if (!ok) out.push(`${label}.${f}`);
  }
  return out;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function rectInsidePage(rect: Rect, w: number, h: number): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= w && rect.y + rect.height <= h;
}

/** אימות תבנית — רשימת בעיות (ריקה = תקין). חפיפות בין אזורים סטטיים אסורות; הכלה בעמוד חובה. */
export function pageTemplateIssues(t: unknown): string[] {
  const issues: string[] = [];
  if (typeof t !== 'object' || t === null) return ['not-an-object'];
  const v = t as Record<string, unknown>;
  if (typeof v.id !== 'string' || !/^tpl:(main-shaar|back-shaar|sub-shaar|toc|body|notes):(recto|verso)$/.test(v.id)) issues.push('id');
  const parts = typeof v.id === 'string' ? v.id.split(':') : [];
  if (v.kind !== parts[1]) issues.push('kind:id-mismatch');
  if (v.parity !== parts[2]) issues.push('parity:id-mismatch');
  if (v.columns !== 1 && v.columns !== 2) issues.push('columns');
  const sizeV = v.size as Record<string, unknown> | null | undefined;
  if (!isPositiveInt(sizeV?.width) || !isPositiveInt(sizeV?.height)) { issues.push('size'); return issues; }
  const pageW = sizeV!.width as number;
  const pageH = sizeV!.height as number;
  if (!Array.isArray(v.regions) || v.regions.length === 0) { issues.push('regions:empty'); return issues; }
  const allowedRoles: readonly string[] = ['header', 'body-column', 'footnotes', 'outer-notes', 'footer', 'ornament', 'custom-box'];
  const bodyCols = new Set<number>();
  for (let i = 0; i < (v.regions as unknown[]).length; i++) {
    const r = (v.regions as unknown[])[i] as Record<string, unknown> | null;
    const rl = `regions[${i}]`;
    if (typeof r !== 'object' || r === null) { issues.push(`${rl}:not-an-object`); continue; }
    if (!allowedRoles.includes(String(r.role))) issues.push(`${rl}.role`);
    const ri = rectIssues(r.rect, `${rl}.rect`);
    issues.push(...ri);
    if (ri.length === 0 && !rectInsidePage(r.rect as Rect, pageW, pageH)) issues.push(`${rl}.rect:outside-page`);
    if (r.role === 'body-column') {
      if (r.columnIndex !== 0 && r.columnIndex !== 1) issues.push(`${rl}.columnIndex`);
      else if (bodyCols.has(r.columnIndex as number)) issues.push(`${rl}.columnIndex:duplicate`);
      else bodyCols.add(r.columnIndex as number);
    } else if (r.columnIndex !== undefined) issues.push(`${rl}.columnIndex:not-a-body-column`);
  }
  // חפיפות אסורות בין אזורים סטטיים (נגיעת קצה מותרת — הבדל קטן-מאוד).
  // חריג מתועד: ornament הוא שכבת רקע (§11.2 — עיצוב השער כולל תיבות
  // טקסט מעל רקע מעוטר) — חפיפתו עם custom-box בעמודי שער מכוונת;
  // כל זוג אחר שאינו ornament נבדק במלואו.
  const regions = (v.regions as { rect: Rect; role?: unknown }[]).filter((r) => typeof r === 'object' && r !== null);
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i]!;
      const b = regions[j]!;
      if (a.role === 'ornament' || b.role === 'ornament') continue; // שכבת רקע — מתועד
      if (rectsOverlap(a.rect, b.rect)) issues.push(`overlap:${i}-${j}`);
    }
  }
  if (v.folio !== 'show' && v.folio !== 'hide') issues.push('folio');
  if (v.sameAs !== undefined && (typeof v.sameAs !== 'string' || v.sameAs.length === 0)) issues.push('sameAs');
  if (v.asset !== undefined) {
    const a = v.asset as Record<string, unknown> | null;
    const vb = a?.viewBox as Record<string, unknown> | undefined;
    if (typeof a !== 'object' || a === null || typeof a.assetId !== 'string' || a.assetId.length === 0
      || typeof a.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(a.sha256)
      || !isPositiveInt(vb?.width) || !isPositiveInt(vb?.height)) issues.push('asset');
  }
  // עוגן הערות: בתוך העמוד, רוחב חוקי, טורים 1|2; קיים רק בתבניות תוכן.
  if (v.footnoteAnchor !== undefined) {
    const fa = v.footnoteAnchor as Record<string, unknown> | null;
    const fi = rectIssues(fa?.rect, 'footnoteAnchor.rect');
    issues.push(...fi);
    if (fi.length === 0 && !rectInsidePage((fa!.rect as Rect), pageW, pageH)) issues.push('footnoteAnchor.rect:outside-page');
    if (fa?.columns !== 1 && fa?.columns !== 2) issues.push('footnoteAnchor.columns');
    if (v.kind !== 'body' && v.kind !== 'toc') issues.push('footnoteAnchor:not-content-kind');
  }
  return issues;
}

// ─────────────────────────── בניית תבניות ───────────────────────────

function makeTemplate(input: PageTemplate): PageTemplate {
  const issues = pageTemplateIssues(input);
  if (issues.length > 0) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'template', reason: `${input.id}: ${issues.join(';')}` }, `תבנית עמוד שגויה: ${input.id}`);
  }
  return Object.freeze({
    ...input,
    regions: Object.freeze([...input.regions]),
    size: Object.freeze({ ...input.size }),
    ...(input.footnoteAnchor !== undefined ? { footnoteAnchor: Object.freeze({ ...input.footnoteAnchor, rect: Object.freeze({ ...input.footnoteAnchor.rect }) }) } : {}),
  });
}

/** הצד החיצוני של העמוד לפי parity — ספר עברי (RTL): recto=שמאל, verso=ימין. */
export function outerSideOf(parity: PageParity): 'left' | 'right' {
  return parity === 'recto' ? 'left' : 'right';
}

/**
 * תבנית עמוד תוכן (body/toc): header למעלה, טורי גוף (ימין 0 ואז שמאל 1 —
 * §9.3#3) על מלוא אזור התוכן שאחרי ה-header ולפני ה-footer, עוגן הערות
 * בתחתית (צומח כלפי מעלה בחיפוש), footer למטה ואזור חיצוני להערות צד
 * (בצד החיצוני לפי parity) כשמוגדר רוחב.
 */
function buildContentTemplate(kind: 'body' | 'toc', parity: PageParity, input: TemplateSetInput): PageTemplate {
  const g = input.geometry;
  const hasHeader = input.headerHeightLu > 0;
  const hasFooter = input.footerHeightLu > 0 && input.showFolio;
  const headerH = hasHeader ? input.headerHeightLu : 0;
  const footerH = hasFooter ? input.footerHeightLu : 0;
  const bodyTop = asLu(g.contentTop + headerH);
  const bodyBottom = asLu(g.contentBottom - footerH);
  const bodyHeight = asLu(Math.max(1, bodyBottom - bodyTop));
  const regions: TemplateRegionSpec[] = [];
  if (hasHeader) {
    regions.push({ role: 'header', rect: { x: g.mainX, y: g.contentTop, width: g.mainWidth, height: input.headerHeightLu } });
  }
  if (input.columns === 2) {
    regions.push({ role: 'body-column', columnIndex: 0, rect: { x: asLu(g.mainX + g.columnWidth + g.columnGap), y: bodyTop, width: g.columnWidth, height: bodyHeight } });
    regions.push({ role: 'body-column', columnIndex: 1, rect: { x: g.mainX, y: bodyTop, width: g.columnWidth, height: bodyHeight } });
  } else {
    regions.push({ role: 'body-column', columnIndex: 0, rect: { x: g.mainX, y: bodyTop, width: g.mainWidth, height: bodyHeight } });
  }
  if (hasFooter) {
    regions.push({ role: 'footer', rect: { x: g.mainX, y: asLu(g.contentBottom - input.footerHeightLu), width: g.mainWidth, height: input.footerHeightLu } });
  }
  if (input.sidenoteWidthLu !== null && input.sidenoteWidthLu > 0) {
    const w = input.sidenoteWidthLu;
    const side = outerSideOf(parity);
    const x = side === 'left' ? asLu(Math.max(0, g.mainX - w)) : asLu(g.mainX + g.mainWidth);
    const avail = side === 'left' ? g.mainX : asLu(g.pageWidth - (g.mainX + g.mainWidth));
    if (w <= avail) {
      regions.push({ role: 'outer-notes', rect: { x, y: bodyTop, width: w, height: bodyHeight } });
    }
  }
  const mirrored = parity === 'verso' && input.folioPosition === 'bottom_center'
    && (input.sidenoteWidthLu === null || input.sidenoteWidthLu <= 0);
  return makeTemplate({
    id: `tpl:${kind}:${parity}`,
    kind,
    parity,
    columns: input.columns,
    size: { width: g.pageWidth, height: g.pageHeight },
    regions,
    footnoteAnchor: { rect: { x: g.mainX, y: bodyTop, width: g.mainWidth, height: bodyHeight }, columns: input.footnoteColumns },
    ...(mirrored ? { sameAs: `tpl:${kind}:recto` } : {}),
    folio: input.showFolio ? 'show' : 'hide',
  });
}

/** תבנית עמודי notes: טור בודד ברוחב מלא (כמו v0), בלי הערות-שוליים. */
function buildNotesTemplate(parity: PageParity, input: TemplateSetInput): PageTemplate {
  const g = input.geometry;
  const headerH = input.headerHeightLu > 0 ? input.headerHeightLu : 0;
  const top = asLu(g.contentTop + headerH);
  const height = asLu(Math.max(1, g.contentBottom - top));
  const regions: TemplateRegionSpec[] = [{ role: 'body-column', columnIndex: 0, rect: { x: g.mainX, y: top, width: g.mainWidth, height } }];
  if (input.headerHeightLu > 0) {
    regions.unshift({ role: 'header', rect: { x: g.mainX, y: g.contentTop, width: g.mainWidth, height: input.headerHeightLu } });
  }
  return makeTemplate({
    id: `tpl:notes:${parity}`,
    kind: 'notes',
    parity,
    columns: 1,
    size: { width: g.pageWidth, height: g.pageHeight },
    regions,
    sameAs: parity === 'verso' ? 'tpl:notes:recto' : undefined,
    folio: 'hide',
  });
}

/**
 * תבנית עמוד שער (main/back/sub): העמוד כולו אזור ornament + custom-box
 * המקושר לנכס לפי מזהה ו־sha256 (§11.2). פענוח תיבות הטקסט וה-safe-areas
 * של העיצוב — שלב 68 (M8), מתועד ב-transfer-inventory; כאן הגאומטריה
 * המלאה של העמוד שמורה והנכס נעול בהאש.
 */
function buildShaarTemplate(kind: 'main-shaar' | 'back-shaar' | 'sub-shaar', parity: PageParity, input: TemplateSetInput): PageTemplate {
  const g = input.geometry;
  const regions: TemplateRegionSpec[] = [
    { role: 'ornament', rect: { x: asLu(0), y: asLu(0), width: g.pageWidth, height: g.pageHeight } },
    { role: 'custom-box', rect: { x: g.margin, y: g.margin, width: asLu(Math.max(1, g.pageWidth - 2 * g.margin)), height: asLu(Math.max(1, g.pageHeight - 2 * g.margin)) } },
  ];
  const asset = input.shaarAssets?.[kind];
  return makeTemplate({
    id: `tpl:${kind}:${parity}`,
    kind,
    parity,
    columns: 1,
    size: { width: g.pageWidth, height: g.pageHeight },
    regions,
    sameAs: parity === 'verso' ? `tpl:${kind}:recto` : undefined,
    ...(asset !== undefined ? { asset } : {}),
    folio: 'hide',
  });
}

/** סט תבניות לפי מזהה — נבנה פעם אחת לפני החיפוש (§9.3#1). */
export interface PageTemplateSet {
  readonly byId: ReadonlyMap<string, PageTemplate>;
  /** בחירת תבנית לעמוד פיזי: parity נגזר מהאינדקס (אי-זוגי=recto; IR §6.5). */
  for(kind: PageKind, physicalPageIndex: number): PageTemplate;
}

/** בניית סט התבניות המלא — 12 תבניות (6 סוגים × 2 parity). */
export function buildPageTemplateSet(input: TemplateSetInput): PageTemplateSet {
  // גובה 0 הוא ערך מדוד לגיטימי (אין כותרת רצה/פוליו בספר זה); שלילי
  // או לא-שלם — דחייה מקוטלגת (אין עיגול שקט, אין ברירת מחדל נסתרת).
  const isMeasuredHeight = (v: number) => Number.isSafeInteger(v) && v >= 0;
  if (!isMeasuredHeight(input.headerHeightLu) || !isMeasuredHeight(input.footerHeightLu)) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'template-set', reason: 'header/footer heights must be measured non-negative integer LU' }, 'גבהי header/footer חייבים מדידה (LU שלם לא-שלילי)');
  }
  if (input.columns !== 1 && input.columns !== 2) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'template-set', reason: `columns=${String(input.columns)}` }, 'מספר טורים חייב 1 או 2');
  }
  if (input.footnoteColumns !== 1 && input.footnoteColumns !== 2) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'template-set', reason: `footnoteColumns=${String(input.footnoteColumns)}` }, 'מספר טורי הערות חייב 1 או 2');
  }
  if (input.sidenoteWidthLu !== null && !isPositiveInt(input.sidenoteWidthLu)) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'template-set', reason: 'sidenote width' }, 'רוחב אזור ההערות החיצוני שגוי');
  }
  if (input.folioPosition !== 'bottom_center' && input.folioPosition !== 'bottom_outer') {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'template-set', reason: `folioPosition=${String(input.folioPosition)}` }, 'מיקום פוליו שגוי');
  }
  const templates: PageTemplate[] = [];
  for (const parity of ['recto', 'verso'] as const) {
    templates.push(buildContentTemplate('body', parity, input));
    templates.push(buildContentTemplate('toc', parity, input));
    templates.push(buildNotesTemplate(parity, input));
    templates.push(buildShaarTemplate('main-shaar', parity, input));
    templates.push(buildShaarTemplate('back-shaar', parity, input));
    templates.push(buildShaarTemplate('sub-shaar', parity, input));
  }
  const byId = new Map(templates.map((t) => [t.id, t]));
  return Object.freeze({
    byId,
    for(kind: PageKind, physicalPageIndex: number): PageTemplate {
      if (!Number.isSafeInteger(physicalPageIndex) || physicalPageIndex < 1) {
        throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'template-for', reason: `physicalPageIndex=${String(physicalPageIndex)}` }, 'אינדקס עמוד פיזי שגוי');
      }
      const parity: PageParity = physicalPageIndex % 2 === 1 ? 'recto' : 'verso';
      const t = byId.get(`tpl:${kind}:${parity}`);
      if (t === undefined) {
        throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'template-for', reason: `tpl:${kind}:${parity}` }, 'תבנית לא נמצאה');
      }
      return t;
    },
  });
}

// ─────────────────────────── הצבה על עמוד פיזי ───────────────────────────

/** אזור מוצב על עמוד פיזי — מזהה קנוני תואם v0 (‏page:{N}:…). */
export interface PlacedRegion {
  readonly id: string;
  readonly kind: RegionKind;
  readonly rect: Rect;
  readonly columnIndex?: 0 | 1;
}

const ROLE_TO_ID: Readonly<Record<string, string>> = Object.freeze({
  header: 'header',
  'body-column': 'col',
  footnotes: 'notes',
  'outer-notes': 'outer',
  footer: 'footer',
  ornament: 'ornament',
  'custom-box': 'box',
});

/**
 * הצבת אזורי התבנית הסטטיים על עמוד פיזי: מזהים קנוניים — ‎page:{N}:col:{i}‎
 * (גוף), ‎page:{N}:header|footer|outer|ornament|box‎. המלבנים מועתקים כמו
 * שהם (התבנית כבר בקואורדינטות העמוד); הפונקציה טהורה ודטרמיניסטית.
 * אזור ההערות בפועל (‏page:{N}:notes‎) נבנה בחיפוש מעוגן ההערות (שלב 53)
 * — לכן הוא אינו ברשימת האזורים הסטטיים; מזהה העוגן הקנוני זמין ב־
 * notesRegionIdOf.
 */
export function instantiatePageRegions(template: PageTemplate, physicalPageIndex: number): readonly PlacedRegion[] {
  if (!Number.isSafeInteger(physicalPageIndex) || physicalPageIndex < 1) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'instantiate', reason: `physicalPageIndex=${String(physicalPageIndex)}` }, 'אינדקס עמוד פיזי שגוי');
  }
  const issues = pageTemplateIssues(template);
  if (issues.length > 0) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'instantiate', reason: `${template.id}: ${issues.join(';')}` }, `תבנית עמוד שגויה: ${template.id}`);
  }
  return Object.freeze(template.regions.map((r) => {
    const base = ROLE_TO_ID[r.role] ?? r.role;
    const suffix = r.role === 'body-column' ? `:${r.columnIndex ?? 0}` : '';
    return Object.freeze({
      id: `page:${physicalPageIndex}:${base}${suffix}`,
      kind: r.role,
      rect: Object.freeze({ ...r.rect }),
      ...(r.columnIndex !== undefined ? { columnIndex: r.columnIndex } : {}),
    });
  }));
}

/** המזהה הקנוני של אזור ההערות בעמוד — ‎page:{N}:notes‎ (כמו v0). */
export function notesRegionIdOf(physicalPageIndex: number): string {
  if (!Number.isSafeInteger(physicalPageIndex) || physicalPageIndex < 1) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'notes-region-id', reason: `physicalPageIndex=${String(physicalPageIndex)}` }, 'אינדקס עמוד פיזי שגוי');
  }
  return `page:${physicalPageIndex}:notes`;
}

/**
 * נותרי אזורים ל-PaginationState של עמוד חדש: לכל אזור סטטי מלוא הגובה
 * הפנוי; אזור ההערות (‏page:{N}:notes‎) מתחיל במלוא גובה עוגן ההערות —
 * תקציב ההערות של העמוד. האינווריאנט "גובה גוף פנוי + הערות שנצרכו ≤
 * גובה התוכן" נאכף על ידי החיפוש (שלב 53) — החוזה מתועד כאן ובבדיקות.
 */
export function initialRemainingByRegion(template: PageTemplate, physicalPageIndex: number): Readonly<Record<string, LayoutUnit>> {
  const regions = instantiatePageRegions(template, physicalPageIndex);
  const out: Record<string, LayoutUnit> = {};
  for (const r of regions) {
    out[r.id] = r.rect.height;
  }
  if (template.footnoteAnchor !== undefined) {
    out[notesRegionIdOf(physicalPageIndex)] = template.footnoteAnchor.rect.height;
  }
  return Object.freeze(out);
}

/** פוליו מוצג לפי מדיניות התבנית (המספר המודפס עצמו מ-AnchorTable; §11.1). */
export function templateShowsFolio(template: PageTemplate): boolean {
  return template.folio === 'show';
}
