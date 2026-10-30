/**
 * spans.ts — SourceSpan ומזהים ממותגים (שלב 14 בתכנית 100 השלבים).
 *
 * אסמכתא: אפיון §6.2 · תכנית שלב 14.
 * מטרה: שכל תו ידע מאין הגיע — הבסיס לכל ביקורת תוכן עתידית.
 *
 * כללי יסוד:
 *   1. טווח UTF-16 חצי־פתוח [start, end) — end אינו כלול.
 *      ריק (start === end) חוקי; שלילי אסור; שלמים בטוחים בלבד.
 *   2. המזהים NodeId/AtomId/AnchorId הם מחרוזות ממותגות — לא ניתן
 *      להחליף סוג אחד בשני בטעות. הגזירה הדטרמיניסטית של AtomId
 *      תיבנה בשלב 15; כאן רק הטיפוסים והאכיפה.
 *   3. אין מצב נסתר ואין מונים גלובליים — כל פונקציה טהורה.
 */

import { ContentModelError } from './errors.js';

// ─────────────────────────── מזהים ממותגים ───────────────────────────

/** מזהה צומת במסמך (ContentBlock) — מחרוזת ממותגת. */
export type NodeId = string & { readonly __brand: 'NodeId' };
/** מזהה אטום טקסט — מחרוזת ממותגת. */
export type AtomId = string & { readonly __brand: 'AtomId' };
/** מזהה עוגן (מטרה להפניות/הערות) — מחרוזת ממותגת. */
export type AnchorId = string & { readonly __brand: 'AnchorId' };

export type BrandedId = NodeId | AtomId | AnchorId;
export type IdKind = 'NodeId' | 'AtomId' | 'AnchorId';

/**
 * אימות מזהה: מחרוזת לא ריקה, בלי רווחים מובילים/עוקבים, בלי תווי
 * בקרה (U+0000–U+001F, U+007F), ובאורך סביר (≤ 512 תווים).
 * הגזירה הדטרמיניסטית עצמה — בשלב 15; כאן רק תקינות הערך.
 */
export function isValidIdValue(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512) return false;
  if (value !== value.trim()) return false;
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f) return false;
  }
  return true;
}

function makeBrandedId(kind: IdKind, value: string): BrandedId {
  if (!isValidIdValue(value)) {
    throw new ContentModelError('errors.span.INVALID_ID', { kind, value: String(value) }, `ערך מזהה לא חוקי ל-${kind}`);
  }
  return value as BrandedId;
}

/** בונה NodeId ממותג ממחרוזת מאומתת. */
export function makeNodeId(value: string): NodeId {
  return makeBrandedId('NodeId', value) as NodeId;
}
/** בונה AtomId ממותג ממחרוזת מאומתת. */
export function makeAtomId(value: string): AtomId {
  return makeBrandedId('AtomId', value) as AtomId;
}
/** בונה AnchorId ממותג ממחרוזת מאומתת. */
export function makeAnchorId(value: string): AnchorId {
  return makeBrandedId('AnchorId', value) as AnchorId;
}

// ─────────────────────────── זרמי תוכן ───────────────────────────

/** זרם תוכן במסמך המקור. */
export type ContentStream = 'body' | 'footnote' | 'endnote' | 'sidenote' | 'metadata';

/** כל הזרמים החוקיים — סדר קבוע לסריאליזציה קנונית. */
export const CONTENT_STREAMS: readonly ContentStream[] = Object.freeze([
  'body',
  'footnote',
  'endnote',
  'sidenote',
  'metadata',
] as const);

/** בדיקת טיפוס: האם הערך זרם תוכן חוקי. */
export function isContentStream(value: unknown): value is ContentStream {
  return typeof value === 'string' && (CONTENT_STREAMS as readonly string[]).includes(value);
}

/** מיקום סדרתי של זרם (למיון קנוני דטרמיניסטי); ‎-1‎ אם לא חוקי. */
export function contentStreamRank(stream: ContentStream): number {
  return (CONTENT_STREAMS as readonly string[]).indexOf(stream);
}

// ─────────────────────────── SourceSpan ───────────────────────────

/**
 * פרוסת מקור: מאין הגיע התוכן.
 * טווח UTF-16 חצי־פתוח ‎[startUtf16, endUtf16)‎ — כלומר span על תו
 * בודד במיקום i הוא ‎{start: i, end: i+1}‎, ו־span ריק הוא ‎start === end‎.
 */
export interface SourceSpan {
  readonly documentId: string;
  readonly stream: ContentStream;
  readonly startUtf16: number;
  readonly endUtf16: number;
  /** נתיב מקור אופציונלי — למשל `word/document.xml` + נתיב run. */
  readonly importerPath?: string;
}

function isSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/**
 * בונה SourceSpan מאומת — אכיפה בזמן יצירה:
 * documentId מחרוזת לא ריקה; stream חוקי; הגבולות שלמים בטוחים,
 * אי־שליליים, ו־start ≤ end (ריק חוקי); importerPath אם קיים — לא ריק.
 */
export function makeSourceSpan(
  documentId: string,
  stream: ContentStream,
  startUtf16: number,
  endUtf16: number,
  importerPath?: string,
): SourceSpan {
  if (typeof documentId !== 'string' || documentId.length === 0 || documentId.length > 512) {
    throw new ContentModelError(
      'errors.span.INVALID_DOCUMENT_ID',
      { documentId: typeof documentId === 'string' ? documentId : String(documentId) },
      'documentId חייב להיות מחרוזת לא ריקה עד 512 תווים',
    );
  }
  if (!isContentStream(stream)) {
    throw new ContentModelError(
      'errors.span.INVALID_STREAM',
      { stream: String(stream) },
      `stream חייב להיות אחד מ: ${CONTENT_STREAMS.join(', ')}`,
    );
  }
  if (!isSafeInteger(startUtf16)) {
    throw new ContentModelError(
      'errors.span.NON_INTEGER_OFFSET',
      { value: String(startUtf16), field: 'startUtf16' },
      'startUtf16 חייב להיות שלם בטוח',
    );
  }
  if (!isSafeInteger(endUtf16)) {
    throw new ContentModelError(
      'errors.span.NON_INTEGER_OFFSET',
      { value: String(endUtf16), field: 'endUtf16' },
      'endUtf16 חייב להיות שלם בטוח',
    );
  }
  if (startUtf16 < 0 || endUtf16 < startUtf16) {
    throw new ContentModelError(
      'errors.span.INVALID_RANGE',
      { startUtf16: String(startUtf16), endUtf16: String(endUtf16) },
      'נדרש 0 ≤ start ≤ end (טווח חצי־פתוח)',
    );
  }
  if (importerPath !== undefined && (typeof importerPath !== 'string' || importerPath.length === 0)) {
    throw new ContentModelError(
      'errors.span.INVALID_IMPORTER_PATH',
      { importerPath: String(importerPath) },
      'importerPath אם קיים — מחרוזת לא ריקה',
    );
  }
  return Object.freeze(
    importerPath === undefined
      ? { documentId, stream, startUtf16, endUtf16 }
      : { documentId, stream, startUtf16, endUtf16, importerPath },
  );
}

/** בדיקה מבנית: האם הערך SourceSpan תקין (לא זורקת). */
export function isSourceSpan(value: unknown): value is SourceSpan {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.documentId === 'string' &&
    v.documentId.length > 0 &&
    isContentStream(v.stream) &&
    isSafeInteger(v.startUtf16) &&
    isSafeInteger(v.endUtf16) &&
    (v.startUtf16 as number) >= 0 &&
    (v.endUtf16 as number) >= (v.startUtf16 as number) &&
    (v.importerPath === undefined || (typeof v.importerPath === 'string' && v.importerPath.length > 0))
  );
}

/** אורך הפרוסה בתווי UTF-16 ‎(end − start ≥ 0)‎. */
export function spanLength(span: SourceSpan): number {
  return span.endUtf16 - span.startUtf16;
}

/** פרוסה ריקה? ‎(start === end)‎ — חוקית, משמשת למשל לעוגן נקודתי. */
export function isEmptySpan(span: SourceSpan): boolean {
  return span.startUtf16 === span.endUtf16;
}

/** האם שתי הפרוסות באותו מסמך ובאותו זרם. */
export function sameStream(a: SourceSpan, b: SourceSpan): boolean {
  return a.documentId === b.documentId && a.stream === b.stream;
}

/**
 * האם ‎needle‎ כלולה כולה בתוך ‎haystack‎ (אותו מסמך וזרם).
 * פרוסה ריקה בגבול ‎[s, s]‎ נחשבת כלולה (עקרון חצי־פתוח).
 */
export function spanCovers(haystack: SourceSpan, needle: SourceSpan): boolean {
  return (
    sameStream(haystack, needle) &&
    haystack.startUtf16 <= needle.startUtf16 &&
    needle.endUtf16 <= haystack.endUtf16
  );
}

/** האם שתי הפרוסות חופפות (אותו מסמך וזרם; ריקה אינה חופפת כלום). */
export function spansOverlap(a: SourceSpan, b: SourceSpan): boolean {
  if (!sameStream(a, b)) return false;
  return a.startUtf16 < b.endUtf16 && b.startUtf16 < a.endUtf16;
}

/** סדר קנוני דטרמיניסטי בין פרוסות: מסמך ← זרם ← התחלה ← סוף ← importerPath. */
export function compareSpans(a: SourceSpan, b: SourceSpan): number {
  if (a.documentId < b.documentId) return -1;
  if (a.documentId > b.documentId) return 1;
  const ra = contentStreamRank(a.stream);
  const rb = contentStreamRank(b.stream);
  if (ra !== rb) return ra - rb;
  if (a.startUtf16 !== b.startUtf16) return a.startUtf16 - b.startUtf16;
  if (a.endUtf16 !== b.endUtf16) return a.endUtf16 - b.endUtf16;
  const pa = a.importerPath ?? '';
  const pb = b.importerPath ?? '';
  if (pa < pb) return -1;
  if (pa > pb) return 1;
  return 0;
}

/**
 * תת־פרוסה בהיסטים יחסיים ‎[from, to)‎ מתוך ‎span‎ — לפיצול טקסט בפרסר
 * בלי לאבד את המקור. נדרש ‎0 ≤ from ≤ to ≤ spanLength(span)‎.
 * ה־importerPath עובר בירושה.
 */
export function sliceSpan(span: SourceSpan, from: number, to: number): SourceSpan {
  const len = spanLength(span);
  if (
    !isSafeInteger(from) ||
    !isSafeInteger(to) ||
    from < 0 ||
    to < from ||
    to > len
  ) {
    throw new ContentModelError(
      'errors.span.SLICE_OUT_OF_RANGE',
      { from: String(from), to: String(to), length: String(len) },
      'תת־פרוסה מחוץ לטווח האב',
    );
  }
  return makeSourceSpan(
    span.documentId,
    span.stream,
    span.startUtf16 + from,
    span.startUtf16 + to,
    span.importerPath,
  );
}
