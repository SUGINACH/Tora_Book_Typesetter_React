/**
 * compose-v0.ts — הרכבת מסמך release מעל תוצאת v0 (שלב 74; אפיון §11, §17.4;
 * תכנית שלב 74; M8).
 *
 * מה נבנה כאן מעל הצינור הקיים (typeset-v0):
 *   1. **עמוד שער ראשי** (show-main-shaar) — תיבת כותרת הספר (שם הספר,
 *      תת-כותרת) בעמוד main-shaar; שערים אינם ממוספרים (§11.1).
 *   2. **עמודי תוכן עניינים** (enable-general-toc / enable-detailed-toc) —
 *      הערכים מהעוגנים בפועל (tocEntriesOf ← AnchorTable; אין pageEstimate),
 *      הזרימה מדודה (layoutTocFlow — טור ימין לפני שמאל, §14.2), ומספר
 *      העמודים מיוצב ב**נקודת השבת החוץ** (runOuterFixedPoint, ADR-011).
 *   3. **עמוד שער אחורי** (show-back-shaar) — סיום הספר; לא ממוספר.
 *   4. הפוליו והעוגנים מחושבים מחדש על רצף העמודים המורכב; layoutHash של
 *      ה-IR הסופי בגיבוב הקנוני הזורם (שלב 73).
 *
 * טקסט שורות ה-TOC והשער הוא טקסט נגזר (כפילות מכוונת של כותרות המקור);
 * ריצותיו אינן נושאות מזהי אטומים — כיסוי האטומים של הביקורת נשאר על תוכן
 * המקור בלבד (ה-TOC נבדק בשכבת הקישורים — LINK_PAGE_MISMATCH).
 *
 * דטרמיניזטי לחלוטין: אותם קלטים ⇒ אותו רצף עמודים ואותו hash, תמיד.
 */
import {
  asLu,
  buildAnchorTable,
  type AnchorRecord,
  type AnchorTable,
  canonicalJson,
  type ContentDocument,
  type LayoutDocument,
  type LayoutPage,
  type LayoutRegion,
  type LayoutUnit,
  layoutHash,
  type LineFragment,
  type PlacedItem,
  type PositionedRun,
  sha256Hex,
  type TypesetRequest,
  type TypesetSuccess,
} from '@tora/layout-api';
import { LayoutEngineError } from '../errors.js';
import { typeset } from './typeset-v0.js';
import { readV0Settings, type V0Settings, v0LineHeight } from './v0-settings.js';
import { runOuterFixedPoint } from '../pagination/fixed-point.js';
import { layoutTocFlow, type TocLine } from '../pagination/toc.js';

/** מקורות ה-policy מוזרקים כפונקציות טהורות — layout-engine אינו תלוי
 * ב-policy-torah (גבולות תלות, ADR-002). */
export interface ComposeTocSource {
  /** ערכי TOC מהעוגנים (tocEntriesOf של policy-torah). */
  readonly entriesOf: (doc: ContentDocument, anchors: AnchorTable) => {
    readonly entries: readonly {
      readonly targetId: string;
      readonly level: number;
      readonly title: string;
      readonly folio: { readonly logical: number; readonly printed: string | null };
    }[];
    readonly issues: readonly string[];
  };
  /** תווית פוליו לעמוד (folioLabelOf). */
  readonly folioLabelOf: (physicalPage: number, pageKind: string) => { readonly logical: number; readonly printed: string | null };
}

export interface ComposeOptions {
  readonly toc: ComposeTocSource;
  readonly fixedPointMaxIterations?: number;
}

interface ComposeFlags {
  readonly mainShaar: boolean;
  readonly backShaar: boolean;
  readonly toc: boolean;
}

function flagsOf(request: TypesetRequest): ComposeFlags {
  const values = (request.settings as { readonly values?: Readonly<Record<string, unknown>> }).values ?? {};
  const bool = (k: string): boolean => values[k] === true;
  return Object.freeze({
    mainShaar: bool('show-main-shaar'),
    backShaar: bool('show-back-shaar'),
    toc: bool('enable-general-toc') || bool('enable-detailed-toc'),
  });
}

/** עוגני המקור מתוצאת v0 עם היסט פיזי (עמודי החזית שנוספו לפני הגוף).
 * זיהוי הכותרות לפי מפת בלוקי המסמך (blockId ⇒ role) — מזהי השורות של v0
 * הם מזהי בלוקים קנוניים (node:v1|…), לא תגיות תפקיד. */
function anchorRecordsOf(pages: readonly LayoutPage[], offset: number, headingIds: ReadonlySet<string>, noteIds: ReadonlySet<string>): readonly AnchorRecord[] {
  const records: AnchorRecord[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    const physical = page.physicalIndex + offset;
    for (const item of page.items) {
      if (item.kind !== 'line') continue;
      const line = item as unknown as LineFragment;
      const b = line.blockId as string;
      if (headingIds.has(b) && !seen.has(b)) {
        seen.add(b);
        records.push({ targetId: b, kind: 'heading', pageKind: page.kind, physicalPage: physical });
      } else if (b.startsWith('note:')) {
        const noteId = b.slice('note:'.length);
        if (noteIds.has(noteId) && !seen.has(noteId)) {
          seen.add(noteId);
          records.push({ targetId: noteId, kind: 'note', pageKind: page.kind, physicalPage: physical });
        }
      }
    }
  }
  return records;
}

/** מפת תפקידי הבלוקים מהמסמך — כותרות וזהי הערות (מזהי בלוקים קנוניים). */
function blockRolesOf(doc: ContentDocument): { readonly headingIds: ReadonlySet<string>; readonly noteIds: ReadonlySet<string> } {
  const headingIds = new Set<string>();
  const noteIds = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { for (const v of value) visit(v); return; }
    if (value === null || typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;
    if (obj.role === 'heading' && typeof obj.id === 'string') headingIds.add(obj.id);
    if (typeof obj.blockId === 'string' && (obj.blockId as string).startsWith('note:')) noteIds.add((obj.blockId as string).slice('note:'.length));
    for (const v of Object.values(obj)) visit(v);
  };
  visit((doc as unknown as { parts: unknown }).parts);
  return { headingIds, noteIds };
}

/** רוחב משוער לטקסט נגזר — קבוע ושמרני (ריצות ה-TOC/שער אינן נמדדות
 * בשכבה זו; הרוחב מוגבל לרוחב הטור/התיבה כך שלעולם אין גלישה). */
const DERIVED_CHAR_LU = 32000;

interface DerivedRunInput {
  readonly id: string;
  readonly text: string;
  readonly widthLu: number;
  readonly font: TypesetRequest['assets']['fonts'][number]['font'];
  readonly fontSizeLu: LayoutUnit;
  readonly startLu: number;
}

function derivedRun(input: DerivedRunInput): PositionedRun {
  return Object.freeze({
    kind: 'run',
    id: input.id,
    font: input.font,
    fontSizeLu: input.fontSizeLu,
    direction: 'rtl',
    startLu: asLu(input.startLu),
    widthLu: asLu(input.widthLu),
    text: input.text,
    glyphs: Object.freeze([]) as unknown as PositionedRun['glyphs'],
    atomIds: Object.freeze([]) as unknown as PositionedRun['atomIds'],
    requestHash: sha256Hex(canonicalJson({
      v: 1, kind: 'derived-run', text: input.text, fontSizeLu: input.fontSizeLu,
    } as unknown as Record<string, unknown>)),
  });
}

/** בניית עמוד TOC — שתי עמודות (ימין 0 מתמלא ראשון ב-RTL, §14.2). */
function buildTocPage(
  physical: number,
  lines: readonly { readonly title: string; readonly folio: { readonly logical: number; readonly printed: string | null }; readonly targetId: string; readonly columnIndex: 0 | 1; readonly lineIndex: number }[],
  v0: V0Settings,
  font: TypesetRequest['assets']['fonts'][number]['font'],
): LayoutPage {
  const g = v0.geometry;
  const pageId = `page:${physical}`;
  const colH = ((g.contentBottom as number) - (g.contentTop as number));
  const colW = g.columnWidth as number;
  const regions: LayoutRegion[] = [
    Object.freeze({ id: `${pageId}:toc:0`, kind: 'body-column', columnIndex: 0, rect: { x: asLu((g.mainX as number) + colW + (g.columnGap as number)), y: g.contentTop, width: g.columnWidth, height: asLu(colH) } }),
    Object.freeze({ id: `${pageId}:toc:1`, kind: 'body-column', columnIndex: 1, rect: { x: g.mainX, y: g.contentTop, width: g.columnWidth, height: asLu(colH) } }),
  ];
  const lineHeight = v0LineHeight(v0) as number;
  const items: PlacedItem[] = [];
  const byColumn = new Map<0 | 1, typeof lines>();
  for (const l of lines) {
    const arr = [...(byColumn.get(l.columnIndex) ?? []), l];
    byColumn.set(l.columnIndex, arr);
  }
  for (const [col, colLines] of byColumn) {
    const region = regions[col]!;
    let y = g.contentTop as number;
    for (const l of colLines) {
      const gap = 120000;
      const folioText = l.folio.printed;
      const folioW = folioText === null ? 0 : Math.min(folioText.length * DERIVED_CHAR_LU, 1000000);
      const titleAvail = Math.max(100000, colW - folioW - gap);
      const titleW = Math.min(l.title.length * DERIVED_CHAR_LU, titleAvail);
      const id = `toc:${physical}:${col}:${l.lineIndex}`;
      const runs: PositionedRun[] = [
        derivedRun({ id: `${id}:title`, text: l.title, widthLu: titleW, font, fontSizeLu: v0.bodyFontSizeLu, startLu: colW - titleW }),
      ];
      if (folioText !== null) {
        runs.push(derivedRun({ id: `${id}:folio`, text: folioText, widthLu: folioW, font, fontSizeLu: v0.bodyFontSizeLu, startLu: 0 }));
      }
      items.push(Object.freeze({
        kind: 'line',
        id,
        blockId: `toc:entry:${l.targetId}`,
        fragmentIndex: 0,
        lineIndex: l.lineIndex,
        regionId: region.id,
        rect: { x: region.rect.x, y: asLu(y), width: region.rect.width, height: asLu(lineHeight) },
        baseline: asLu(y + Math.floor(lineHeight * 0.8)),
        runs: Object.freeze(runs),
        sourceSpans: Object.freeze([]),
        breakReason: 'paragraph-end',
        continuation: 'whole',
      }) as unknown as PlacedItem);
      y += lineHeight;
    }
  }
  return Object.freeze({
    id: pageId,
    physicalIndex: physical,
    parity: physical % 2 === 1 ? 'recto' : 'verso',
    kind: 'toc',
    size: { width: g.pageWidth, height: g.pageHeight },
    regions: Object.freeze(regions),
    items: Object.freeze(items),
  });
}

/** עמוד שער (main/back) — תיבה מרכזית עם שורות כותרת; לא ממוספר. */
function buildShaarPage(
  physical: number,
  kind: 'main-shaar' | 'back-shaar',
  titles: readonly string[],
  v0: V0Settings,
  font: TypesetRequest['assets']['fonts'][number]['font'],
): LayoutPage {
  const g = v0.geometry;
  const pageId = `page:${physical}`;
  const boxW = Math.floor((g.columnWidth as number) * 2 + (g.columnGap as number));
  const contentH = ((g.contentBottom as number) - (g.contentTop as number));
  const boxH = Math.floor(contentH * 0.5);
  const boxX = g.mainX as number;
  const boxY = Math.floor((g.contentTop as number) + (contentH - boxH) / 2);
  const lineHeight = Math.floor((v0LineHeight(v0) as number) * 2);
  const items: PlacedItem[] = [];
  let y = boxY + Math.floor(boxH / 2) - Math.floor((titles.length * lineHeight) / 2);
  titles.forEach((title, i) => {
    const w = Math.min(title.length * DERIVED_CHAR_LU, boxW - 200000);
    const id = `${pageId}:shaar:${i}`;
    items.push(Object.freeze({
      kind: 'line',
      id,
      blockId: `shaar:${kind}:${i}`,
      fragmentIndex: 0,
      lineIndex: i,
      regionId: `${pageId}:box`,
      rect: { x: asLu(boxX + Math.floor((boxW - w) / 2)), y: asLu(y), width: asLu(w), height: asLu(lineHeight) },
      baseline: asLu(y + Math.floor(lineHeight * 0.8)),
      runs: Object.freeze([
        derivedRun({ id: `${id}:t`, text: title, widthLu: w, font, fontSizeLu: asLu(Math.floor((v0.bodyFontSizeLu as number) * 2)), startLu: 0 }),
      ]),
      sourceSpans: Object.freeze([]),
      breakReason: 'paragraph-end',
      continuation: 'whole',
    }) as unknown as PlacedItem);
    y += lineHeight;
  });
  return Object.freeze({
    id: pageId,
    physicalIndex: physical,
    parity: physical % 2 === 1 ? 'recto' : 'verso',
    kind,
    size: { width: g.pageWidth, height: g.pageHeight },
    regions: Object.freeze([Object.freeze({ id: `${pageId}:box`, kind: 'custom-box', rect: { x: asLu(boxX), y: asLu(boxY), width: asLu(boxW), height: asLu(boxH) } })]),
    items: Object.freeze(items),
  });
}

/** הרכבת מסמך release מעל תוצאת v0. */
export function composeDocumentRelease(
  request: TypesetRequest,
  provider: Parameters<typeof typeset>[1],
  options: ComposeOptions,
): TypesetSuccess {
  const inner = typeset(request, provider, { policyId: 'torah-v1' });
  const flags = flagsOf(request);
  // בלי דגלי הרכבה — התוצאה כמו שהיא (תואם-לאחור מלא; אין סיבה לגעת).
  if (!flags.mainShaar && !flags.backShaar && !flags.toc) {
    return inner;
  }
  const v0 = readV0Settings(request.settings as Parameters<typeof readV0Settings>[0]);
  const bodyFont = request.assets.fonts.find((f) => f.usage === 'body')?.font;
  if (bodyFont === undefined) {
    throw new LayoutEngineError('errors.engine.SETTING_INVALID', { key: 'assets.fonts[body]', reason: 'missing' }, 'גופן גוף חסר להרכבת release');
  }
  const doc = request.document as unknown as ContentDocument;
  const { headingIds, noteIds } = blockRolesOf(doc);
  const columnHeightLu = asLu(((v0.geometry.contentBottom as number) - (v0.geometry.contentTop as number)));

  // ── נקודת השבת החוץ (ADR-011; שלב 71): מספר עמודי ה-TOC מזיז את הגוף ←
  // העוגנים ← ערכי ה-TOC ← מספר העמודים. צעד טהור; תקציב קשיח; אי-התייצבות ⇒
  // כשל מפורש (שער M8: "ריצה לא מתייצבת נכשלת מפורשות").
  interface FpState { readonly tocPages: number }
  const mainShaarOffset = flags.mainShaar ? 1 : 0;
  const runTocFlow = (tocPages: number) => {
    const anchors = buildAnchorTable(anchorRecordsOf(inner.layout.pages, mainShaarOffset + tocPages, headingIds, noteIds));
    const { entries, issues } = options.toc.entriesOf(doc, anchors);
    if (entries.length === 0 && issues.length > 0) {
      throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'compose-toc', reason: issues[0] ?? 'no-entries' }, 'ערכי ה-TOC ריקים');
    }
    const lines: readonly TocLine[] = entries.map((e) => ({ entryId: e.targetId, heightLu: v0LineHeight(v0) }));
    const flow = layoutTocFlow(lines, {
      startPhysicalPage: mainShaarOffset + 1,
      columnHeightLu,
      columns: 2,
    });
    return { anchors, entries, flow };
  };
  const step = (state: FpState): { readonly state: FpState; readonly feedback: Readonly<Record<string, string>> } => {
    const { anchors, flow } = runTocFlow(state.tocPages);
    return {
      state: { tocPages: flow.pages },
      feedback: {
        'endnote-mapping': sha256Hex(canonicalJson({ v: 1, kind: 'compose', endnotes: inner.layout.pages.filter((p) => p.kind === 'notes').length } as unknown as Record<string, unknown>)),
        'anchor-mapping': sha256Hex(canonicalJson({ v: 1, kind: 'compose', anchors: anchors.records.map((r) => [r.targetId, r.physicalPage]) } as unknown as Record<string, unknown>)),
        'toc-mapping': flow.mappingHash,
      },
    };
  };

  const pages: LayoutPage[] = [];
  let tocPages: LayoutPage[] = [];

  if (flags.toc) {
    const fp = runOuterFixedPoint<FpState>({ tocPages: 1 }, step, {
      maxIterations: options.fixedPointMaxIterations ?? 8,
    });
    if (!fp.converged) {
      throw new LayoutEngineError('errors.engine.TOC_FIXED_POINT_NOT_REACHED', {
        iterations: fp.report.iterations, reason: fp.report.reason ?? 'oscillation',
      }, 'הרכבת ה-TOC לא התייצבה בתקציב');
    }
    const { entries, flow } = runTocFlow(fp.state.tocPages);
    const byPage = new Map<number, { title: string; folio: { readonly logical: number; readonly printed: string | null }; targetId: string; columnIndex: 0 | 1; lineIndex: number }[]>();
    flow.placements.forEach((p, i) => {
      const entry = entries[i];
      if (entry === undefined) return;
      const arr = [...(byPage.get(p.physicalPage) ?? []), {
        title: entry.title, folio: entry.folio, targetId: entry.targetId,
        columnIndex: p.columnIndex, lineIndex: p.lineIndex,
      }];
      byPage.set(p.physicalPage, arr);
    });
    tocPages = [...byPage.keys()].sort((a, b) => a - b).map((phys) => buildTocPage(phys, byPage.get(phys) ?? [], v0, bodyFont));
  }

  // ── הרכבת הרצף: [main-shaar?] + [TOC…] + body/notes (היסט) + [back-shaar?] ──
  const bookTitle = bookTitleOf(doc);
  if (flags.mainShaar) {
    const titles = [bookTitle, subTitleOf(doc)].filter((t): t is string => t !== null);
    pages.push(buildShaarPage(1, 'main-shaar', titles.length > 0 ? titles : ['—'], v0, bodyFont));
  }
  pages.push(...tocPages);
  const offset = pages.length;
  for (const page of inner.layout.pages) {
    const physical = page.physicalIndex + offset;
    const pageId = `page:${physical}`;
    const from = page.physicalIndex;
    const remap = (id: string): string => id.replace(`page:${from}`, `page:${physical}`);
    const folio = options.toc.folioLabelOf(physical, page.kind);
    const items = page.items.map((item) => {
      if (item.kind === 'line') {
        const line = item as unknown as LineFragment;
        return Object.freeze({ ...line, regionId: remap(line.regionId) });
      }
      if (item.kind === 'anchor') {
        const a = item as unknown as { readonly id: string; readonly pageId: string };
        return Object.freeze({ ...a, id: remap(a.id), pageId });
      }
      if (item.kind === 'note-marker') {
        const m = item as unknown as { readonly id: string; readonly regionId: string };
        return Object.freeze({ ...m, id: remap(m.id), regionId: remap(m.regionId) });
      }
      return item;
    });
    pages.push(Object.freeze({
      ...page,
      id: pageId,
      physicalIndex: physical,
      printedFolio: folio.printed ?? undefined,
      regions: Object.freeze(page.regions.map((r) => Object.freeze({ ...r, id: remap(r.id) }))),
      items: Object.freeze(items) as readonly PlacedItem[],
    }));
  }
  if (flags.backShaar) {
    pages.push(buildShaarPage(pages.length + 1, 'back-shaar', [`סוף — ${bookTitle}`], v0, bodyFont));
  }

  // ── פוליו לעמודי ה-TOC (השערים אינם ממוספרים; §11.1) ──
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    if (p.kind === 'main-shaar' || p.kind === 'back-shaar') continue;
    if (p.kind === 'toc' && p.printedFolio === undefined) {
      const folio = options.toc.folioLabelOf(i + 1, p.kind);
      pages[i] = Object.freeze({ ...p, printedFolio: folio.printed ?? undefined });
    }
  }

  const composed: LayoutDocument = Object.freeze({
    ...inner.layout,
    pages: Object.freeze(pages),
  });
  const lh = layoutHash(composed);
  return Object.freeze({
    layout: composed,
    manifest: Object.freeze({ ...inner.manifest, layoutHash: lh }),
    ...(inner.ledger !== undefined ? { ledger: inner.ledger } : {}),
  });
}

function bookTitleOf(doc: ContentDocument): string {
  const md = (doc as unknown as { readonly metadata?: readonly { key: string; value: string }[] }).metadata ?? [];
  for (const m of md) if (m.key === 'שם הספר') return m.value;
  const first = doc.parts[0];
  if (first !== undefined && first.title !== undefined && first.title.length > 0) return first.title;
  return 'ספר';
}

function subTitleOf(doc: ContentDocument): string | null {
  const md = (doc as unknown as { readonly metadata?: readonly { key: string; value: string }[] }).metadata ?? [];
  for (const m of md) if (m.key.includes('תת') || m.key.includes('כותרת משנה')) return m.value;
  return null;
}
