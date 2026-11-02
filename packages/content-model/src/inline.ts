/**
 * inline.ts — InlineItem: רכיבי התוכן הרצים בתוך בלוק (שלב 16).
 *
 * אסמכתא: אפיון §6.2 (InlineItem) · §3.3 (שימור צנרת הפרסר) · תכנית שלב 16:
 * "text, break, anchor, marker, note reference וכו'".
 *
 * כללי יסוד:
 *   1. חמשת סוגי האפיון (text, note-reference, anchor, explicit-break,
 *      inline-box) נשמרים בדיוק ככתובם; ה־marker נוסף כי התכנית דורשת
 *      אותו מפורשות — והוא הביטוי הקנוני של drop-word, dibbur hamatchil
 *      וסימונים תורניים אחרים בלי sentinel בתוך הטקסט.
 *   2. אין placeholder כמו ‎\u0001FN:id\u0002‎ או ‎\u0001CUSTOM:id\u0002‎
 *      בתוך טקסט שהמנוע מעבד (אפיון §6.2) — הפנייה להערה היא InlineItem
 *      מפורש עם SourceSpan משלה.
 *   3. הכול טהור, קפוא ומאומת בזמן יצירה; אין DOM ואין תלויות.
 */

import { ContentModelError } from './errors.js';
import { isSourceSpan, isValidIdValue, sameStream } from './spans.js';
import type { AnchorId, SourceSpan } from './spans.js';
import { isTextAtom } from './atoms.js';
import type { TextAtom } from './atoms.js';

/** סוג רכיב inline. */
export type InlineItemKind =
  | 'text'
  | 'note-reference'
  | 'anchor'
  | 'explicit-break'
  | 'inline-box'
  | 'marker';

/** כל סוגי הרכיבים החוקיים — סדר קבוע. */
export const INLINE_ITEM_KINDS: readonly InlineItemKind[] = Object.freeze([
  'text', 'note-reference', 'anchor', 'explicit-break', 'inline-box', 'marker',
] as const);

/**
 * רכיב inline לפי אפיון §6.2, בתוספת marker (תכנית שלב 16).
 * רכיבי text נושאים אטומים עם הפרוסות שלהם; שאר הרכיבים נושאים
 * SourceSpan משלהם — כך מיקומם במקור נשמר גם כשהם לא טקסט.
 */
export type InlineItem =
  | { readonly kind: 'text'; readonly atoms: readonly TextAtom[] }
  | { readonly kind: 'note-reference'; readonly noteId: string; readonly source: SourceSpan }
  | { readonly kind: 'anchor'; readonly anchorId: AnchorId; readonly source: SourceSpan }
  | { readonly kind: 'explicit-break'; readonly source: SourceSpan }
  | { readonly kind: 'inline-box'; readonly boxId: string; readonly source: SourceSpan }
  | { readonly kind: 'marker'; readonly markerId: string; readonly source: SourceSpan };

function assertValidSpan(source: SourceSpan, what: string): void {
  if (!isSourceSpan(source)) {
    throw new ContentModelError(
      'errors.inline.NOT_AN_ITEM',
      { reason: `${what}:not-a-span` },
      `${what} דורש SourceSpan תקין`,
    );
  }
}

function assertRegistryId(value: string, what: string): void {
  if (typeof value !== 'string' || !isValidIdValue(value)) {
    throw new ContentModelError(
      'errors.inline.INVALID_ID',
      { which: what, value: typeof value === 'string' ? value : String(value) },
      `${what} חייב מחרוזת זהות חוקית (לא ריקה, בלי תווי בקרה)`,
    );
  }
}

/** רכיב טקסט: רצף אטומים לא ריק, כולם באותו מסמך וזרם. */
export function makeTextItem(atoms: readonly TextAtom[]): InlineItem {
  if (!Array.isArray(atoms) || atoms.length === 0) {
    throw new ContentModelError(
      'errors.inline.EMPTY_TEXT',
      { count: '0' },
      'רכיב טקסט חייב לפחות אטום אחד',
    );
  }
  for (const atom of atoms) {
    if (!isTextAtom(atom)) {
      throw new ContentModelError(
        'errors.inline.ATOM_NOT_VALID',
        { reason: 'not-an-atom' },
        'כל אטום ברכיב טקסט חייב להיות TextAtom תקין (כולל אמיתת גזירה)',
      );
    }
  }
  const first = atoms[0] as TextAtom;
  for (const atom of atoms) {
    if (!sameStream(first.source, atom.source)) {
      throw new ContentModelError(
        'errors.inline.MIXED_STREAMS',
        { reason: `${first.source.documentId}/${first.source.stream}+${atom.source.documentId}/${atom.source.stream}` },
        'כל אטומי רכיב טקסט חייבים להיות באותו מסמך ובאותו זרם',
      );
    }
  }
  return Object.freeze({ kind: 'text', atoms: Object.freeze([...atoms]) });
}

/** הפנייה להערה — הביטוי המפורש לתחליף ה־sentinel הישן (‎\u0001FN:id\u0002‎). */
export function makeNoteReference(noteId: string, source: SourceSpan): InlineItem {
  assertRegistryId(noteId, 'noteId');
  assertValidSpan(source, 'note-reference');
  return Object.freeze({ kind: 'note-reference', noteId, source });
}

/** עוגן — מטרה להפניות, תוכן עניינים וכותרות רצות. */
export function makeAnchorItem(anchorId: string, source: SourceSpan): InlineItem {
  assertRegistryId(anchorId, 'anchorId');
  assertValidSpan(source, 'anchor');
  return Object.freeze({ kind: 'anchor', anchorId: anchorId as AnchorId, source });
}

/** שבירת שורה מפורשת מהמקור. */
export function makeExplicitBreak(source: SourceSpan): InlineItem {
  assertValidSpan(source, 'explicit-break');
  return Object.freeze({ kind: 'explicit-break', source });
}

/** תיבה תוכניתית inline (custom box מוכר מהתוכנה הישנה). */
export function makeInlineBox(boxId: string, source: SourceSpan): InlineItem {
  assertRegistryId(boxId, 'boxId');
  assertValidSpan(source, 'inline-box');
  return Object.freeze({ kind: 'inline-box', boxId, source });
}

/**
 * סמן תורני inline — drop-word, dibbur hamatchil, first-word וכדומה.
 * ה־markerId מפנה לרישום המזהים שייבנה בשלב 17; אין sentinel בטקסט.
 */
export function makeMarker(markerId: string, source: SourceSpan): InlineItem {
  assertRegistryId(markerId, 'markerId');
  assertValidSpan(source, 'marker');
  return Object.freeze({ kind: 'marker', markerId, source });
}

/** בדיקה מבנית (לא זורקת) — לפי סוג הרכיב. */
export function isInlineItem(value: unknown): value is InlineItem {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  switch (v.kind) {
    case 'text': {
      if (!Array.isArray(v.atoms) || v.atoms.length === 0) return false;
      const atoms = v.atoms as unknown[];
      if (!atoms.every((a) => isTextAtom(a))) return false;
      const first = atoms[0] as TextAtom;
      return atoms.every((a) => sameStream(first.source, (a as TextAtom).source));
    }
    case 'note-reference':
      return typeof v.noteId === 'string' && isValidIdValue(v.noteId) && isSourceSpan(v.source);
    case 'anchor':
      return typeof v.anchorId === 'string' && isValidIdValue(v.anchorId) && isSourceSpan(v.source);
    case 'explicit-break':
      return isSourceSpan(v.source);
    case 'inline-box':
      return typeof v.boxId === 'string' && isValidIdValue(v.boxId) && isSourceSpan(v.source);
    case 'marker':
      return typeof v.markerId === 'string' && isValidIdValue(v.markerId) && isSourceSpan(v.source);
    default:
      return false;
  }
}
