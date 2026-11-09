/**
 * draw.ts — גאומטריית הציור של export-pdf (ADR-009; §15.4).
 *
 * כל הממדים מה־IR בלבד (§15.4: "אין מדידה מחדש דרך ספריית PDF"):
 * ‎LU→pt = lu/65536‎ (ADR-001); ציר y הפוך (PDF מקור למטה-שמאל; ה־IR
 * מקור למעלה-ימין) — ‎y_pdf = H_pt − y_pageTop‎. הגליפים והקידום שלהם
 * מגיעים מה־IR (‎run.glyphs‎ — כולל הצדקת הרווחים שהמנוע אפה ב־advanceLu);
 * ריצות נגזרות (ללא גליפים — TOC/שער) וסמני-הערה ממופים דרך cmap של
 * אותו הגופן (קידום טבעי בגודל הריצה; אין shaping חדש — תיעוד ב-ADR-009).
 *
 * סדר הגליפים: חזותי (שמאל→ימין — פלט HarfBuzz; תואם את run.text
 * ואת הצבה ב-IR). הציור מצטבר מהקצה השמאלי של תיבת הריצה; סכום הקידום
 * מאומת מול ‎widthLu‎ (חריגה > 64 LU ⇒ שגיאה קולנית — אין גאומטריה
 * שקט-שגויה).
 */
import { roundDiv, type LayoutDocument, type PositionedRun } from '@tora/layout-api';
import type { ParsedSfnt } from './sfnt.js';
import { pdfNum } from './pdf-writer.js';

export class DrawError extends Error {
  constructor(readonly code: string, readonly params: Readonly<Record<string, string | number>>) {
    super(`errors.export-pdf.${code} ${JSON.stringify(params)}`);
    this.name = 'DrawError';
  }
}

export interface GlyphDraw {
  /** gid מקורי (לפני מיפוי ה-subset). */
  readonly gid: number;
  /** x/y של ראשית הגליף ב-pt, מקור PDF (y כבר הפוך). */
  readonly xPt: number;
  readonly yPt: number;
}

export interface RunDraw {
  readonly fontId: string;
  readonly fontSizePt: number;
  readonly glyphs: readonly GlyphDraw[];
}

/** pt מ-LU — חלוקה שלמה בטוחה (ADR-001). */
export function ptOf(lu: number): number {
  return lu / 65536;
}

function cmapGidOf(ch: string, sfnt: ParsedSfnt, what: string): number {
  const cp = ch.codePointAt(0) as number;
  const gid = sfnt.gidOfCodePoint(cp);
  if (gid === 0) {
    throw new DrawError('GLYPH_MISSING_FOR_TEXT', { what, cp: `U+${cp.toString(16).padStart(4, '0')}` });
  }
  return gid;
}

function cmapAdvanceLu(gid: number, sfnt: ParsedSfnt, fontSizeLu: number): number {
  // ADR-001: העיגול מרוכז ב-units (roundDiv — חצי-כלפי-∞); זהה מספרית
  // לעיגול הצף שקדם לו (שלמה-בשלמה), ועובר safe-int ומאמת ריכוז-העיגול.
  return roundDiv(sfnt.advanceOf(gid) * fontSizeLu, sfnt.unitsPerEm);
}

/**
 * פריסת ריצה אחת (baseline ב-pt של PDF).
 * ‎startLu‎ של הריצה הוא **יחסית לתיבת הקו** (כמו בהיטל ה-HTML —
 * renderRun תוך ‎.tora-line‎ ב-rect.x; אפיון §6.5) — המיקום האבסולוטי
 * הוא ‎lineX + startLu‎.
 * ריצות נגזרות (glyphs:[] — TOC/שער): הרוחב ב-IR הוא הערכת תווים
 * (‎DERIVED_CHAR_LU = 32000/תו‎, clamped לעמודה) ולא מדידה — אין
 * אימות drift עליהן; הציור מגליפי cmap בקידום טבעי (hmtx) מקצה
 * ההתחלתי של הריצה בתוך הקו.
 */
export function layoutRunAt(run: PositionedRun, sfnt: ParsedSfnt, pageH: number, lineXLu: number, baselineLu: number): RunDraw {
  const yPt = pageH - ptOf(baselineLu);
  const viaCmap = run.glyphs.length === 0;
  const startLu = (run.startLu as number) + lineXLu;
  const widthLu = run.widthLu as number;
  const glyphs: GlyphDraw[] = [];
  let pen = startLu;
  if (viaCmap) {
    for (const ch of run.text) {
      const gid = cmapGidOf(ch, sfnt, `run ${run.id.slice(0, 60)}`);
      const adv = cmapAdvanceLu(gid, sfnt, run.fontSizeLu as number);
      glyphs.push({ gid, xPt: ptOf(pen), yPt });
      pen += adv;
    }
  } else {
    for (const g of run.glyphs) {
      glyphs.push({ gid: g.glyphId, xPt: ptOf(pen + (g.xOffsetLu as number)), yPt });
      pen += (g.advanceLu as number);
    }
    const drift = Math.abs(pen - (startLu + widthLu));
    if (drift > 64) {
      throw new DrawError('RUN_WIDTH_DRIFT', { run: run.id.slice(0, 60), driftLu: drift, widthLu });
    }
  }
  return { fontId: run.font.fontId, fontSizePt: ptOf(run.fontSizeLu as number), glyphs };
}

/** תאימות לאחור — פריסה ללא היסב קו (סמנים; בדיקות ישירות). */
export function layoutRun(run: PositionedRun, sfnt: ParsedSfnt, pageH: number, baselineLu: number): RunDraw {
  return layoutRunAt(run, sfnt, pageH, 0, baselineLu);
}

export type PageItem = { kind: 'line'; runs: readonly RunDraw[] } | { kind: 'marker'; draw: RunDraw };

/**
 * פריסת עמוד שלם — קווים וסמנים בסדר ה־IR (page.items).
 * ‎marker‎ נצייר ltr מהקצה השמאלי של תיבתו (זהה להיטל ה-HTML — renderMarker
 * ‏dir=ltr), בגודל גובה התיבה מה־IR; הקידום מ-hmtx (טבעי).
 */
export function drawPage(page: LayoutDocument['pages'][number], sfnt: ParsedSfnt, markerFontId: string): PageItem[] {
  const pageH = ptOf(page.size.height as number);
  const out: PageItem[] = [];
  for (const item of page.items) {
    if (item.kind === 'line') {
      const runs: RunDraw[] = [];
      for (const r of item.runs) {
        if (r.glyphs.length === 0 && r.text.length === 0) continue;
        runs.push(layoutRunAt(r, sfnt, pageH, item.rect.x as number, item.baseline as number));
      }
      if (runs.length > 0) out.push({ kind: 'line', runs });
    } else if (item.kind === 'note-marker') {
      if (item.label.length === 0) continue;
      const sizeLu = item.rect.height as number;
      const yPt = pageH - ptOf(item.baseline as number);
      const glyphs: GlyphDraw[] = [];
      let pen = item.rect.x as number;
      for (const ch of item.label) {
        const gid = cmapGidOf(ch, sfnt, `marker ${item.noteId}`);
        const adv = cmapAdvanceLu(gid, sfnt, sizeLu);
        glyphs.push({ gid, xPt: ptOf(pen), yPt });
        pen += adv;
      }
      if (glyphs.length > 0) out.push({ kind: 'marker', draw: { fontId: markerFontId, fontSizePt: ptOf(sizeLu), glyphs } });
    }
    // anchors: ריקים — אין ציור (קישורים בשלב 90).
  }
  return out;
}

/** זרם תוכן של עמוד — טקסט גלוי, דטרמיניסטי. */
export function contentStreamOf(items: readonly PageItem[], fontResource: string): string {
  const parts: string[] = [];
  const emit = (rd: RunDraw): void => {
    if (rd.glyphs.length === 0) return;
    parts.push('BT');
    parts.push(`/${fontResource} ${pdfNum(rd.fontSizePt)} Tf`);
    let lastX = rd.glyphs[0]?.xPt ?? 0;
    let lastY = rd.glyphs[0]?.yPt ?? 0;
    for (let i = 0; i < rd.glyphs.length; i += 1) {
      const g = rd.glyphs[i] as GlyphDraw;
      parts.push(i === 0
        ? `${pdfNum(g.xPt)} ${pdfNum(g.yPt)} Td`
        : `${pdfNum(g.xPt - lastX)} ${pdfNum(g.yPt - lastY)} Td`);
      parts.push(`<${(g.gid & 0xffff).toString(16).padStart(4, '0')}> Tj`);
      lastX = g.xPt;
      lastY = g.yPt;
    }
    parts.push('ET');
  };
  for (const it of items) {
    if (it.kind === 'line') for (const rd of it.runs) emit(rd);
    else emit(it.draw);
  }
  return parts.join('\n');
}


/** החלפת ה-gids המקוריים ב-gids של ה-subset (לפני כתיבת התוכן). */
export function remapGids(items: readonly PageItem[], mapOf: (origGid: number) => number): PageItem[] {
  const conv = (rd: RunDraw): RunDraw => ({
    fontId: rd.fontId,
    fontSizePt: rd.fontSizePt,
    glyphs: rd.glyphs.map((g) => ({ gid: mapOf(g.gid), xPt: g.xPt, yPt: g.yPt })),
  });
  return items.map((it) => it.kind === 'line'
    ? { kind: 'line' as const, runs: it.runs.map(conv) }
    : { kind: 'marker' as const, draw: conv(it.draw) });
}
