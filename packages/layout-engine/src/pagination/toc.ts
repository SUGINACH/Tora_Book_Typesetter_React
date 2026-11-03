/**
 * toc.ts — זרימת תוכן העניינים כתוכן מעומד ומדוד (שלב 70; אפיון §11.1; M8).
 *
 * "TOC הוא LayoutDocument pages רגילים עם regions מדודים; לא עמוד HTML
 * יחיד ללא גבול גובה" (§11.1): שורות ה-TOC — קווים מדודים (גובהן מסמני
 * המדידה; הטקסט עצמו נמדד בשכבת המדידה בחיווט) — זורמות על עמודי toc
 * בטורים כמו הגוף: **טור ימין (0) מתמלא לפני שמאל (1) ב-RTL** (§14.2).
 * כל קו אטום; עמוד נפתח כשהקו אינו נכנס לטור הנוכחי.
 *
 * הזרימה מחזירה mappingHash — אות המשוב לנקודת השבת החוץ (שלב 71):
 * שינוי בעמוד של ערך TOC יחיד משנה את החתימה. אין pageEstimate —
 * ערכי העמוד של הערכים מגיעים מה-AnchorTable (המדיניות בונה אותם).
 */
import { asLu, canonicalJson, sha256Hex, type LayoutUnit } from '@tora/layout-api';

/** שורת TOC אחת — מזהה הערך (= העוגן) וגובה הקו המדוד. */
export interface TocLine {
  /** מזהה הערך — targetId של העוגן ב-AnchorTable (הכותרת). */
  readonly entryId: string;
  readonly heightLu: LayoutUnit;
}

/** הגדרות הזרימה — גאומטריית עמודי ה-toc מהתבנית. */
export interface TocFlowOptions {
  /** העמוד הפיזי הראשון של ה-TOC (1-based; front matter — לפני הגוף). */
  readonly startPhysicalPage: number;
  /** גובה טור בעמודי ה-toc (מהתבנית; LU). */
  readonly columnHeightLu: LayoutUnit;
  /** מספר טורי ה-TOC (כמו התבנית: 1 או 2). */
  readonly columns: 1 | 2;
}

/** הצבת שורת TOC אחת. */
export interface TocPlacement {
  readonly entryId: string;
  /** העמוד הפיזי (1-based). */
  readonly physicalPage: number;
  /** הטור — 0=ימין (מתמלא ראשון ב-RTL), 1=שמאל. */
  readonly columnIndex: 0 | 1;
  /** מיקום הקו בזרימה (0-based, לפי סדר הערכים). */
  readonly lineIndex: number;
}

export interface TocFlowResult {
  /** סך עמודי ה-TOC. */
  readonly pages: number;
  readonly placements: readonly TocPlacement[];
  readonly firstPhysicalPage: number;
  /** חתימה קנונית של entryId ⇒ עמוד — אות המשוב לנקודת השבת (§11.1). */
  readonly mappingHash: string;
}

/** אימות שורת TOC — רשימת בעיות (ריקה = תקינה). */
export function tocLineIssues(line: unknown): string[] {
  const v = line as TocLine | null;
  if (typeof v !== 'object' || v === null) return ['not-an-object'];
  const issues: string[] = [];
  if (typeof v.entryId !== 'string' || v.entryId.length === 0) issues.push('entryId');
  if (typeof v.heightLu !== 'number' || !Number.isSafeInteger(v.heightLu) || v.heightLu <= 0) issues.push('heightLu');
  return issues;
}

/**
 * זרימת שורות ה-TOC על עמודי toc: טור ימין מתמלא לפני שמאל (RTL), קו אטום,
 * עמוד חדש כשהקו אינו נכנס. דטרמיניסטית — אותן שורות ואותן הגדרות ⇒ אותן
 * הצבות ואותו mappingHash, תמיד.
 */
export function layoutTocFlow(lines: readonly TocLine[], options: TocFlowOptions): TocFlowResult {
  const issues: string[] = [];
  for (const l of lines) issues.push(...tocLineIssues(l).map((i) => `${l.entryId}:${i}`));
  if (issues.length > 0) {
    throw new Error(`toc-flow: שורות TOC שגויות — ${issues.slice(0, 3).join('; ')}`);
  }
  if (!Number.isSafeInteger(options.startPhysicalPage) || options.startPhysicalPage < 1) {
    throw new Error('toc-flow: startPhysicalPage חייב שלם ≥ 1');
  }
  if (typeof options.columnHeightLu !== 'number' || !Number.isSafeInteger(options.columnHeightLu) || options.columnHeightLu <= 0) {
    throw new Error('toc-flow: columnHeightLu חייב LU חיובי');
  }
  if (options.columns !== 1 && options.columns !== 2) {
    throw new Error('toc-flow: columns חייב 1 או 2');
  }
  const placements: TocPlacement[] = [];
  let page = options.startPhysicalPage;
  let column: 0 | 1 = 0;
  let used = 0;
  let lineIndex = 0;
  for (const line of lines) {
    const h = line.heightLu as number;
    if (used + h > options.columnHeightLu && used > 0) {
      // הקו אינו נכנס לטור הנוכחי — עמוד/טור הבא
      if (options.columns === 2 && column === 0) {
        column = 1;
      } else {
        page += 1;
        column = 0;
      }
      used = 0;
    }
    placements.push({ entryId: line.entryId, physicalPage: page, columnIndex: column, lineIndex });
    used += h;
    lineIndex += 1;
  }
  const pages = page - options.startPhysicalPage + 1;
  return Object.freeze({
    pages,
    placements: Object.freeze(placements),
    firstPhysicalPage: options.startPhysicalPage,
    mappingHash: sha256Hex(canonicalJson({
      v: 1,
      kind: 'toc-flow',
      start: options.startPhysicalPage,
      columns: options.columns,
      lines: placements.map((p) => ({ id: p.entryId, page: p.physicalPage, col: p.columnIndex })),
    } as unknown as Record<string, unknown>)),
  });
}

/** גובה ה-TOC הכולל ב-LU (לחישוב גודל ראשוני בנקודת השבת; §11.1). */
export function tocTotalHeightLu(lines: readonly TocLine[]): LayoutUnit {
  let sum = 0;
  for (const l of lines) sum += l.heightLu as number;
  return asLu(sum);
}
