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
import { PdfWriter, pdfNum } from './pdf-writer.js';

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

  const pageRefs = layout.pages.map(() => w.reserve());
  const contentRefs = layout.pages.map(() => w.reserve());
  const fontDict = plans.map((_, i) => `${fontResourceNames[i]} ${(fontRefs[i] as { num: number }).num} 0 R`).join(' ');
  layout.pages.forEach((page, pi) => {
    const mediaBox = `0 0 ${pdfNum(ptOf(page.size.width as number))} ${pdfNum(ptOf(page.size.height as number))}`;
    w.write(pageRefs[pi] as { num: number }, `/Type /Page /Parent ${pagesObj.num} 0 R /MediaBox [${mediaBox}] /Resources << /Font << ${fontDict} >> >> /Contents ${(contentRefs[pi] as { num: number }).num} 0 R`);
  });
  w.write(pagesObj, `/Type /Pages /Count ${layout.pages.length} /Kids [${pageRefs.map((r) => `${r.num} 0 R`).join(' ')}]`);
  w.write(catalog, `/Type /Catalog /Pages ${pagesObj.num} 0 R`);
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
