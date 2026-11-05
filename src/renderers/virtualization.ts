/**
 * virtualization.ts — הווירטואליזציה הבטוחה של התצוגה (שלב 83; אפיון §13.2,
 * §17.2#5, §17.3#9–10).
 *
 * מסמך ארוך נשאר שמיש בלי לשנות את המנוע או את ה־IR:
 *   1. **תצוגה בלבד** — כל החישוב כאן טהור ודטרמיניסטי על מספרים שנגזרו
 *      מה־IR (גבהי עמודים ב־px מההיטל); אין לבצע layout לעמודים גלויים,
 *      אין מדידת DOM ואין כתיבה חזרה אל ה־IR (§13.2: "virtualization
 *      מותרת בתצוגה בלבד").
 *   2. **הפרמטרים במרחב הלא־מוגדל** — הזום הוא transform של המיכל בלבד
 *      (§13.2); מרחב הגלילה מוכפל בו, ולכן החלון הגלוי במרחב התוכן הוא
 *      ‎(scrollTop − inset)/zoom‎. zoom/DPR אינם משתתפים ב־layoutHash
 *      (§17.2#5) — כאן הם משפיעים רק על *כמה* עמודים מוצגים, לעולם
 *      לא על התוצאה.
 *   3. **נפילה לאחור מתועדת** — סביבה בלי גהות אמיתית (jsdom/הדפסה/
 *      ‎clientHeight‏ ≤ 0) ⇐ ‎null‏ ⇐ הצגה מלאה. אין השערה שקטה על גובל
 *      אפסי (§12.1 ברוח זו): היעדר גהות הוא מצב מפורש.
 *   4. הקריאה ב־DOM (scrollTop/clientHeight) היא באחריות המעטפת
 *      (PreviewArea) — קובץ זה טהור ואינו נוגע ב־DOM, ולכן אותן בדיקות
 *      רצות ב־Node וב־jsdom כאחד.
 */
export const PAGE_GAP_PX = 16;
export const CONTENT_INSET_PX = 16;
export const DEFAULT_OVERSCAN_PAGES = 2;

export interface ViewportInfo {
  readonly scrollTopPx: number;
  readonly viewportHeightPx: number;
}

export interface VisibleRange {
  readonly first: number;
  readonly last: number;
}

export interface RangeOptions {
  readonly zoom?: number;
  readonly overscanPages?: number;
  readonly contentInsetPx?: number;
  readonly gapPx?: number;
}

const positiveInt = (v: number | undefined, fallback: number): number =>
  v !== undefined && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;

/** קריאה מלאה של קווי הפתיחה של העמודים — offsets[i] הוא היכן עמוד i מתחיל. */
export function pageOffsets(heightsPx: readonly number[], gapPx: number = PAGE_GAP_PX): number[] {
  const gap = Number.isFinite(gapPx) && gapPx >= 0 ? gapPx : PAGE_GAP_PX;
  const offsets: number[] = new Array<number>(heightsPx.length);
  let acc = 0;
  for (let i = 0; i < heightsPx.length; i += 1) {
    offsets[i] = acc;
    acc += Math.max(0, Number.isFinite(heightsPx[i]) ? heightsPx[i] : 0) + gap;
  }
  return offsets;
}

/** גובה התוכן הכולל — סכום העמודים והפערים *ביניהם* (אין פער אחרי האחרון). */
export function totalHeightPx(heightsPx: readonly number[], gapPx: number = PAGE_GAP_PX): number {
  if (heightsPx.length === 0) return 0;
  const offsets = pageOffsets(heightsPx, gapPx);
  const lastH = Math.max(0, Number.isFinite(heightsPx[heightsPx.length - 1]) ? heightsPx[heightsPx.length - 1] : 0);
  return offsets[offsets.length - 1] + lastH;
}

/**
 * הטווח הגלוי — עמודים שחותכים את חלון הגלילה (במרחב הלא־מוגדל) ועוד
 * overscan משני הצדדים. ‎null‏ ⇐ הצגה מלאה: אין עמודים, או גהה לא
 * חיובית (jsdom/הדפסה) — נפילה לאחור מתועדת, לא רשימה ריקה בשקט.
 */
export function visiblePageRange(
  heightsPx: readonly number[],
  viewport: ViewportInfo,
  options: RangeOptions = {},
): VisibleRange | null {
  const n = heightsPx.length;
  if (n === 0) return null;
  const { scrollTopPx, viewportHeightPx } = viewport;
  if (!Number.isFinite(scrollTopPx) || !Number.isFinite(viewportHeightPx) || viewportHeightPx <= 0) {
    return null;
  }
  const zoom = options.zoom !== undefined && Number.isFinite(options.zoom) && options.zoom > 0 ? options.zoom : 1;
  const overscan = positiveInt(options.overscanPages, DEFAULT_OVERSCAN_PAGES);
  const inset = positiveInt(options.contentInsetPx, CONTENT_INSET_PX);
  const gapPx = options.gapPx !== undefined && Number.isFinite(options.gapPx) && options.gapPx >= 0 ? options.gapPx : PAGE_GAP_PX;

  // תוכן העמודים מתחיל inset פיקסלים מראש תיבת הגלילה (p-4), והזום הוא
  // scale מהפינה העליונה־התחלתית — נקודת תוכן x נראית ב־scroll = inset + zoom·x.
  const top = Math.max(0, Math.max(0, scrollTopPx) - inset) / zoom;
  const bottom = top + viewportHeightPx / zoom;

  const offsets = pageOffsets(heightsPx, gapPx);
  let first = -1;
  let last = -1;
  for (let i = 0; i < n; i += 1) {
    const h = Math.max(0, Number.isFinite(heightsPx[i]) ? heightsPx[i] : 0);
    const start = offsets[i];
    const end = start + h;
    if (end <= top) continue; // לפני החלון
    if (start >= bottom) break; // אחרי החלון — ההיסטים רק גדלים
    if (first === -1) first = i;
    last = i;
  }
  if (first === -1) return null;
  return {
    first: Math.max(0, first - overscan),
    last: Math.min(n - 1, last + overscan),
  };
}

/** גבהי המרווחים מעל ומתחת לטווח המוצג — הפסים משלימים את הגלילה לגובה האמת. */
export function spacerHeights(
  range: VisibleRange,
  heightsPx: readonly number[],
  gapPx: number = PAGE_GAP_PX,
): { topPx: number; bottomPx: number } {
  const n = heightsPx.length;
  if (n === 0) return { topPx: 0, bottomPx: 0 };
  const first = Math.max(0, Math.min(n - 1, Math.floor(range.first)));
  const last = Math.max(first, Math.min(n - 1, Math.floor(range.last)));
  const offsets = pageOffsets(heightsPx, gapPx);
  const total = totalHeightPx(heightsPx, gapPx);
  const lastH = Math.max(0, Number.isFinite(heightsPx[last]) ? heightsPx[last] : 0);
  return {
    topPx: Math.max(0, offsets[first]),
    bottomPx: Math.max(0, total - (offsets[last] + lastH)),
  };
}
