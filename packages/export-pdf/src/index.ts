/**
 * @tora/export-pdf — ייצוא PDF מבוסס-גליפים מה־Layout IR (ADR-009; §15.4).
 *
 * שלב 89 (פרק י"א): "PDF נבנה מאותם glyph items וגאומטריה, לא מצילום
 * DOM". הגליפים, הקידום (כולל הצדקה) והמיקום — מה־IR בלבד; הגופן
 * המוטמע הוא ה-sfnt שממנו המנוע מדד (‎sfntSha256‎ במרשם נועל "אותם
 * bytes"), מוקטן (subsetting) לגליפים שצוירו; ‎ToUnicode‎ נבנה מ-cmap
 * הפוך — חילוץ טקסט אמיתי.
 *
 * דטרמיניזם: אותו IR + אותם גופנים ⇒ ביט-ביט אותם bytes. אין תאריך;
 * אין דחיסה (ADR-009); מספרים בפורמט קבוע.
 */
import type { LayoutDocument } from '@tora/layout-api';
import { sha256Bytes } from '@tora/layout-api';
import { parseSfnt, buildSubset, type ParsedSfnt } from './sfnt.js';
import { buildToUnicode } from './tou.js';
import { drawPage, contentStreamOf, ptOf, remapGids, type PageItem } from './draw.js';
import { PdfWriter, pdfNum, type PdfRef } from './pdf-writer.js';

export const PACKAGE_NAME = '@tora/export-pdf' as const;
export const EXPORT_PDF_VERSION = 'export-pdf@0.1.0' as const;

export class ExportPdfError extends Error {
  constructor(readonly code: string, readonly params: Readonly<Record<string, string | number>> = {}) {
    super(`errors.export-pdf.${code} ${JSON.stringify(params)}`);
    this.name = 'ExportPdfError';
  }
}

/** גופן לייצוא — ה-sfnt ששימש למדידה (WOFF2 נפרק כבר; אותם bytes). */
export interface ExportPdfFont {
  readonly fontId: string;
  readonly sfntBytes: Uint8Array;
}

export interface ExportPdfResult {
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly pages: number;
  /** מספר הגליפים שצוירו (כולל סמנים וריצות נגזרות). */
  readonly glyphsDrawn: number;
  /** גודל ה-subset של הגופן הראשון (גליפים, כולל notdef). */
  readonly subsetGlyphs: number;
}

interface FontPlan {
  readonly fontId: string;
  readonly sourceBytes: Uint8Array;
  readonly parsed: ParsedSfnt;
  subsetBytes: Uint8Array | null;
  gidMap: ReadonlyMap<number, number> | null; // מקורי → חדש
  usedOriginal: Set<number>;
  touBytes: Uint8Array | null;
}

/**
 * exportPdf — טהור: אותם קלטים ⇒ אותם bytes. שתי פאזות:
 *   1) איסוף: פריסת כל העמודים (גליפים; cmap לריצות נגזרות ולסמנים).
 *   2) בנייה: subset + ToUnicode + עמודים + זרמי תוכן + xref.
 */
export function exportPdf(layout: LayoutDocument, fonts: readonly ExportPdfFont[]): ExportPdfResult {
  if (fonts.length === 0) throw new ExportPdfError('FONTS_EMPTY');
  const plans: FontPlan[] = fonts.map((f) => ({
    fontId: f.fontId,
    sourceBytes: f.sfntBytes,
    parsed: parseSfnt(f.sfntBytes),
    subsetBytes: null,
    gidMap: null,
    usedOriginal: new Set<number>([0]),
    touBytes: null,
  }));
  const planByFontId = new Map(plans.map((p) => [p.fontId, p]));

  // ── פאזה 1: איסוף גליפים + פריסה ──
  const perPage: Array<ReturnType<typeof drawPage>> = [];
  let glyphsDrawn = 0;
  const markerPlan = plans[0] as FontPlan; // v0: גופן יחיד לכל השימושים
  for (const page of layout.pages) {
    const items = drawPage(page, markerPlan.parsed, markerPlan.fontId);
    for (const it of items) {
      const runs = it.kind === 'line' ? it.runs : [it.draw];
      for (const rd of runs) {
        const plan = planByFontId.get(rd.fontId);
        if (plan === undefined) throw new ExportPdfError('FONT_NOT_PROVIDED', { fontId: rd.fontId });
        for (const g of rd.glyphs) plan.usedOriginal.add(g.gid);
        glyphsDrawn += rd.glyphs.length;
      }
    }
    perPage.push(items);
  }

  // ── subset + ToUnicode (cmap הפוך) לכל גופן; מיפוי ל-gids החדשים ──
  for (const plan of plans) {
    const subset = buildSubset(plan.parsed, plan.sourceBytes, [...plan.usedOriginal]);
    plan.subsetBytes = subset.bytes;
    plan.gidMap = subset.gidMap;
    // ToUnicode: טקסט החילוץ לפי cmap הפוך — ממופה ל-gid החדש של ה-subset
    // (הסדר החדש הוא שה-PDF מצייר; CIDToGIDMap /Identity).
    const byOrig = new Map<number, string>();
    for (let cp = 0; cp <= 0xffff; cp += 1) {
      const gid = plan.parsed.gidOfCodePoint(cp);
      if (gid === 0 || !plan.usedOriginal.has(gid)) continue;
      if (byOrig.has(gid)) continue;
      byOrig.set(gid, String.fromCharCode(cp));
    }
    const missing: number[] = [];
    for (const gid of plan.usedOriginal) {
      if (gid !== 0 && !byOrig.has(gid)) missing.push(gid);
    }
    if (missing.length > 0) {
      throw new ExportPdfError('GLYPH_NOT_IN_CMAP', { fontId: plan.fontId, count: missing.length, first: (missing[0] as number) });
    }
    if (!byOrig.has(0)) byOrig.set(0, ' ');
    const byNew = new Map<number, string>();
    for (const [orig, text] of byOrig) {
      const newGid = (plan.gidMap as ReadonlyMap<number, number>).get(orig);
      if (newGid !== undefined) byNew.set(newGid, text);
    }
    plan.touBytes = buildToUnicode([...byNew].sort((a, b) => a[0] - b[0]).map(([gid, text]) => ({ gid, text })));
  }

  // הפלט מצייר מעתה את gids של ה-subset (הגופן המוטמע הוא ה-subset).
  const firstMap = (plans[0] as FontPlan).gidMap as ReadonlyMap<number, number>;
  for (let pi = 0; pi < perPage.length; pi += 1) {
    perPage[pi] = remapGids(perPage[pi] as readonly PageItem[], (orig) => firstMap.get(orig) ?? 0);
  }

  // ── פאזה 2: כתיבת הקובץ ──
  const w = new PdfWriter();
  const info = w.reserve();
  w.write(info, `/Producer (${EXPORT_PDF_VERSION})`);
  const catalog = w.reserve();
  const pagesObj = w.reserve();
  const fontRefs = plans.map(() => w.reserve());
  const descRefs = plans.map(() => w.reserve());
  const fdRefs = plans.map(() => w.reserve());
  const fileRefs = plans.map(() => w.reserve());
  const touRefs = plans.map(() => w.reserve());
  const fontResourceNames = plans.map((_, i) => `/F${i + 1}`);

  plans.forEach((plan, i) => {
    const gidMap = plan.gidMap as ReadonlyMap<number, number>;
    const newOf = new Map<number, number>(); // הפוך: חדש → מקורי
    for (const [orig, newGid] of gidMap) newOf.set(newGid, orig);
    const nGlyphs = gidMap.size;
    const dw = plan.parsed.advanceOf(newOf.get(0) ?? 0);
    const wPairs: string[] = [];
    for (let newGid = 0; newGid < nGlyphs; newGid += 1) {
      wPairs.push(`${newGid} ${plan.parsed.advanceOf(newOf.get(newGid) ?? 0)}`);
    }
    const name = `TT-${plan.fontId.replace(/[^A-Za-z0-9.-]+/g, '-').slice(0, 60) || 'Font'}`;
    const asc = plan.parsed.ascent;
    const desc = plan.parsed.descent;
    const bb = plan.parsed.bbox;
    w.write(fontRefs[i] as { num: number }, `/Type /Font /Subtype /Type0 /BaseFont /${name} /Encoding /Identity-H /DescendantFonts ${(descRefs[i] as { num: number }).num} 0 R /ToUnicode ${(touRefs[i] as { num: number }).num} 0 R`);
    w.write(descRefs[i] as { num: number }, `/Type /Font /Subtype /CIDFontType2 /BaseFont /${name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${(fdRefs[i] as { num: number }).num} 0 R /DW ${dw} /W [${wPairs.join(' ')}] /CIDToGIDMap /Identity`);
    w.write(fdRefs[i] as { num: number }, `/Type /FontDescriptor /FontName /${name} /Flags 4 /FontBBox [${bb.join(' ')}] /ItalicAngle 0 /Ascent ${asc} /Descent ${desc} /CapHeight ${asc} /StemV 80 /FontFile2 ${(fileRefs[i] as { num: number}).num} 0 R`);
    w.write(fileRefs[i] as { num: number }, '', { data: plan.subsetBytes as Uint8Array, extra: `/Length1 ${(plan.subsetBytes as Uint8Array).length}` });
    w.write(touRefs[i] as { num: number }, '', { data: plan.touBytes as Uint8Array });
  });

  // ── שלב 90: סימניות, קישורים הדדיים ו-page boxes מה-IR ──
  // (א) מיפויי עזר מה-IR: שורת-TOC ⇒ שורת-כותרת (אטום היעד); סמן ⇒
  //     שורת גוף ההערה (blockId note:<noteId>). יעד חסר ⇒ הקישור אינו
  //     נוצר (אין קישור שבור — כל קישור שנוצר תקין; §15.4#4).
  interface LinePos { pageIndex: number; rect: { x: number; y: number; w: number; h: number }; baseline: number }
  const linePos = new Map<unknown, LinePos>();
  const lineByAtom = new Map<string, unknown>();
  const lineByBlockId = new Map<string, unknown>();
  const noteBodyByNoteId = new Map<string, unknown>();
  const tocLines: Array<{ pos: LinePos; targetAtomId: string; title: string }> = [];
  const markerPos: Array<{ noteId: string; pos: LinePos }> = [];
  layout.pages.forEach((page, pi) => {
    for (const it of page.items) {
      if (it.kind === 'line') {
        const pos: LinePos = { pageIndex: pi, rect: { x: it.rect.x as number, y: it.rect.y as number, w: it.rect.width as number, h: it.rect.height as number }, baseline: it.baseline as number };
        linePos.set(it, pos);
        const b = String(it.blockId);
        if (b.startsWith('note:')) noteBodyByNoteId.set(b.slice(5), it);
        if (b.startsWith('toc:entry:')) {
          tocLines.push({ pos, targetAtomId: b.slice('toc:entry:'.length), title: it.runs.map((r) => r.text).join(' ').trim() });
        }
        if (!lineByBlockId.has(b)) lineByBlockId.set(b, it);
        for (const r of it.runs) for (const a of r.atomIds) if (!lineByAtom.has(a)) lineByAtom.set(a, it);
      } else if (it.kind === 'note-marker') {
        markerPos.push({ noteId: it.noteId, pos: { pageIndex: pi, rect: { x: it.rect.x as number, y: it.rect.y as number, w: it.rect.width as number, h: it.rect.height as number }, baseline: it.baseline as number } });
      }
    }
  });
  const pagePt = (idx: number): { w: number; h: number } => ({ w: ptOf(layout.pages[idx]?.size.width as number ?? 0), h: ptOf(layout.pages[idx]?.size.height as number ?? 0) });
  const rectPt = (idx: number, r: { x: number; y: number; w: number; h: number }): [number, number, number, number] => {
    const { h } = pagePt(idx);
    return [ptOf(r.x), h - ptOf(r.y + r.h), ptOf(r.x + r.w), h - ptOf(r.y)];
  };
  const destPt = (idx: number, lp: LinePos): [number, number] => {
    const { h } = pagePt(idx);
    return [ptOf(lp.rect.x), h - ptOf(lp.baseline)];
  };

  // (ב) קישורים הדדיים: TOC⇄כותרת; סמן⇒גוף; גוף⇒סמן.
  interface LinkPlan { pageIndex: number; rect: [number, number, number, number]; destPage: number; dest: [number, number] }
  const links: LinkPlan[] = [];
  for (const t of tocLines) {
    // יעד ה-TOC הוא מזהה הבלוק של שורת הכותרת (ה-atom המלא של
    // הסימן); הפרוץ ב-blockId ואז באטום.
    const to = lineByBlockId.get(t.targetAtomId) ?? lineByAtom.get(t.targetAtomId);
    const toPos = to === undefined ? undefined : linePos.get(to);
    if (toPos !== undefined) {
      links.push({ pageIndex: t.pos.pageIndex, rect: rectPt(t.pos.pageIndex, t.pos.rect), destPage: toPos.pageIndex, dest: destPt(toPos.pageIndex, toPos) });
      links.push({ pageIndex: toPos.pageIndex, rect: rectPt(toPos.pageIndex, toPos.rect), destPage: t.pos.pageIndex, dest: destPt(t.pos.pageIndex, t.pos) });
    }
  }
  for (const m of markerPos) {
    const body = noteBodyByNoteId.get(m.noteId);
    const bodyPos = body === undefined ? undefined : linePos.get(body);
    if (bodyPos !== undefined) {
      links.push({ pageIndex: m.pos.pageIndex, rect: rectPt(m.pos.pageIndex, m.pos.rect), destPage: bodyPos.pageIndex, dest: destPt(bodyPos.pageIndex, bodyPos) });
      links.push({ pageIndex: bodyPos.pageIndex, rect: rectPt(bodyPos.pageIndex, bodyPos.rect), destPage: m.pos.pageIndex, dest: destPt(m.pos.pageIndex, m.pos) });
    }
  }
  const linksByPage = new Map<number, LinkPlan[]>();
  for (const l of links) {
    const arr = linksByPage.get(l.pageIndex) ?? [];
    arr.push(l);
    linksByPage.set(l.pageIndex, arr);
  }
  // סימניות משורות ה-TOC (כותרת + עמוד היעד בפועל).
  const bookmarks: Array<{ title: string; destPage: number; dest: [number, number] }> = [];
  for (const t of tocLines) {
    const to = lineByBlockId.get(t.targetAtomId) ?? lineByAtom.get(t.targetAtomId);
    const toPos = to === undefined ? undefined : linePos.get(to);
    if (toPos !== undefined && t.title.length > 0) bookmarks.push({ title: t.title, destPage: toPos.pageIndex, dest: destPt(toPos.pageIndex, toPos) });
  }

  // (ג) הקצאת refs בסדר קבוע: pages, contents, annots (לפי עמוד), outlines.
  const pageRefs = layout.pages.map(() => w.reserve());
  const contentRefs = layout.pages.map(() => w.reserve());
  const annotRefsByPage: Array<Array<PdfRef>> = layout.pages.map(() => []);
  for (let pi = 0; pi < layout.pages.length; pi += 1) {
    for (const _l of linksByPage.get(pi) ?? []) {
      void _l;
      annotRefsByPage[pi]?.push(w.reserve());
    }
  }
  const outlinesRef = w.reserve();
  const outlineItemRefs = bookmarks.map(() => w.reserve());
  const fontDict = plans.map((_, i) => `${fontResourceNames[i]} ${(fontRefs[i] as { num: number }).num} 0 R`).join(' ');
  // תיבות עמוד (§15.2#5): גודל העמוד מה-IR; אין מפתחות bleed במרשם ההגדרות
  // (מלאי החובה, נספח ג) ⇒ CropBox === MediaBox (מפורש; תיעוד ב-ADR-009).
  layout.pages.forEach((page, pi) => {
    const mediaBox = `0 0 ${pdfNum(ptOf(page.size.width as number))} ${pdfNum(ptOf(page.size.height as number))}`;
    const annotsStr = (annotRefsByPage[pi]?.length ?? 0) > 0
      ? ` /Annots [${(annotRefsByPage[pi] ?? []).map((r) => `${r.num} 0 R`).join(' ')}]`
      : '';
    w.write(pageRefs[pi] as { num: number }, `/Type /Page /Parent ${pagesObj.num} 0 R /MediaBox [${mediaBox}] /CropBox [${mediaBox}]${annotsStr} /Resources << /Font << ${fontDict} >> >> /Contents ${(contentRefs[pi] as { num: number }).num} 0 R`);
  });
  // כתיבת אובייקטי הקישורים בסדר ההקצאה.
  layout.pages.forEach((page, pi) => {
    void page;
    (linksByPage.get(pi) ?? []).forEach((l, li) => {
      const ref = (annotRefsByPage[pi] ?? [])[li] as PdfRef;
      w.write(ref, `/Type /Annot /Subtype /Link /Rect [${l.rect.map(pdfNum).join(' ')}] /Border [0 0 0] /Dest [${(pageRefs[l.destPage] as { num: number }).num} 0 R /XYZ ${pdfNum(l.dest[0])} ${pdfNum(l.dest[1])} null]`);
    });
  });
  // סימניות: שרשרת Prev/Next + דף היעד; כותרת ב-UTF-16BE hex.
  const hexUtf16 = (t: string): string => {
    let out = '';
    for (const ch of t) out += (ch.codePointAt(0) as number).toString(16).padStart(4, '0');
    return out;
  };
  outlineItemRefs.forEach((ref, bi) => {
    const b = bookmarks[bi] as { title: string; destPage: number; dest: [number, number] };
    const prev = bi > 0 ? (outlineItemRefs[bi - 1] as PdfRef).num : null;
    const next = bi + 1 < outlineItemRefs.length ? (outlineItemRefs[bi + 1] as PdfRef).num : null;
    w.write(ref, `/Title <${hexUtf16(b.title)}> /Parent ${outlinesRef.num} 0 R${prev !== null ? ` /Prev ${prev} 0 R` : ''}${next !== null ? ` /Next ${next} 0 R` : ''} /Dest [${(pageRefs[b.destPage] as { num: number }).num} 0 R /XYZ ${pdfNum(b.dest[0])} ${pdfNum(b.dest[1])} null]`);
  });
  w.write(outlinesRef, outlineItemRefs.length > 0
    ? `/Type /Outlines /First ${(outlineItemRefs[0] as PdfRef).num} 0 R /Last ${(outlineItemRefs[outlineItemRefs.length - 1] as PdfRef).num} 0 R /Count ${outlineItemRefs.length}`
    : '/Type /Outlines /Count 0');
  w.write(pagesObj, `/Type /Pages /Count ${layout.pages.length} /Kids [${pageRefs.map((r) => `${r.num} 0 R`).join(' ')}]`);
  w.write(catalog, `/Type /Catalog /Pages ${pagesObj.num} 0 R /Outlines ${outlinesRef.num} 0 R${outlineItemRefs.length > 0 ? ' /PageMode /UseOutlines' : ''}`);
  perPage.forEach((items, pi) => {
    // v0: כל הציור ב-F1 (גופן יחיד) — זהה להיטל ה-HTML/מנוע (§6.4).
    const text = contentStreamOf(items, 'F1');
    w.write(contentRefs[pi] as { num: number }, '', { data: new TextEncoder().encode(text) });
  });

  const bytes = w.finish(catalog, info);
  return {
    bytes,
    sha256: sha256Bytes(bytes),
    pages: layout.pages.length,
    glyphsDrawn,
    subsetGlyphs: (plans[0]?.gidMap as Map<number, number> | undefined)?.size ?? 0,
  };
}

export { parseSfnt, buildSubset, buildToUnicode, drawPage, contentStreamOf, PdfWriter, pdfNum, ptOf };
