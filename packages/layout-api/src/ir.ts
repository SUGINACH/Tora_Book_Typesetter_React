/**
 * ir.ts — ה־Layout IR המלא (§6.5; שלב 31 בתכנית 100 השלבים).
 *
 * אסמכתא: אפיון §6.5 (LayoutDocument/Page/Region/LineFragment/PlacedItem),
 * §6.2 (provenance — spans/atoms ממותגים מ-content-model), §6.1 (גאומטריה
 * ב־LU בלבד), §6.4 (FontFaceKey לציון הגופן ששימש למדידה).
 *
 * עקרונות:
 *   1. immutable בלבד — כל יצירה עוברת createLayoutDocument שמאמת ומקפיא
 *      (deep freeze). אין contentHtml, אין className, אין גובה mutable.
 *   2. כל הפניה לטקסט היא במזהים (AtomId/NodeId/AnchorId) ובפרוסות; כל
 *      קו נושא glyph runs המאפשרים למדוד מחדש את רוחבו (§6.5).
 *   3. ההיטלים (HTML/PDF/React) צורכים את ה־IR בלבד — ה־IR נושא את הטקסט
 *      של כל run (text) כדי ש-render-html יוכל לעבוד ללא content-model
 *      (גרף §5: render-html תלוי ב-layout-api בלבד).
 *   4. נכסים לפי מזהה ו־hash בלבד (§6.5) — אין SVG מוטמע.
 */
import type {
  AnchorId,
  AtomId,
  NodeId,
  SourceSpan,
  TransformRecord,
} from '@tora/content-model';
import { isTransformRecord } from '@tora/content-model';
import type { FontFaceKey, LayoutUnit, Rect } from '@tora/measurement-api';
import { LayoutApiError } from './errors.js';

// ─────────────────────────── מונחי יסוד מומרזים ───────────────────────────

/** טרנספורמציה מוצהרת של תוכן — זהות מבנית ל-TransformRecord של content-model. */
export type ContentTransformation = TransformRecord;

// ─────────────────────────── המסמך ───────────────────────────

export type PageKind = 'main-shaar' | 'back-shaar' | 'sub-shaar' | 'toc' | 'body' | 'notes';
export const PAGE_KINDS: readonly PageKind[] = Object.freeze(
  ['main-shaar', 'back-shaar', 'sub-shaar', 'toc', 'body', 'notes'] as const,
);

export type PageParity = 'recto' | 'verso';

export interface LayoutDocument {
  readonly schemaVersion: 1;
  readonly policyId: string;
  readonly pages: readonly LayoutPage[];
  readonly anchors: readonly PageAnchor[];
  readonly transformations: readonly ContentTransformation[];
}

export interface LayoutPage {
  readonly id: string;
  readonly physicalIndex: number; // 1-based, רץ מ־1 ללא דילוגים
  readonly printedFolio?: string;
  readonly parity: PageParity;
  readonly kind: PageKind;
  readonly size: { readonly width: LayoutUnit; readonly height: LayoutUnit };
  readonly regions: readonly LayoutRegion[];
  readonly items: readonly PlacedItem[];
}

export type RegionKind = 'header' | 'body-column' | 'footnotes' | 'outer-notes' | 'footer' | 'ornament' | 'custom-box';
export const REGION_KINDS: readonly RegionKind[] = Object.freeze(
  ['header', 'body-column', 'footnotes', 'outer-notes', 'footer', 'ornament', 'custom-box'] as const,
);

export interface LayoutRegion {
  readonly id: string;
  readonly kind: RegionKind;
  readonly rect: Rect;
  readonly columnIndex?: 0 | 1;
}

// ─────────────────────────── קווים וריצות ממוקמות ───────────────────────────

export type BreakReason = 'fit' | 'required' | 'paragraph-end' | 'emergency';
export const BREAK_REASONS: readonly BreakReason[] = Object.freeze(
  ['fit', 'required', 'paragraph-end', 'emergency'] as const,
);

export type ContinuationKind = 'start' | 'middle' | 'end' | 'whole';
export const CONTINUATION_KINDS: readonly ContinuationKind[] = Object.freeze(
  ['start', 'middle', 'end', 'whole'] as const,
);

/** גליף ממוקם — זהות מבנית ל-ShapedGlyph של המדידה, עם מזהה אטום מפורש. */
export interface PositionedGlyph {
  readonly glyphId: number;
  readonly atomId: AtomId;
  /** אינדקס האטום בתוך ה-run (clusterAtomIndex של המדידה). */
  readonly clusterAtomIndex: number;
  readonly advanceLu: LayoutUnit;
  readonly xOffsetLu: LayoutUnit;
  readonly yOffsetLu: LayoutUnit;
}

/**
 * ריצת טקסט ממוקמת על קו: פלט ה-shaping כפי שנמדד, במיקומו על הקו.
 * startLu הוא ההיסב מהקצה השמאלי של תיבת הקו; הריצה נושאת את הטקסט
 * (סדר לוגי) כדי שההיטלים יעבדו ללא content-model.
 */
export interface PositionedRun {
  readonly kind: 'run';
  readonly id: string;
  readonly font: FontFaceKey;
  readonly fontSizeLu: LayoutUnit;
  readonly direction: 'rtl' | 'ltr';
  /** היסב מקצה שמאל של תיבת הקו, ב-LU. */
  readonly startLu: LayoutUnit;
  readonly widthLu: LayoutUnit;
  /** טקסט הריצה בסדר לוגי — אותם אטומים, אותו סדר מקור. */
  readonly text: string;
  readonly glyphs: readonly PositionedGlyph[];
  readonly atomIds: readonly AtomId[];
  readonly requestHash: string;
}

export interface LineFragment {
  readonly kind: 'line';
  readonly id: string;
  readonly blockId: NodeId;
  readonly fragmentIndex: number;
  readonly lineIndex: number;
  readonly regionId: string;
  readonly rect: Rect;
  readonly baseline: LayoutUnit;
  readonly runs: readonly PositionedRun[];
  readonly sourceSpans: readonly SourceSpan[];
  readonly breakReason: BreakReason;
  readonly continuation: ContinuationKind;
  /** יישור קו סיום הפסקה (body-last-line-align, נספח ג) — מופיע בקו האחרון
   * של פסקה בלבד; ממומש גם גאומטרית בהצבה (שלב 45 חיבור 47). */
  readonly lastLineAlign?: 'center' | 'right';
}

// ─────────────────────────── פריטים ממוקמים אחרים ───────────────────────────

export interface PositionedRule {
  readonly kind: 'rule';
  readonly id: string;
  readonly regionId: string;
  readonly rect: Rect;
  readonly ruleKind: 'separator' | 'ornament';
  readonly weightLu?: LayoutUnit;
}

export interface PositionedOrnament {
  readonly kind: 'ornament';
  readonly id: string;
  readonly regionId: string;
  readonly rect: Rect;
  /** נכס לפי מזהה ו־hash (§6.5) — אין SVG מוטמע. */
  readonly assetId: string;
  readonly assetSha256: string;
}

export interface PositionedNoteMarker {
  readonly kind: 'note-marker';
  readonly id: string;
  readonly noteId: string;
  /** התווית המודפסת של הסמן (resolved label; §10.3 — נקבעת טרם הרינדור). */
  readonly label: string;
  readonly regionId: string;
  readonly rect: Rect;
  readonly baseline: LayoutUnit;
  readonly source: SourceSpan;
  /** האם הסמן עילי (superscript) — לפי note-marker-type. */
  readonly superscript: boolean;
}

export interface PositionedAnchor {
  readonly kind: 'anchor';
  readonly id: string;
  readonly anchorId: AnchorId;
  readonly regionId: string;
  readonly rect: Rect;
  readonly source: SourceSpan;
}

export type PlacedItem =
  | LineFragment
  | PositionedRule
  | PositionedOrnament
  | PositionedNoteMarker
  | PositionedAnchor;

export const PLACED_ITEM_KINDS: readonly PlacedItem['kind'][] = Object.freeze(
  ['line', 'rule', 'ornament', 'note-marker', 'anchor'] as const,
);

/** עוגן במסמך: מזהה, עמוד ואזור (§11 — AnchorTable נבנה ממנו). */
export interface PageAnchor {
  readonly anchorId: AnchorId;
  readonly pageId: string;
  readonly regionId: string;
  readonly itemId?: string;
  readonly source?: SourceSpan;
}

// ─────────────────────────── אימות מבני ───────────────────────────

const ID_RE = /^[^\s]{1,256}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isSafeNonNegativeInt(v: unknown): boolean {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

/** ריצה שכל גליפיה בקידום אפס — רווחים עוקבים בסוף קו (שלב 47; מודל שלב 41). */
function isAllZeroAdvanceRun(sv: Record<string, unknown>): boolean {
  const glyphs = sv.glyphs;
  if (!Array.isArray(glyphs) || glyphs.length === 0) return false;
  return glyphs.every((g) => typeof g === 'object' && g !== null
    && (g as Record<string, unknown>).advanceLu === 0);
}

function isSafePositiveInt(v: unknown): boolean {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}

function rectIssues(v: unknown, label: string): string[] {
  if (!isPlainObject(v)) return [`${label}:not-a-rect`];
  const r = v as Record<string, unknown>;
  const out: string[] = [];
  for (const f of ['x', 'y', 'width', 'height'] as const) {
    if (!isSafeNonNegativeInt(r[f])) out.push(`${label}.${f}`);
  }
  if (out.length === 0) {
    if ((r.width as number) <= 0) out.push(`${label}.width:not-positive`);
    if ((r.height as number) <= 0) out.push(`${label}.height:not-positive`);
  }
  return out;
}

function rectContains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

function rectOf(v: unknown): Rect {
  return v as Rect;
}

/** אימות מבני מלא של LayoutDocument — רשימת בעיות (ריקה = תקין). */
export function layoutDocumentIssues(doc: unknown): string[] {
  const issues: string[] = [];
  if (!isPlainObject(doc)) return ['document:not-an-object'];
  const d = doc as Record<string, unknown>;
  if (d.schemaVersion !== 1) issues.push('schemaVersion');
  if (typeof d.policyId !== 'string' || d.policyId.length === 0 || d.policyId.length > 128) issues.push('policyId');
  if (!Array.isArray(d.pages) || d.pages.length === 0) {
    issues.push('pages:empty');
    return issues;
  }
  if (!Array.isArray(d.anchors)) { issues.push('anchors:not-an-array'); return issues; }
  if (!Array.isArray(d.transformations)) { issues.push('transformations:not-an-array'); return issues; }

  // ── עמודים ──
  const pageIds = new Set<string>();
  const regionIds = new Set<string>();
  const regionRects = new Map<string, Rect>();
  const itemIds = new Set<string>();
  let prevPhysical = 0;
  for (let pi = 0; pi < d.pages.length; pi++) {
    const pv = d.pages[pi];
    if (!isPlainObject(pv)) { issues.push(`pages[${pi}]:not-an-object`); continue; }
    const p = pv as Record<string, unknown>;
    const pl = `pages[${pi}]`;
    if (typeof p.id !== 'string' || !ID_RE.test(p.id)) issues.push(`${pl}.id`);
    else if (pageIds.has(p.id)) issues.push(`${pl}.id:duplicate`);
    else pageIds.add(p.id);
    if (!isSafePositiveInt(p.physicalIndex)) issues.push(`${pl}.physicalIndex`);
    else if ((p.physicalIndex as number) !== prevPhysical + 1) issues.push(`${pl}.physicalIndex:not-sequential`);
    else prevPhysical = p.physicalIndex as number;
    const expectedParity: PageParity = ((p.physicalIndex as number) % 2 === 1) ? 'recto' : 'verso';
    if (p.parity !== expectedParity) issues.push(`${pl}.parity`);
    if (!(PAGE_KINDS as readonly string[]).includes(p.kind as string)) issues.push(`${pl}.kind`);
    if (p.printedFolio !== undefined && (typeof p.printedFolio !== 'string' || p.printedFolio.length === 0)) {
      issues.push(`${pl}.printedFolio`);
    }
    if (!isPlainObject(p.size) || !isSafePositiveInt((p.size as Record<string, unknown>).width)
      || !isSafePositiveInt((p.size as Record<string, unknown>).height)) {
      issues.push(`${pl}.size`);
    }
    if (!Array.isArray(p.regions)) { issues.push(`${pl}.regions:not-an-array`); continue; }
    if (!Array.isArray(p.items)) { issues.push(`${pl}.items:not-an-array`); continue; }

    const pageRect: Rect | null = isPlainObject(p.size)
      ? { x: 0 as LayoutUnit, y: 0 as LayoutUnit, width: (p.size as Record<string, unknown>).width as LayoutUnit, height: (p.size as Record<string, unknown>).height as LayoutUnit }
      : null;

    // ── אזורים ──
    for (let ri = 0; ri < p.regions.length; ri++) {
      const rv = p.regions[ri];
      if (!isPlainObject(rv)) { issues.push(`${pl}.regions[${ri}]:not-an-object`); continue; }
      const r = rv as Record<string, unknown>;
      const rl = `${pl}.regions[${ri}]`;
      if (typeof r.id !== 'string' || !ID_RE.test(r.id)) issues.push(`${rl}.id`);
      else if (regionIds.has(r.id)) issues.push(`${rl}.id:duplicate`);
      else regionIds.add(r.id);
      if (!(REGION_KINDS as readonly string[]).includes(r.kind as string)) issues.push(`${rl}.kind`);
      const ri_ = rectIssues(r.rect, `${rl}.rect`);
      issues.push(...ri_);
      if (ri_.length === 0 && pageRect !== null && !rectContains(pageRect, rectOf(r.rect))) {
        issues.push(`${rl}.rect:outside-page`);
      }
      if (ri_.length === 0) regionRects.set(r.id as string, rectOf(r.rect));
      if (r.columnIndex !== undefined && r.columnIndex !== 0 && r.columnIndex !== 1) issues.push(`${rl}.columnIndex`);
    }

    // ── פריטים ──
    for (let ii = 0; ii < p.items.length; ii++) {
      const iv = p.items[ii];
      if (!isPlainObject(iv)) { issues.push(`${pl}.items[${ii}]:not-an-object`); continue; }
      const it = iv as Record<string, unknown>;
      const il = `${pl}.items[${ii}]`;
      if (typeof it.id !== 'string' || !ID_RE.test(it.id)) { issues.push(`${il}.id`); continue; }
      if (itemIds.has(it.id)) { issues.push(`${il}.id:duplicate`); continue; }
      itemIds.add(it.id);
      if (typeof it.regionId !== 'string' || !regionIds.has(it.regionId)) { issues.push(`${il}.regionId:unresolved`); continue; }
      const rectIss = rectIssues(it.rect, `${il}.rect`);
      issues.push(...rectIss);
      // הכלה בתוך האזור נבדקת רק כששניהם תקינים — אחרת דווח כבר לעיל
      if (it.kind === 'line') {
        const line = it as unknown as LineFragment;
        if (!(BREAK_REASONS as readonly string[]).includes(line.breakReason)) issues.push(`${il}.breakReason`);
        if (!(CONTINUATION_KINDS as readonly string[]).includes(line.continuation)) issues.push(`${il}.continuation`);
        if (line.lastLineAlign !== undefined && line.lastLineAlign !== 'center' && line.lastLineAlign !== 'right') {
          issues.push(`${il}.lastLineAlign`);
        }
        if (!isSafeNonNegativeInt(line.fragmentIndex)) issues.push(`${il}.fragmentIndex`);
        if (!isSafeNonNegativeInt(line.lineIndex)) issues.push(`${il}.lineIndex`);
        if (typeof line.blockId !== 'string' || line.blockId.length === 0) issues.push(`${il}.blockId`);
        if (!isSafeNonNegativeInt(line.baseline)) issues.push(`${il}.baseline`);
        if (rectIss.length === 0) {
          const lr = rectOf(it.rect);
          if ((line.baseline as number) < lr.y || (line.baseline as number) > lr.y + lr.height) {
            issues.push(`${il}.baseline:outside-rect`);
          }
        }
        if (!Array.isArray(line.runs) || line.runs.length === 0) { issues.push(`${il}.runs:empty`); continue; }
        let prevEnd = 0;
        for (let si = 0; si < line.runs.length; si++) {
          const sv = line.runs[si] as unknown as Record<string, unknown>;
          const sl = `${il}.runs[${si}]`;
          if (!isPlainObject(sv) || sv.kind !== 'run') { issues.push(`${sl}:not-a-run`); continue; }
          if (typeof sv.id !== 'string' || !ID_RE.test(sv.id)) issues.push(`${sl}.id`);
          if (!isSafeNonNegativeInt(sv.startLu)) { issues.push(`${sl}.startLu`); continue; }
          // שלב 47 (M5): רוחב 0 חוקי לריצת רווחים עוקבים בסוף קו — הרווחים
          // מחוץ לרוחב הקו (מודל שלב 41) ומקבלים קידום אפס; האטומים נשמרים
          // (אין מחיקה). כל ריצה אחרת חייבת רוחב חיובי.
          if (!isSafeNonNegativeInt(sv.widthLu) || (sv.widthLu as number) < 0
            || ((sv.widthLu as number) === 0 && !isAllZeroAdvanceRun(sv))) issues.push(`${sl}.widthLu`);
          if (typeof sv.text !== 'string' || sv.text.length === 0) issues.push(`${sl}.text`);
          if (typeof sv.requestHash !== 'string' || !HEX64_RE.test(sv.requestHash)) issues.push(`${sl}.requestHash`);
          if (sv.direction !== 'rtl' && sv.direction !== 'ltr') issues.push(`${sl}.direction`);
          if (!isSafePositiveInt(sv.fontSizeLu)) issues.push(`${sl}.fontSizeLu`);
          if (!Array.isArray(sv.atomIds) || sv.atomIds.length === 0) issues.push(`${sl}.atomIds:empty`);
          if (!Array.isArray(sv.glyphs) || sv.glyphs.length === 0) issues.push(`${sl}.glyphs:empty`);
          if (isSafeNonNegativeInt(sv.widthLu)) {
            // חפיפה בין ריצות — פסול מבני; גלישה מרוחב הקו (overflow) אינה נבדקת
            // כאן: המנוע חייב להוציא IR גם כשיש גלישה — הביקורת הגיאומטרית (שלב 38)
            // היא שמדווחת אותה כ-HIGH (§8.2: אין לחתוך מילה; החירום נרשם בפנקס).
            if ((sv.startLu as number) < prevEnd) issues.push(`${sl}.startLu:overlap`);
            prevEnd = (sv.startLu as number) + (sv.widthLu as number);
          }
        }
        if (!Array.isArray(line.sourceSpans)) issues.push(`${il}.sourceSpans:not-an-array`);
      } else if (it.kind === 'note-marker') {
        const mk = it as unknown as PositionedNoteMarker;
        if (typeof mk.noteId !== 'string' || mk.noteId.length === 0) issues.push(`${il}.noteId`);
        if (typeof mk.label !== 'string' || mk.label.length === 0) issues.push(`${il}.label`);
        if (typeof mk.superscript !== 'boolean') issues.push(`${il}.superscript`);
        if (!isSafeNonNegativeInt(mk.baseline)) issues.push(`${il}.baseline`);
      } else if (it.kind === 'anchor') {
        const an = it as unknown as PositionedAnchor;
        if (typeof an.anchorId !== 'string' || an.anchorId.length === 0) issues.push(`${il}.anchorId`);
      } else if (it.kind === 'rule') {
        const ru = it as unknown as PositionedRule;
        if (ru.ruleKind !== 'separator' && ru.ruleKind !== 'ornament') issues.push(`${il}.ruleKind`);
        if (ru.weightLu !== undefined && !isSafePositiveInt(ru.weightLu)) issues.push(`${il}.weightLu`);
      } else if (it.kind === 'ornament') {
        const or_ = it as unknown as PositionedOrnament;
        if (typeof or_.assetId !== 'string' || or_.assetId.length === 0) issues.push(`${il}.assetId`);
        if (typeof or_.assetSha256 !== 'string' || !HEX64_RE.test(or_.assetSha256)) issues.push(`${il}.assetSha256`);
      } else {
        issues.push(`${il}.kind`);
      }
      // הכלה מבנית של הפריט בתוך האזור — תופסת באגים של המנוע מוקדם (שלב 31);
      // הביקורת הגאומטרית (שלב 38) בודקת אף עומק יותר על אותו IR.
      if (rectIss.length === 0) {
        const regionRect = regionRects.get(it.regionId as string);
        if (regionRect !== undefined && !rectContains(regionRect, rectOf(it.rect))) {
          issues.push(`${il}.rect:outside-region`);
        }
      }
    }
  }

  // ── עוגנים ──
  const anchorIds = new Set<string>();
  for (let ai = 0; ai < d.anchors.length; ai++) {
    const av = d.anchors[ai];
    if (!isPlainObject(av)) { issues.push(`anchors[${ai}]:not-an-object`); continue; }
    const a = av as Record<string, unknown>;
    const al = `anchors[${ai}]`;
    if (typeof a.anchorId !== 'string' || a.anchorId.length === 0) { issues.push(`${al}.anchorId`); continue; }
    if (anchorIds.has(a.anchorId)) { issues.push(`${al}.anchorId:duplicate`); continue; }
    anchorIds.add(a.anchorId as string);
    if (typeof a.pageId !== 'string' || !pageIds.has(a.pageId)) issues.push(`${al}.pageId:unresolved`);
    if (typeof a.regionId !== 'string' || !regionIds.has(a.regionId)) issues.push(`${al}.regionId:unresolved`);
    if (a.itemId !== undefined && (typeof a.itemId !== 'string' || !itemIds.has(a.itemId))) {
      issues.push(`${al}.itemId:unresolved`);
    }
  }

  // ── טרנספורמציות ──
  for (let ti = 0; ti < d.transformations.length; ti++) {
    if (!isTransformRecord(d.transformations[ti])) issues.push(`transformations[${ti}]`);
  }
  return issues;
}

// ─────────────────────────── יצירה והקפאה ───────────────────────────

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value as Record<string, unknown>)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/**
 * יצירת LayoutDocument מאומת וקפוא — הדרך היחידה לבנות מסמך IR תקין
 * (המנוע קורא לה בסוף ריצה; parse משתמש בה).
 */
export function createLayoutDocument(input: unknown): LayoutDocument {
  const issues = layoutDocumentIssues(input);
  if (issues.length > 0) {
    throw new LayoutApiError('errors.layoutir.INVALID_DOCUMENT', { issues: issues.slice(0, 25).join('; ') }, `IR שגוי: ${issues.length} בעיות`);
  }
  return deepFreeze(input) as LayoutDocument;
}

export function isLayoutDocument(value: unknown): value is LayoutDocument {
  return layoutDocumentIssues(value).length === 0;
}
