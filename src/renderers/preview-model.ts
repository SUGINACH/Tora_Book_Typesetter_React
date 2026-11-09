/**
 * preview-model.ts — היטל טהור IR ← מודל תצוגה (שלב 36; אפיון §13.2).
 *
 * התצוגה היא היטל של ה־IR ולא מקור החלטות: ההמרה חד-כיוונית, טהורה
 * ודטרמיניסטית — אותו IR ⇐ אותו מודל. **CSS logical properties** בלבד
 * (§13.2): המיקומים נגזרים כ-inset-inline-start ביחס לקצה ההתחלתי של
 * המיכל (בעמוד RTL — מימין), כך שהכיוון נגזר מה-DOM ולא מחישוב שמאל/ימין
 * כפול. ההמרה LU→px רציונלית (luToCssPx — projection.ts של layout-api).
 *
 * תיקון שורש 2026-11-09/ב' (מראות תווים באתר החי): המנוע פולט את run.text
 * בסדר אטומים חזותי (שמאל→ימין; placeLineVisually) כאשר תווי כל אטום
 * נשארים לוגיים — הצגת המחרוזת כמות־שהיא (bidi-override) מראה כל מילה
 * (אומת באתר החי במדידת מיקומי תווים: "יורה דעה" נקרא "הרוי העד").
 * ההיטל משחזר את הטקסט הלוגי של הריצה (logicalTextOfRun — פענוח הטווחים
 * המקודדים במזהי האטומים אל מול מקור המסמך) ומציגו בכיוון טבעי — הדפדפן
 * מפעיל את UAX#9 בעצמו (מראוי סוגריים, ספרות ומיזוגים). זהה ביט־ביט
 * ל-logicalTextOfRun של render-html (CLI) — נעול בבדיקות.
 *
 * אין כאן: מדידה, DOM, גישה ל-window, או כל כתיבה חזרה אל ה־IR.
 */
import {
  luToCssPx,
  type LayoutDocument,
  type LayoutPage,
  type LineFragment,
  type PositionedNoteMarker,
  type PositionedRun,
  type PlacedItem,
  type Rect,
} from '@tora/layout-api';

export interface RunViewModel {
  readonly kind: 'run';
  readonly id: string;
  readonly text: string;
  /** טקסט להצגה — כמו text, בסילוק רווחי סוף-הקו המאופסים (U+0020 בלבד) מהריצה השמאלית של הקו. */
  readonly displayText: string;
  readonly direction: 'rtl' | 'ltr';
  /** מיקום ההיסב מהקצה ההתחלתי (inline-start) של תיבת הקו, ב-px. */
  readonly insetInlineStartPx: number;
  readonly inlineSizePx: number;
  readonly fontSizePx: number;
  readonly fontFamily: string;
  /** האם הקו הוצדק לרוחב הטור (breakReason 'fit') — משוחזר בעיגון/מתיחה. */
  readonly justified: boolean;
}

export interface LineViewModel {
  readonly kind: 'line';
  readonly id: string;
  readonly blockId: string;
  readonly regionId: string;
  /** סיבת השבירה — 'fit' ⇔ קו מוצדק (משוחזר במתיחת התצוגה; כמו ב-render-html). */
  readonly breakReason: string;
  readonly insetInlineStartPx: number;
  readonly insetBlockStartPx: number;
  readonly inlineSizePx: number;
  readonly blockSizePx: number;
  readonly runs: readonly RunViewModel[];
}

export interface MarkerViewModel {
  readonly kind: 'note-marker';
  readonly id: string;
  readonly noteId: string;
  readonly label: string;
  readonly insetInlineStartPx: number;
  readonly insetBlockStartPx: number;
  readonly inlineSizePx: number;
  readonly blockSizePx: number;
  /** משפחת הגופן של הסמן (v0: גופן הגוף — נגזר מריצות העמוד). */
  readonly fontFamily?: string;
}

export interface RegionViewModel {
  readonly id: string;
  readonly kind: string;
  readonly columnIndex?: 0 | 1;
  readonly insetInlineStartPx: number;
  readonly insetBlockStartPx: number;
  readonly inlineSizePx: number;
  readonly blockSizePx: number;
}

export interface PageViewModel {
  readonly id: string;
  readonly physicalIndex: number;
  readonly kind: string;
  readonly parity: string;
  readonly folio?: string;
  readonly inlineSizePx: number;
  readonly blockSizePx: number;
  readonly regions: readonly RegionViewModel[];
  readonly lines: readonly LineViewModel[];
  readonly markers: readonly MarkerViewModel[];
}

/** מרחק הקצה ההתחלתי של מלבן מהקצה ההתחלתי של המיכל — ב-LU, בטרם המרה. */
function insetInlineStartLu(containerWidthLu: number, rect: Rect): number {
  return containerWidthLu - rect.x - rect.width;
}

const px = (lu: number): number => luToCssPx(lu as never);

/**
 * משפחת הגופן החזותית של ההיטל — זהה ביט-ביט ל-fontFamilyOf של render-html
 * (CLI): ‏`tora-` + fontId מנוקה. כך האפליקציה וה-preview.html עוגנים לאותה
 * משפחה מאותו fontId, ורישום ה-FontFace ב-ui-runtime מכסה את שניהם.
 * למה לא שם המשפחה מהמניפסט? שמות כמו `גוטמן-רש\"י` מכילים מרכאות ששוברות
 * את מחרוזת ה-CSS בסגנון המוטבע (אותר באתר החי: כל ריצה איבדה את הגופן),
 * והם אינם תואמים להצהרות @font-face הקיימות בכלל. ה-fontId יציב,
 * נטול-תווים-מיוחדים ונעול בתוכן (contentSha256).
 */
export function previewFontFamilyOf(fontId: string): string {
  const ident = fontId.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'font';
  return `tora-${ident}`;
}

/**
 * שחזור טקסט אטום מזההו — מזהי האטומים מקודדים את טווח המקור
 * (‎atom:v1|<docId>|<stream>|<start>+<end>|<origin|src>|<ordinal>‎ — 6 שדות;
 * deriveAtomId ב-content-model; הקידוד אוכף היעדר '|' בשדות). אטום מקור
 * נחתך מהמקור בטווחו; אטום החדרה של איחוי פסקאות הוא רווח בודד
 * (parse.ts — makeTextAtom(' ', …, origin='parser:paragraph-join')).
 * מקור לא מוכר/טווח חורג ⇐ שגיאה קולנית — אין תצוגה שגויה בשקט.
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
 * הטקסט הלוגי של ריצה — זהה ביט־ביט ל-logicalTextOfRun של render-html.
 *
 * ריצת rtl: האטומים ב-run.text ערוכים בסדר חזותי (שמאל→ימין) — היפוך
 * סדר האטומים משחזר את הסדר הלוגי, וכל אטום נחתך מהמקור בטווחו (תווי
 * האטום עצמם לוגיים תמיד). ריצת ltr: חזותי === לוגי (אומת מול כל קורפוס
 * הבדיקה — 196,416 ריצות, 0 חריגות). ריצה נגזרת (ללא אטומים — כותרות
 * תוכן/עמודות): הטקסט לוגי מטבעו (compose-v0 בונה אותו ישירות).
 */
export function logicalTextOfRun(run: PositionedRun, source: string): string {
  if (run.atomIds.length === 0) return run.text;
  if (run.direction === 'ltr') return run.text;
  const parts: string[] = [];
  for (let i = run.atomIds.length - 1; i >= 0; i -= 1) {
    parts.push(atomTextOf(run.atomIds[i] as string, source));
  }
  return parts.join('');
}

/**
 * היטל עמוד בודד — PageView מקבל LayoutPage (§13.2) ומיצג אותו בלבד.
 * המקור נחוץ לשחזור הטקסט הלוגי של הריצות (ראו ראש הקובץ) — תמונת
 * המקור מזמן הריצה עצמה (resultStore.sourceAtRun), לא העורך החי.
 */
export function projectPage(page: LayoutPage, source: string): PageViewModel {
  const pageW = page.size.width as number;
  const regions: RegionViewModel[] = page.regions.map((r) => ({
    id: r.id,
    kind: r.kind,
    ...(r.columnIndex !== undefined ? { columnIndex: r.columnIndex } : {}),
    insetInlineStartPx: px(insetInlineStartLu(pageW, r.rect)),
    insetBlockStartPx: px(r.rect.y),
    inlineSizePx: px(r.rect.width),
    blockSizePx: px(r.rect.height),
  }));
  const lines: LineViewModel[] = [];
  const markers: MarkerViewModel[] = [];
  let markerFontFamily: string | undefined;
  for (const item of page.items as readonly PlacedItem[]) {
    if (item.kind === 'line') {
      lines.push(projectLine(item, pageW, source));
      // v0: כל השימושים באותו גופן הגוף — סמני העמוד עוגנים לגופן הריצות
      // שעל אותו עמוד (עמוד סמנים בלי ריצות כלל — נשאר בברירת המחדל).
      if (markerFontFamily === undefined && item.runs.length > 0) {
        markerFontFamily = previewFontFamilyOf(item.runs[0]!.font.fontId);
      }
    } else if (item.kind === 'note-marker') {
      markers.push(projectMarker(item, pageW, markerFontFamily));
    }
  }
  return {
    id: page.id,
    physicalIndex: page.physicalIndex,
    kind: page.kind,
    parity: page.parity,
    ...(page.printedFolio !== undefined ? { folio: page.printedFolio } : {}),
    inlineSizePx: px(page.size.width),
    blockSizePx: px(page.size.height),
    regions,
    lines,
    markers,
  };
}

function projectLine(line: LineFragment, pageWidthLu: number, source: string): LineViewModel {
  // breakReason 'fit' ⇔ המנוע הצדיק את הקו (dp.ts justificationOf) — ההיטל
  // משחזר את המתיחה שחולקה על הרווחים (תיקון שורש 2026-11-09).
  const justified = line.breakReason === 'fit';
  // הריצות מסודרות חזותית שמאל→ימין; הראשונה נושאת את רווחי סוף-הקו המאופסים
  const runs: RunViewModel[] = line.runs.map((r, i) => projectRun(r, line.rect.width as number, justified, i === 0, source));
  return {
    kind: 'line',
    id: line.id,
    blockId: line.blockId,
    regionId: line.regionId,
    breakReason: line.breakReason,
    insetInlineStartPx: px(insetInlineStartLu(pageWidthLu, line.rect)),
    insetBlockStartPx: px(line.rect.y),
    inlineSizePx: px(line.rect.width),
    blockSizePx: px(line.rect.height),
    runs,
  };
}

/**
 * רווחי סוף-קו מאופסים בהצבה (trailingZero במנוע: קידום 0, מחוץ לרוחב)
 * אך הדפדפן מציג אותם ברוחב טבעי — רוחב רפאים שגורם לגלישה/הזחה
 * שקטה בכל שורה עטופה. הריצות מסודרות חזותית שמאל→ימין (כמו במנוע),
 * ולכן רווחי סוף-הקו נמצאים בראש המחרוזת של הריצה הראשונה (השמאלית)
 * — בכל כיוון: טקסט rtl מגיע בסדר חזותי, ו-ltr זהה לוגית=חזותית.
 * חיתוך U+0020 בלבד (NBSP אינו נחתך — ADR-004, כמו isTrimmableSpaceText).
 */
export function displayTextOfRun(logicalText: string, isLineVisualStart: boolean, direction: 'rtl' | 'ltr'): string {
  if (!isLineVisualStart) return logicalText;
  if (direction === 'rtl') {
    let i = logicalText.length;
    while (i > 0 && logicalText.charCodeAt(i - 1) === 0x20) i -= 1;
    return i === logicalText.length ? logicalText : logicalText.slice(0, i);
  }
  let j = 0;
  while (j < logicalText.length && logicalText.charCodeAt(j) === 0x20) j += 1;
  return j === 0 ? logicalText : logicalText.slice(j);
}

function projectRun(run: PositionedRun, lineWidthLu: number, justified: boolean, isLineVisualStart: boolean, source: string): RunViewModel {
  const logical = logicalTextOfRun(run, source);
  return {
    kind: 'run',
    id: run.id,
    text: logical,
    displayText: displayTextOfRun(logical, isLineVisualStart, run.direction),
    direction: run.direction,
    insetInlineStartPx: px(lineWidthLu - (run.startLu as number) - (run.widthLu as number)),
    inlineSizePx: px(run.widthLu),
    fontSizePx: px(run.fontSizeLu),
    fontFamily: previewFontFamilyOf(run.font.fontId),
    justified,
  };
}

function projectMarker(m: PositionedNoteMarker, pageWidthLu: number, fontFamily?: string): MarkerViewModel {
  // הסמן בקואורדינטות עמוד (כמו שה-IR נושא אותו) — היטל לוגי מהקצה ההתחלתי
  return {
    kind: 'note-marker',
    id: m.id,
    noteId: m.noteId,
    label: m.label,
    insetInlineStartPx: px(insetInlineStartLu(pageWidthLu, m.rect)),
    insetBlockStartPx: px((m.baseline as number) - (m.rect.y as number)),
    inlineSizePx: px(m.rect.width),
    blockSizePx: px(m.rect.height),
    ...(fontFamily !== undefined ? { fontFamily } : {}),
  };
}

/** מזהה יציב ל-source span — לניווט עורך↔פריסה (§13.2; קליק על קו). */
export function spanKey(span: { stream: string; start: number; end: number }): string {
  return `${span.stream}:${span.start}-${span.end}`;
}

/** היטל מסמך שלם — סדר עמודים קבוע; טהור לחלוטין. */
export function projectLayout(layout: LayoutDocument, source: string): readonly PageViewModel[] {
  return layout.pages.map((p) => projectPage(p, source));
}
