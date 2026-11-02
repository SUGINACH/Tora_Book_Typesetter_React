/**
 * atoms.ts — TextAtom, גזירת AtomId דטרמיניסטית, פיצול/איחוד וספר טרנספורמציות (שלב 15).
 *
 * אסמכתא: אפיון §6.2 (TextAtom, AtomId) · §6.6 (כיסוי בלי רינדור) · תכנית שלב 15.
 * מטרה: יחידת התוכן הקטנה שממנה נבנה כל ה־IR — עם זהות יציבה הנגזרת
 * מהמקור בלבד, בלי אקראיות, בלי זמן ובלי מונים גלובליים.
 *
 * כללי יסוד:
 *   1. הזהות של אטום היא השלשה (span, ordinal, origin) והיא מקודדת
 *      במזהה `atom:v1|…` בסדר קבוע. אותו מקור ← אותו מזהה, תמיד,
 *      בכל סדר ריצה. זהו מימוש ההערה באפיון: "נגזר מ־node/source
 *      path + ordinal, לא random".
 *   2. אטום מקור (בלי origin) חייב לכסות את הטווח שלו במדויק
 *      (אורך הטקסט בתווי UTF-16 === אורך הפרוסה). אטום החדרה חייב
 *      origin מפורש ("insertion מקבל מקור מפורש").
 *   3. אטום אינו נחתך באמצע surrogate pair או צרור גרפמות —
 *      נאכף בזמן הפיצול (splitAtom) ובבנייה (אין lone surrogates).
 *   4. פיצול/איחוד אינם "נעלמים": כל פעולה מחזירה רשומת
 *      TransformRecord לספר הטרנספורמציות — הזרע של Text Audit v1
 *      (שלב 21). אין שינוי נוסח בשקט.
 *   5. הכול טהור וקפוא; אין מצב נסתר. שפה/כיוון (script/bidiLevel)
 *      ניתנים על ידי הקורא (הפרסר בשלב 17, UAX #9/#14 בשלבים 27–28);
 *      classifyScript הוא המסווג הדטרמיניסטי ברמת התוכן.
 */

import { ContentModelError } from './errors.js';
import {
  compareSpans,
  isSourceSpan,
  isValidIdValue,
  makeAtomId,
  makeSourceSpan,
  sameStream,
  sliceSpan,
  spanLength,
} from './spans.js';
import type { AtomId, ContentStream, SourceSpan } from './spans.js';

// ─────────────────────────── סוגי יסוד ───────────────────────────

/** כתב האטום — לבחירת גופן ולמדיניות; סיווג דטרמיניסטי לפי נקודת הקוד המכריעה. */
export type AtomScript = 'hebrew' | 'latin' | 'number' | 'punctuation' | 'other';

/** כל הכתבים החוקיים — סדר קבוע. */
export const ATOM_SCRIPTS: readonly AtomScript[] = Object.freeze([
  'hebrew', 'latin', 'number', 'punctuation', 'other',
] as const);

/** הזדמנות שבירה לפני האטום — לפי UAX #14 (המדיניות בשלב 27). */
export type BreakBefore = 'forbidden' | 'allowed' | 'required';

/** כל סוגי השבירה החוקיים. */
export const BREAK_BEFORE_KINDS: readonly BreakBefore[] = Object.freeze([
  'forbidden', 'allowed', 'required',
] as const);

/** עומק BiDi מרבי לפי UAX #9 (רמות הטמעה מפורשות עד 125). */
export const MAX_BIDI_LEVEL = 125;

/**
 * יחידת התוכן הקטנה (אפיון §6.2). השדות script/bidiLevel/breakBefore
 * ממלאים את חוזה §6.2; ordinal ו־origin הם הרחבה תואמת (סידור שדות
 * בלבד): הם משמרים את גורמי הזהות על גבי האטום עצמו כדי שכיסוי
 * וביקורת (שלב 21) יוכלו לאמת את הגזירה בלי לפענח את המזהה.
 */
export interface TextAtom {
  /** מזהה יציב — נגזר מ־(source, ordinal, origin) בלבד. */
  readonly id: AtomId;
  /** grapheme cluster או token אטומי; אין lone surrogates ואין תווי בקרה. */
  readonly text: string;
  /** מאין הגיע התוכן. */
  readonly source: SourceSpan;
  readonly script: AtomScript;
  readonly bidiLevel: number;
  readonly breakBefore: BreakBefore;
  /** מספר סידורי בתוך אותה פרוסה (להפרדת אטומים שחולקו אותה פרוסה). */
  readonly ordinal: number;
  /** מקור מפורש לתוכן מוחדר/מוחלף — חובה באטום בעל פרוסה ריקה. */
  readonly origin?: string;
}

// ─────────────────────────── עזרי תווים (טהורים) ───────────────────────────

/**
 * תו משלים (combining mark) — נצמד לבסיס שלפניו. טווחים מפורשים
 * לקורפוס התורני (עברית+ניקוד+טעמים, לטינית, ערבית) וכלליים
 * (variation selectors, combining extended). אין תלות בספריות.
 */
export function isCombiningMark(cp: number): boolean {
  return (
    (cp >= 0x0300 && cp <= 0x036F) || // Combining Diacritical Marks
    (cp >= 0x0591 && cp <= 0x05BD) || // טעמים + ניקוד עברי
    cp === 0x05BF || // רפה
    cp === 0x05C1 || cp === 0x05C2 || // נקודת שין/שין שמאלית
    (cp >= 0x05C4 && cp <= 0x05C5) || // נקודות עליונה/תחתונה
    cp === 0x05C7 || // נקודת מסורה
    (cp >= 0x064B && cp <= 0x065F) || (cp === 0x0670) || // ערבית
    (cp >= 0x06D6 && cp <= 0x06DC) || (cp >= 0x06DF && cp <= 0x06E4) ||
    (cp >= 0x06E7 && cp <= 0x06E8) || (cp >= 0x06EA && cp <= 0x06ED) ||
    (cp >= 0x1AB0 && cp <= 0x1AFF) || (cp >= 0x1DC0 && cp <= 0x1DFF) || // מורחב
    (cp >= 0x20D0 && cp <= 0x20F0) || // סימנים לסמלים
    (cp >= 0xFE00 && cp <= 0xFE0F) || // variation selectors
    (cp >= 0xFE20 && cp <= 0xFE2F) // half marks
  );
}

/** תו בקרה פורמט (BiDi/מצרף בלתי־נראה) — אינו פיסוק לצורך בחירת גופן. */
function isFormatControl(cp: number): boolean {
  return (
    cp === 0x200E || cp === 0x200F || // LRM / RLM
    (cp >= 0x202A && cp <= 0x202E) || // קידודי כיוון מפורשים
    (cp >= 0x2060 && cp <= 0x2064) || // WJ ומפעילים בלתי־נראים
    (cp >= 0x2066 && cp <= 0x2069) // קידודי כיוון מבודדים
  );
}

function scriptOfCodePoint(cp: number): AtomScript {
  if ((cp >= 0x0590 && cp <= 0x05FF) || (cp >= 0xFB1D && cp <= 0xFB4F)) {
    return 'hebrew'; // כולל גרשיים, מקף עברי וצורות הצגה — כתב אחד
  }
  if (cp >= 0x30 && cp <= 0x39) return 'number';
  if (
    (cp >= 0x41 && cp <= 0x5A) || (cp >= 0x61 && cp <= 0x7A) ||
    ((cp >= 0xc0 && cp <= 0x24f) && cp !== 0xd7 && cp !== 0xf7)
  ) {
    return 'latin';
  }
  if (
    (cp >= 0x20 && cp <= 0x2f) || (cp >= 0x3a && cp <= 0x40) ||
    (cp >= 0x5b && cp <= 0x60) || (cp >= 0x7b && cp <= 0x7e) ||
    (cp >= 0xa1 && cp <= 0xbf) || cp === 0xd7 || cp === 0xf7 ||
    (cp >= 0x2000 && cp <= 0x206f && !isFormatControl(cp))
  ) {
    // מפרידים וסימנים (רווח, פיסוק, מקפים, גרשיים לטיניים) — סל אחד
    // לצורך בחירת גופן; תווי בקרה נשארים 'other'.
    return 'punctuation';
  }
  return 'other';
}

/**
 * סיווג כתב דטרמיניסטי של טקסט אטום: נקודת הקוד הראשונה שאינה
 * תו משלים מכריעה (הצרור המוביל קובע — כמו breakBefore באיחוד).
 * טקסט ריק או תווים משלימים בלבד → 'other'.
 */
export function classifyScript(text: string): AtomScript {
  if (typeof text !== 'string' || text.length === 0) return 'other';
  let i = 0;
  while (i < text.length) {
    const cp = text.codePointAt(i);
    if (cp === undefined) return 'other';
    if (!isCombiningMark(cp)) return scriptOfCodePoint(cp);
    i += cp > 0xffff ? 2 : 1;
  }
  return 'other';
}

function hasControlChar(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c <= 0x1f || c === 0x7f || (c >= 0x80 && c <= 0x9f)) return true;
  }
  return false;
}

function hasLoneSurrogate(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c >= 0xdc00 && c <= 0xdfff) {
      const prev = i > 0 ? text.charCodeAt(i - 1) : 0;
      if (!(prev >= 0xd800 && prev <= 0xdbff)) return true;
    } else if (c >= 0xd800 && c <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
    }
  }
  return false;
}

// ─────────────────────────── גזירת AtomId ───────────────────────────

const ATOM_ID_PREFIX = 'atom:v1';
const MAX_ID_LENGTH = 512;

/** קידוד מקטע מזהה: נטרול המפרידים ‎%‎ ו־‎|‎ — קנוני, הפיך וללא התנגשויות. */
function encodeIdSegment(value: string): string {
  return value.replace(/%/g, '%25').replace(/\|/g, '%7C');
}

function isSafeOrdinal(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isValidOrigin(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID_LENGTH) return false;
  return isValidIdValue(value);
}

/**
 * גזירת מזהה אטום דטרמיניסטי:
 * ‎atom:v1|<documentId>|<stream>|<start>+<end>|<origin|src>|<ordinal>‎
 * אותה פרוסה/סידור/מקור ← אותו מזהה, בלי תלות בזמן, באקראיות
 * או בסדר הריצה. מקור (origin) מרחיב את מרחב השמות לאטומים
 * מוחדרים ולאיחודים מוחלפים.
 */
export function deriveAtomId(source: SourceSpan, ordinal = 0, origin?: string): AtomId {
  if (!isSourceSpan(source)) {
    throw new ContentModelError(
      'errors.atom.INVALID_SPAN',
      { reason: 'not-a-span' },
      'deriveAtomId קיבל SourceSpan לא תקין',
    );
  }
  if (!isSafeOrdinal(ordinal)) {
    throw new ContentModelError(
      'errors.atom.INVALID_ORDINAL',
      { value: String(ordinal) },
      'ordinal חייב להיות שלם בטוח ואי־שלילי',
    );
  }
  if (origin !== undefined && !isValidOrigin(origin)) {
    throw new ContentModelError(
      'errors.atom.INVALID_ORIGIN',
      { origin: typeof origin === 'string' ? origin : String(origin) },
      'origin חייב להיות מחרוזת זהות חוקית (לא ריקה, בלי תווי בקרה)',
    );
  }
  const id =
    `${ATOM_ID_PREFIX}|${encodeIdSegment(source.documentId)}|${source.stream}` +
    `|${source.startUtf16}+${source.endUtf16}` +
    `|${origin === undefined ? 'src' : encodeIdSegment(origin)}|${ordinal}`;
  if (id.length > MAX_ID_LENGTH) {
    throw new ContentModelError(
      'errors.atom.ID_DERIVATION_TOO_LONG',
      { length: String(id.length) },
      `המזהה הנגזר חורג מ־${MAX_ID_LENGTH} תווים`,
    );
  }
  return makeAtomId(id);
}

// ─────────────────────────── בניית אטום ───────────────────────────

/** אפשרויות בניית אטום — הכול ערכים סדירים ודטרמיניסטיים. */
export interface MakeTextAtomOptions {
  readonly script?: AtomScript;
  readonly bidiLevel?: number;
  readonly breakBefore?: BreakBefore;
  readonly ordinal?: number;
  readonly origin?: string;
}

/**
 * בניית TextAtom מאומתת. המזהה תמיד נגזר — אין מזהה נכתב ידנית.
 * אטום מקור (בלי origin): אורך הטקסט חייב להתאים בדיוק לאורך
 * הפרוסה. אטום החדרה (origin): פרוסה ריקה חוקית; ה־origin הוא
 * "המקור המפורש" שנדרש בתכנית.
 */
export function makeTextAtom(
  text: string,
  source: SourceSpan,
  options: MakeTextAtomOptions = {},
): TextAtom {
  if (typeof text !== 'string' || text.length === 0) {
    throw new ContentModelError(
      'errors.atom.INVALID_TEXT',
      { reason: 'empty-or-not-string', excerpt: String(text).slice(0, 16) },
      'טקסט אטום חייב להיות מחרוזת לא ריקה',
    );
  }
  if (hasControlChar(text)) {
    throw new ContentModelError(
      'errors.atom.INVALID_TEXT',
      { reason: 'control-char', excerpt: '' },
      'טקסט אטום אינו מכיל תווי בקרה (שורות/טאבים הם גבולות תחביר, לא תוכן)',
    );
  }
  if (hasLoneSurrogate(text)) {
    throw new ContentModelError(
      'errors.atom.INVALID_TEXT',
      { reason: 'lone-surrogate', excerpt: '' },
      'טקסט אטום אינו מכיל חצי surrogate pair',
    );
  }
  if (!isSourceSpan(source)) {
    throw new ContentModelError(
      'errors.atom.INVALID_SPAN',
      { reason: 'not-a-span' },
      'makeTextAtom קיבל SourceSpan לא תקין',
    );
  }
  const ordinal = options.ordinal ?? 0;
  if (!isSafeOrdinal(ordinal)) {
    throw new ContentModelError(
      'errors.atom.INVALID_ORDINAL',
      { value: String(ordinal) },
      'ordinal חייב להיות שלם בטוח ואי־שלילי',
    );
  }
  if (options.origin !== undefined && !isValidOrigin(options.origin)) {
    throw new ContentModelError(
      'errors.atom.INVALID_ORIGIN',
      { origin: options.origin },
      'origin חייב להיות מחרוזת זהות חוקית',
    );
  }
  const origin = options.origin;
  const len = spanLength(source);
  if (origin === undefined && text.length !== len) {
    throw new ContentModelError(
      'errors.atom.TEXT_SPAN_MISMATCH',
      { textLength: String(text.length), spanLength: String(len) },
      'אטום מקור (בלי origin) חייב להכסות את פרוסתו במדויק (תווי UTF-16)',
    );
  }
  const script = options.script ?? classifyScript(text);
  if (!(ATOM_SCRIPTS as readonly string[]).includes(script)) {
    throw new ContentModelError(
      'errors.atom.INVALID_SCRIPT',
      { script: String(script) },
      `script חייב להיות אחד מ: ${ATOM_SCRIPTS.join(', ')}`,
    );
  }
  const bidiLevel = options.bidiLevel ?? 0;
  if (
    typeof bidiLevel !== 'number' || !Number.isSafeInteger(bidiLevel) ||
    bidiLevel < 0 || bidiLevel > MAX_BIDI_LEVEL
  ) {
    throw new ContentModelError(
      'errors.atom.INVALID_BIDI_LEVEL',
      { value: String(bidiLevel) },
      `bidiLevel חייב להיות שלם בטוח בין 0 ל־${MAX_BIDI_LEVEL}`,
    );
  }
  const breakBefore = options.breakBefore ?? 'allowed';
  if (!(BREAK_BEFORE_KINDS as readonly string[]).includes(breakBefore)) {
    throw new ContentModelError(
      'errors.atom.INVALID_BREAK_BEFORE',
      { value: String(breakBefore) },
      `breakBefore חייב להיות אחד מ: ${BREAK_BEFORE_KINDS.join(', ')}`,
    );
  }
  const id = deriveAtomId(source, ordinal, origin);
  return Object.freeze(
    origin === undefined
      ? { id, text, source, script, bidiLevel, breakBefore, ordinal }
      : { id, text, source, script, bidiLevel, breakBefore, ordinal, origin },
  );
}

/** בדיקה מבנית מלאה: תקינות שדות **ואמיתת הגזירה** של המזהה (לא זורקת). */
export function isTextAtom(value: unknown): value is TextAtom {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || !isValidIdValue(v.id)) return false;
  if (typeof v.text !== 'string' || v.text.length === 0) return false;
  if (hasControlChar(v.text) || hasLoneSurrogate(v.text)) return false;
  if (!isSourceSpan(v.source)) return false;
  if (typeof v.script !== 'string' || !(ATOM_SCRIPTS as readonly string[]).includes(v.script)) return false;
  if (
    typeof v.bidiLevel !== 'number' || !Number.isSafeInteger(v.bidiLevel) ||
    v.bidiLevel < 0 || v.bidiLevel > MAX_BIDI_LEVEL
  ) return false;
  if (typeof v.breakBefore !== 'string' || !(BREAK_BEFORE_KINDS as readonly string[]).includes(v.breakBefore)) return false;
  if (!isSafeOrdinal(v.ordinal)) return false;
  if (v.origin !== undefined && !isValidOrigin(v.origin)) return false;
  try {
    return deriveAtomId(v.source as SourceSpan, v.ordinal as number, v.origin as string | undefined) === v.id;
  } catch {
    return false;
  }
}

function assertAtom(atom: TextAtom, what: string): void {
  if (!isTextAtom(atom)) {
    throw new ContentModelError(
      'errors.atom.NOT_AN_ATOM',
      { reason: what },
      'הערך שהתקבל אינו TextAtom תקין (כולל אמיתת גזירת מזהה)',
    );
  }
}

// ─────────────────────────── ספר טרנספורמציות ───────────────────────────

/** סוגי טרנספורמציה — אוצר המילים של Text Audit v1 (שלב 21). */
export type TransformKind = 'split' | 'merge' | 'insert' | 'suppress' | 'reorder' | 'bidi';

/** כל סוגי הטרנספורמציה החוקיים. */
export const TRANSFORM_KINDS: readonly TransformKind[] = Object.freeze([
  'split', 'merge', 'insert', 'suppress', 'reorder', 'bidi',
] as const);

/** ערכי פירוט סדירים בלבד. */
export type LedgerDetailValue = string | number | boolean | null;

/**
 * רשומת טרנספורמציה: קישור מפורש מקור ← יעד. שלב 15 מפיק
 * split/merge; insert/suppress/reorder/bidi ייוצרו בשלבים 17–21 —
 * הטיפוס נעול כבר עכשיו כדי שספר הטרנספורמציות לא ישתנה אחר כך.
 */
export interface TransformRecord {
  readonly kind: TransformKind;
  /** אטומי המקור — ריק רק ב־insert. */
  readonly from: readonly AtomId[];
  /** האטומים שנולדו — ריק רק ב־suppress. */
  readonly to: readonly AtomId[];
  /** סיבה קצרה ויציבה — למשל docx-run-merge, editorial-note-removal. */
  readonly reason: string;
  readonly detail?: Readonly<Record<string, LedgerDetailValue>>;
}

/** ספר הטרנספורמציות — סדרה בלתי־הפיכה של רשומות בסדר הביצוע. */
export type AtomLedger = readonly TransformRecord[];

function isAtomIdValue(value: unknown): value is AtomId {
  return typeof value === 'string' && isValidIdValue(value);
}

/**
 * בניית רשומת טרנספורמציה מאומתת: סוג חוקי; מזהים חוקיים וללא
 * כפילויות בכל צד; לפחות צד אחד לא ריק; insert בלי מקור, suppress
 * בלי יעד, והשאר — שני צדדים.
 */
export function makeTransformRecord(
  kind: TransformKind,
  from: readonly AtomId[],
  to: readonly AtomId[],
  reason: string,
  detail?: Readonly<Record<string, LedgerDetailValue>>,
): TransformRecord {
  if (!(TRANSFORM_KINDS as readonly string[]).includes(kind)) {
    throw new ContentModelError(
      'errors.atom.INVALID_TRANSFORM',
      { reason: `kind:${String(kind)}` },
      `סוג טרנספורמציה חייב להיות אחד מ: ${TRANSFORM_KINDS.join(', ')}`,
    );
  }
  const validateSide = (side: readonly AtomId[], name: string): readonly AtomId[] => {
    if (!Array.isArray(side)) {
      throw new ContentModelError(
        'errors.atom.INVALID_TRANSFORM',
        { reason: `${name}:not-array` },
        `${name} חייב להיות מערך מזהים`,
      );
    }
    const seen = new Set<string>();
    for (const id of side) {
      if (!isAtomIdValue(id)) {
        throw new ContentModelError(
          'errors.atom.INVALID_TRANSFORM',
          { reason: `${name}:bad-id` },
          `${name} מכיל מזהה לא חוקי`,
        );
      }
      if (seen.has(id)) {
        throw new ContentModelError(
          'errors.atom.INVALID_TRANSFORM',
          { reason: `${name}:duplicate-id` },
          `${name} מכיל מזהה כפול (${id})`,
        );
      }
      seen.add(id);
    }
    return Object.freeze([...side]);
  };
  const fromIds = validateSide(from, 'from');
  const toIds = validateSide(to, 'to');
  if (fromIds.length === 0 && toIds.length === 0) {
    throw new ContentModelError(
      'errors.atom.INVALID_TRANSFORM',
      { reason: 'both-sides-empty' },
      'רשומת טרנספורמציה חייבת מקור או יעד',
    );
  }
  if (kind === 'insert' && fromIds.length !== 0) {
    throw new ContentModelError(
      'errors.atom.INVALID_TRANSFORM',
      { reason: 'insert-with-from' },
      'ל־insert אין אטומי מקור',
    );
  }
  if (kind === 'suppress' && toIds.length !== 0) {
    throw new ContentModelError(
      'errors.atom.INVALID_TRANSFORM',
      { reason: 'suppress-with-to' },
      'ל־suppress אין אטומי יעד',
    );
  }
  if (kind !== 'insert' && kind !== 'suppress' && (fromIds.length === 0 || toIds.length === 0)) {
    throw new ContentModelError(
      'errors.atom.INVALID_TRANSFORM',
      { reason: `${kind}:missing-side` },
      `${kind} דורש מקור ויעד גם יחד`,
    );
  }
  if (typeof reason !== 'string' || reason.length === 0 || reason.length > 256) {
    throw new ContentModelError(
      'errors.atom.INVALID_TRANSFORM',
      { reason: 'bad-reason' },
      'reason חייב להיות מחרוזת לא ריקה עד 256 תווים',
    );
  }
  if (detail !== undefined) {
    if (detail === null || typeof detail !== 'object' || Array.isArray(detail)) {
      throw new ContentModelError(
        'errors.atom.INVALID_TRANSFORM',
        { reason: 'bad-detail' },
        'detail חייב להיות אובייקט של ערכים סדירים',
      );
    }
    for (const [key, val] of Object.entries(detail)) {
      if (key.length === 0) {
        throw new ContentModelError(
          'errors.atom.INVALID_TRANSFORM',
          { reason: 'empty-detail-key' },
          'מפתח detail ריק',
        );
      }
      if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean' && val !== null) {
        throw new ContentModelError(
          'errors.atom.INVALID_TRANSFORM',
          { reason: `bad-detail-value:${key}` },
          `ערך detail לא סדיר למפתח ${key}`,
        );
      }
    }
  }
  return Object.freeze(
    detail === undefined
      ? { kind, from: fromIds, to: toIds, reason }
      : { kind, from: fromIds, to: toIds, reason, detail: Object.freeze({ ...detail }) },
  );
}

/** בדיקה מבנית של רשומה (לא זורקת). */
export function isTransformRecord(value: unknown): value is TransformRecord {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.kind !== 'string' || !(TRANSFORM_KINDS as readonly string[]).includes(v.kind)) return false;
  if (!Array.isArray(v.from) || !Array.isArray(v.to)) return false;
  if (!v.from.every((id) => isAtomIdValue(id)) || !v.to.every((id) => isAtomIdValue(id))) return false;
  if (typeof v.reason !== 'string' || v.reason.length === 0 || v.reason.length > 256) return false;
  if (v.detail !== undefined) {
    if (v.detail === null || typeof v.detail !== 'object' || Array.isArray(v.detail)) return false;
    for (const val of Object.values(v.detail as Record<string, unknown>)) {
      if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean' && val !== null) {
        return false;
      }
    }
  }
  return true;
}

/** צירוף רשומה לספר — הספר בלתי־הפיך; מחזיר ספר חדש. */
export function appendTransform(ledger: AtomLedger, record: TransformRecord): AtomLedger {
  if (!Array.isArray(ledger)) {
    throw new ContentModelError(
      'errors.atom.INVALID_TRANSFORM',
      { reason: 'ledger:not-array' },
      'ספר הטרנספורמציות חייב להיות מערך רשומות',
    );
  }
  if (!isTransformRecord(record)) {
    throw new ContentModelError(
      'errors.atom.INVALID_TRANSFORM',
      { reason: 'record:invalid' },
      'הרשומה אינה TransformRecord תקין',
    );
  }
  return Object.freeze([...ledger, record]);
}

/** כל הרשומות שנוגעות באטום (במקור או ביעד), בסדר הספר. */
export function transformsTouching(ledger: AtomLedger, atomId: AtomId): readonly TransformRecord[] {
  if (!Array.isArray(ledger) || !isAtomIdValue(atomId)) return [];
  return ledger.filter(
    (r) => (r.from as readonly string[]).includes(atomId) || (r.to as readonly string[]).includes(atomId),
  );
}

/** ליקוי שלמות ספר — קוד, אטום ומיקום הרשומה. */
export interface LedgerIssue {
  readonly code: 'DOUBLE_BIRTH' | 'UNBORN_SOURCE';
  readonly atomId: AtomId;
  readonly recordIndex: number;
}

/**
 * בדיקת שלמות הספר: (א) אטום לא נולד פעמיים; (ב) כל אטום מקור
 * ברשומה קיים — נולד קודם או שהוא אטום מקור מקורי שהוגש.
 * זהו הבסיס המוכח שעליו ייבנה Text Audit v1 (שלב 21).
 */
export function ledgerIntegrityIssues(
  ledger: AtomLedger,
  sourceAtomIds: readonly AtomId[],
): readonly LedgerIssue[] {
  if (!Array.isArray(ledger)) return [];
  const born = new Set<string>();
  const sources = new Set<string>();
  for (const id of Array.isArray(sourceAtomIds) ? sourceAtomIds : []) {
    if (isAtomIdValue(id)) sources.add(id);
  }
  const issues: LedgerIssue[] = [];
  for (let i = 0; i < ledger.length; i++) {
    const record = ledger[i];
    if (!isTransformRecord(record)) continue;
    for (const id of record.from) {
      if (!born.has(id) && !sources.has(id)) {
        issues.push(Object.freeze({ code: 'UNBORN_SOURCE', atomId: id, recordIndex: i }));
      }
    }
    for (const id of record.to) {
      if (born.has(id)) {
        issues.push(Object.freeze({ code: 'DOUBLE_BIRTH', atomId: id, recordIndex: i }));
      } else {
        born.add(id);
      }
    }
  }
  return Object.freeze(issues);
}

// ─────────────────────────── פיצול ואיחוד ───────────────────────────

/** תוצאת פיצול: שני אטומי בנים + רשומה לספר. */
export interface SplitResult {
  readonly left: TextAtom;
  readonly right: TextAtom;
  readonly record: TransformRecord;
}

/** תוצאת איחוד: האטום המאוחד + רשומה לספר. */
export interface MergeResult {
  readonly merged: TextAtom;
  readonly record: TransformRecord;
}

/**
 * פיצול אטום בגבול חוקי בלבד: לא באמצע surrogate pair, לא בין
 * בסיס לתו משלים שלו, לא אחרי ZWJ. הבנים יורשים את סידור האב
 * (הזהות עוברת בשלמותה), הבן הימני מסומן breakBefore: 'forbidden'
 * — פיצול לצורך provenance (למשל איחוי runs של DOCX) אינו הזדמנות
 * שבירה חדשה. פיצול אטום החדרה (פרוסה ריקה) אסור בשלב זה —
 * החלטה מתועדת; אם ייווצר צורך אמיתי יידרש מנגנון סידורים מפורש.
 */
export function splitAtom(atom: TextAtom, at: number, options: { reason?: string } = {}): SplitResult {
  assertAtom(atom, 'split-source');
  if (!isSafeOrdinal(at) || at <= 0 || at >= atom.text.length) {
    throw new ContentModelError(
      'errors.atom.SPLIT_OUT_OF_RANGE',
      { at: String(at), length: String(atom.text.length) },
      'נקודת הפיצול חייבת להיות שלם בטוח בתוך הטקסט (0 < at < length)',
    );
  }
  if (spanLength(atom.source) === 0) {
    throw new ContentModelError(
      'errors.atom.SPLIT_EMPTY_SPAN',
      { startUtf16: String(atom.source.startUtf16) },
      'פיצול אטום החדרה (פרוסה ריקה) אינו נתמך — אין גבול מקור להיפרד לפיו',
    );
  }
  const prev = atom.text.charCodeAt(at - 1);
  const next = atom.text.charCodeAt(at);
  if (prev >= 0xd800 && prev <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
    throw new ContentModelError(
      'errors.atom.SPLIT_MID_SURROGATE',
      { at: String(at) },
      'אין לפצל באמצע surrogate pair',
    );
  }
  const rightFirstCp = atom.text.codePointAt(at);
  if (rightFirstCp !== undefined && isCombiningMark(rightFirstCp)) {
    throw new ContentModelError(
      'errors.atom.SPLIT_MID_GRAPHEME',
      { at: String(at) },
      'אין לפצל בין בסיס לתו משלים שלו (צרור גרפמה אחד)',
    );
  }
  if (prev === 0x200d) {
    throw new ContentModelError(
      'errors.atom.SPLIT_MID_GRAPHEME',
      { at: String(at) },
      'אין לפצל מיד אחרי ZWJ — הצרור ממשיך',
    );
  }
  const leftText = atom.text.slice(0, at);
  const rightText = atom.text.slice(at);
  const leftSpan = sliceSpan(atom.source, 0, at);
  const rightSpan = sliceSpan(atom.source, at, spanLength(atom.source));
  const build = (text: string, source: SourceSpan, breakBefore: BreakBefore): TextAtom =>
    makeTextAtom(text, source, {
      script: atom.script,
      bidiLevel: atom.bidiLevel,
      breakBefore,
      ordinal: atom.ordinal,
      origin: atom.origin,
    });
  const left = build(leftText, leftSpan, atom.breakBefore);
  const right = build(rightText, rightSpan, 'forbidden');
  const record = makeTransformRecord(
    'split',
    [atom.id],
    [left.id, right.id],
    options.reason ?? 'atom-split',
    { at },
  );
  return Object.freeze({ left, right, record });
}

/**
 * איחוד שני אטומים סמוכים (b מתחיל בדיוק בסוף a, אותו מסמך וזרם),
 * באותו origin ובאותו רמת BiDi — אחרת האיחוד היה מייצר אטום
 * דו־משמעי. הזהות של המאוחד נגזרת מחדש מהפרוסה המאוחדת ומסידור
 * a; לכן merge(split(x)) מחזיר את x במדויק (round-trip). הבנים
 * מקבלים את הגרש המוביל: breakBefore/bidiLevel/importerPath של a
 * (נתיב המקור של b, אם שונה, נרשם בפירוט הרשומה).
 */
export function mergeAtoms(a: TextAtom, b: TextAtom, options: { reason?: string } = {}): MergeResult {
  assertAtom(a, 'merge-a');
  assertAtom(b, 'merge-b');
  if (!sameStream(a.source, b.source) || b.source.startUtf16 !== a.source.endUtf16) {
    throw new ContentModelError(
      'errors.atom.MERGE_NOT_ADJACENT',
      { aEnd: String(a.source.endUtf16), bStart: String(b.source.startUtf16) },
      'איחוד חוקי רק באותו מסמך וזרם, כש־b מתחיל בדיוק בסוף a (בלי רווח או תו אבוד)',
    );
  }
  if ((a.origin ?? undefined) !== (b.origin ?? undefined)) {
    throw new ContentModelError(
      'errors.atom.MERGE_INCOMPATIBLE_ORIGIN',
      { aOrigin: a.origin ?? 'src', bOrigin: b.origin ?? 'src' },
      'אין לאחד אטום מקור עם אטום החדרה, או שני מקורות החדרה שונים',
    );
  }
  if (a.bidiLevel !== b.bidiLevel) {
    throw new ContentModelError(
      'errors.atom.MERGE_INCOMPATIBLE_BIDI',
      { aBidiLevel: String(a.bidiLevel), bBidiLevel: String(b.bidiLevel) },
      'אין לאחד אטומים ברמות BiDi שונות — האטום המאוחד היה מאבד כיוון',
    );
  }
  const aTail = a.text.length > 0 ? a.text.charCodeAt(a.text.length - 1) : 0;
  const bHead = b.text.length > 0 ? b.text.charCodeAt(0) : 0;
  if (aTail >= 0xd800 && aTail <= 0xdbff && bHead >= 0xdc00 && bHead <= 0xdfff) {
    throw new ContentModelError(
      'errors.atom.INVALID_TEXT',
      { reason: 'seam-surrogate', excerpt: '' },
      'תפר האיחוד מלחים חצי surrogate pair משני הצדדים — אחד מהאטומים פגום',
    );
  }
  const mergedText = a.text + b.text;
  const importerPath =
    a.source.importerPath !== undefined && b.source.importerPath !== undefined &&
      a.source.importerPath !== b.source.importerPath
      ? a.source.importerPath
      : (a.source.importerPath ?? b.source.importerPath);
  const mergedSource = makeSourceSpan(
    a.source.documentId,
    a.source.stream,
    a.source.startUtf16,
    b.source.endUtf16,
    importerPath,
  );
  const merged = makeTextAtom(mergedText, mergedSource, {
    script: classifyScript(mergedText),
    bidiLevel: a.bidiLevel,
    breakBefore: a.breakBefore,
    ordinal: a.ordinal,
    origin: a.origin,
  });
  const detail: Record<string, LedgerDetailValue> = {
    aLength: a.text.length,
    bLength: b.text.length,
  };
  if (b.source.importerPath !== undefined && b.source.importerPath !== a.source.importerPath) {
    detail.bImporterPath = b.source.importerPath;
  }
  const record = makeTransformRecord(
    'merge',
    [a.id, b.id],
    [merged.id],
    options.reason ?? 'atom-merge',
    detail,
  );
  return Object.freeze({ merged, record });
}

// ─────────────────────────── כיסוי אטומים (בלי רינדור) ───────────────────────────

/** דוח כיסוי אטומים של זרם אחד — חישוב טהור, בלי מדידה ובלי רינדור. */
export interface CoverageReport {
  /** אין רווחים, אין חפיפות, אין כפילויות ואין חריגה מגבול המסמך. */
  readonly ok: boolean;
  readonly expectedLength: number;
  /** expectedLength פחות סך הרווחים בתוך הגבול. */
  readonly coveredLength: number;
  /** רווחים (תווי מקור שאף אטום לא מכסה), ממוינים. */
  readonly gaps: readonly SourceSpan[];
  /** זוגות חופפים: [המכסה הקודם, הפולש]. */
  readonly overlaps: readonly [SourceSpan, SourceSpan][];
  /** מזהים שהופיעו יותר מפעם אחת בקלט (אמור אפס — הגזירה ייחודית). */
  readonly duplicateIds: readonly AtomId[];
  /** אטומים שפרוסתם חורגת מגבול המסמך. */
  readonly outOfRange: readonly AtomId[];
  /** אטומי החדרה (פרוסה ריקה) — לא משתתפים בכיסוי אך מדווחים. */
  readonly insertedAtoms: readonly AtomId[];
  /** אטומים ממסמך/זרם אחר שסוננו החוצה — לא פוסלים את הכיסוי. */
  readonly outOfStream: readonly AtomId[];
}

/**
 * חישוב כיסוי האטומים של זרם אחד על פני [0, expectedLength) —
 * הוכחת שער השלב: כיסוי האטומים ניתן לחישוב בלי רינדור כלל.
 * הקלט אינו חייב להיות ממוין — המיון לפי הסדר הקנוני של הפרוסות
 * (מיון יציב לפי מפרט ECMAScript; תוצאה דטרמיניסטית לכל קלט).
 */
export function computeAtomCoverage(
  atoms: readonly TextAtom[],
  expectedLength: number,
  documentId: string,
  stream: ContentStream,
): CoverageReport {
  if (
    typeof expectedLength !== 'number' || !Number.isSafeInteger(expectedLength) || expectedLength < 0
  ) {
    throw new ContentModelError(
      'errors.atom.COVERAGE_INVALID_LENGTH',
      { expectedLength: String(expectedLength) },
      'אורך המסמך הצפוי חייב להיות שלם בטוח ואי־שלילי',
    );
  }
  // גשש תקינות: מקודד את דחיית documentId/stream לא חוקיים גם כשאין רווחים
  makeSourceSpan(documentId, stream, 0, 0);
  const duplicateIds: AtomId[] = [];
  const outOfRange: AtomId[] = [];
  const insertedAtoms: AtomId[] = [];
  const outOfStream: AtomId[] = [];
  const sourceAtoms: TextAtom[] = [];
  const seen = new Set<string>();
  for (const atom of Array.isArray(atoms) ? atoms : []) {
    if (!isTextAtom(atom)) continue; // בדיקה מבנית מלאה, כולל גזירה
    if (seen.has(atom.id)) duplicateIds.push(atom.id);
    else seen.add(atom.id);
    if (atom.source.documentId !== documentId || atom.source.stream !== stream) {
      outOfStream.push(atom.id);
      continue;
    }
    if (spanLength(atom.source) === 0) {
      insertedAtoms.push(atom.id);
      continue;
    }
    if (atom.source.endUtf16 > expectedLength) {
      outOfRange.push(atom.id);
      continue;
    }
    sourceAtoms.push(atom);
  }
  sourceAtoms.sort((x, y) => compareSpans(x.source, y.source));
  const gaps: SourceSpan[] = [];
  const overlaps: [SourceSpan, SourceSpan][] = [];
  let current = 0;
  let cover: SourceSpan | undefined;
  for (const atom of sourceAtoms) {
    const s = atom.source.startUtf16;
    const e = atom.source.endUtf16;
    if (s > current) {
      gaps.push(makeSourceSpan(documentId, stream, current, s));
    } else if (s < current && cover !== undefined) {
      overlaps.push([cover, atom.source]);
    }
    if (e > current) {
      current = e;
      cover = atom.source;
    }
  }
  if (current < expectedLength) {
    gaps.push(makeSourceSpan(documentId, stream, current, expectedLength));
  }
  const gapTotal = gaps.reduce((sum, gap) => sum + spanLength(gap), 0);
  const ok =
    gaps.length === 0 && overlaps.length === 0 && duplicateIds.length === 0 && outOfRange.length === 0;
  return Object.freeze({
    ok,
    expectedLength,
    coveredLength: expectedLength - gapTotal,
    gaps: Object.freeze(gaps),
    overlaps: Object.freeze(overlaps),
    duplicateIds: Object.freeze(duplicateIds),
    outOfRange: Object.freeze(outOfRange),
    insertedAtoms: Object.freeze(insertedAtoms),
    outOfStream: Object.freeze(outOfStream),
  });
}
