/**
 * blocks.ts — ContentBlock רקורסיבי וגזירת NodeId/AnchorId דטרמיניסטית (שלב 16).
 *
 * אסמכתא: אפיון §6.2 (ContentBlock) · §3.1/§3.3 (מה קיים ומה חייב להישמר) ·
 * תכנית שלב 16: "מבני metadata, כותרות H0–H7, פסקה, shaar, custom boxes,
 * זרמי הערות וחלוקה לחלקים/סימנים" (המסגרת עצמה ב־document.ts).
 *
 * כללי יסוד:
 *   1. חוזה הבלוק ככתוב באפיון §6.2 — id, role, headingLevel?, styleId,
 *      source, inline, children? — בדיוק; הרחבות הזהות (ordinal/origin)
 *      באותו דפוס של TextAtom (שלב 15), לאמיתת גזירה ולביקורת.
 *   2. מזהה הבלוק נגזר מהמקור בלבד — אותו מנגנון קידוד של AtomId עם
 *      הקידומת ‎node:v1‎; העוגן — ‎anchor:v1‎. אין אקראיות ואין מונים.
 *   3. headingLevel מוגדר אך ורק ל־role 'heading' (H0–H7 לפי הישן);
 *      children חוקי לכל role — בירושה מהפרסר הישן, שבו כותרת פותחת
 *      בלוק עם ילדים (ast-builder.ts) ותיבה מותאמת עוטפת תוכן.
 *   4. תקינות העץ נבדקת בשתי שכבות: כל בלוק מאומת לעצמו (כולל
 *      אמיתת גזירה); ייחוד מזהים ועומק — ברמת המסמך (document.ts).
 */

import { ContentModelError } from './errors.js';
import { isSourceSpan, isValidIdValue, makeNodeId, spanLength } from './spans.js';
import type { NodeId, SourceSpan } from './spans.js';
import { isInlineItem } from './inline.js';
import type { InlineItem } from './inline.js';

// ─────────────────────────── תפקידים ורמות כותרת ───────────────────────────

/** תפקיד הבלוק (אפיון §6.2). */
export type BlockRole = 'body' | 'heading' | 'custom' | 'note-body';

/** כל התפקידים החוקיים — סדר קבוע. */
export const BLOCK_ROLES: readonly BlockRole[] = Object.freeze([
  'body', 'heading', 'custom', 'note-body',
] as const);

/**
 * רמות כותרת H0–H7 לפי התוכנה הישנה (types/text.ts):
 * 0 = פתיחה/מבוא; 1 = שער חלק; 2 = פתיחת סימן; 3 = כותרת רוחבית;
 * 4–6 = כותרות inline וליווי; 7 = הערת צד בשוליים.
 */
export type HeadingLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** כל רמות הכותרת החוקיות — בסדר עולה. */
export const HEADING_LEVELS: readonly HeadingLevel[] = Object.freeze([
  0, 1, 2, 3, 4, 5, 6, 7,
] as const);

/** עומק קינון מקסימלי לבלוקים — גדר שפיות, לא גבול תוכן. */
export const MAX_BLOCK_DEPTH = 32;

// ─────────────────────────── גזירת מזהים ───────────────────────────

const NODE_ID_PREFIX = 'node:v1';
const ANCHOR_ID_PREFIX = 'anchor:v1';
const MAX_ID_LENGTH = 512;

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

function derivePrefixedId(
  prefix: string,
  source: SourceSpan,
  ordinal: number,
  origin?: string,
): string {
  const id =
    `${prefix}|${encodeIdSegment(source.documentId)}|${source.stream}` +
    `|${source.startUtf16}+${source.endUtf16}` +
    `|${origin === undefined ? 'src' : encodeIdSegment(origin)}|${ordinal}`;
  if (id.length > MAX_ID_LENGTH) {
    throw new ContentModelError(
      'errors.block.ID_DERIVATION_TOO_LONG',
      { length: String(id.length) },
      `המזהה הנגזר חורג מ־${MAX_ID_LENGTH} תווים`,
    );
  }
  return id;
}

/** גזירת מזהה בלוק: ‎node:v1|מסמך|זרם|start+end|origin|ordinal‎ — מהמקור בלבד. */
export function deriveNodeId(source: SourceSpan, ordinal = 0, origin?: string): NodeId {
  if (!isSourceSpan(source)) {
    throw new ContentModelError(
      'errors.block.NOT_A_BLOCK',
      { reason: 'derive:not-a-span' },
      'deriveNodeId קיבל SourceSpan לא תקין',
    );
  }
  if (!isSafeOrdinal(ordinal)) {
    throw new ContentModelError(
      'errors.block.INVALID_ORDINAL',
      { value: String(ordinal) },
      'ordinal חייב שלם בטוח ואי־שלילי',
    );
  }
  if (origin !== undefined && !isValidOrigin(origin)) {
    throw new ContentModelError(
      'errors.block.INVALID_ORIGIN',
      { origin },
      'origin חייב מחרוזת זהות חוקית',
    );
  }
  return makeNodeId(derivePrefixedId(NODE_ID_PREFIX, source, ordinal, origin));
}

/** גזירת מזהה עוגן: ‎anchor:v1|…‎ — לעוגני כותרות, הערות ותוכן עניינים. */
export function deriveAnchorId(source: SourceSpan, ordinal = 0): string {
  if (!isSourceSpan(source)) {
    throw new ContentModelError(
      'errors.block.NOT_A_BLOCK',
      { reason: 'derive-anchor:not-a-span' },
      'deriveAnchorId קיבל SourceSpan לא תקין',
    );
  }
  if (!isSafeOrdinal(ordinal)) {
    throw new ContentModelError(
      'errors.block.INVALID_ORDINAL',
      { value: String(ordinal) },
      'ordinal חייב שלם בטוח ואי־שלילי',
    );
  }
  return derivePrefixedId(ANCHOR_ID_PREFIX, source, ordinal);
}

// ─────────────────────────── ContentBlock ───────────────────────────

/**
 * בלוק תוכן רקורסיבי (אפיון §6.2) + גורמי זהות (ordinal/origin) בדפוס
 * שלב 15. פסקה, כותרת (H0–H7), תיבה מותאמת וגוף הערה — כולם ContentBlock.
 */
export interface ContentBlock {
  readonly id: NodeId;
  readonly role: BlockRole;
  readonly headingLevel?: HeadingLevel;
  readonly styleId: string;
  readonly source: SourceSpan;
  readonly inline: readonly InlineItem[];
  readonly children?: readonly ContentBlock[];
  readonly ordinal: number;
  readonly origin?: string;
}

/** קלט בניית בלוק — הכול ערכים סדירים ודטרמיניסטיים. */
export interface MakeContentBlockInput {
  readonly role: BlockRole;
  readonly source: SourceSpan;
  readonly styleId?: string;
  readonly headingLevel?: HeadingLevel;
  readonly inline?: readonly InlineItem[];
  readonly children?: readonly ContentBlock[];
  readonly ordinal?: number;
  readonly origin?: string;
}

/**
 * בניית ContentBlock מאומתת. המזהה תמיד נגזר. headingLevel חובה ל־'heading'
 * ואסור לשאר; children מאומתים רקורסיבית (כולל אמיתת הגזירה של כל צאצא);
 * styleId ברירת מחדל לפי התפקיד (‎heading-N‎ לכותרות) — סגנון מותאם אישית
 * מהישן (customStyleId) נשמר כאן כמו שהוא.
 */
export function makeContentBlock(input: MakeContentBlockInput): ContentBlock {
  if (input === null || typeof input !== 'object') {
    throw new ContentModelError(
      'errors.block.NOT_A_BLOCK',
      { reason: 'not-an-object' },
      'makeContentBlock קיבל קלט שאינו אובייקט',
    );
  }
  const role = input.role;
  if (typeof role !== 'string' || !(BLOCK_ROLES as readonly string[]).includes(role)) {
    throw new ContentModelError(
      'errors.block.INVALID_ROLE',
      { role: String(role) },
      `role חייב להיות אחד מ: ${BLOCK_ROLES.join(', ')}`,
    );
  }
  if (!isSourceSpan(input.source)) {
    throw new ContentModelError(
      'errors.block.NOT_A_BLOCK',
      { reason: 'not-a-span' },
      'בלוק חייב SourceSpan תקין',
    );
  }
  if (input.styleId !== undefined && (typeof input.styleId !== 'string' || !isValidIdValue(input.styleId))) {
    throw new ContentModelError(
      'errors.block.INVALID_STYLE_ID',
      { styleId: String(input.styleId) },
      'styleId חייב מחרוזת זהות חוקית',
    );
  }
  if (role === 'heading') {
    if (input.headingLevel === undefined) {
      throw new ContentModelError(
        'errors.block.HEADING_LEVEL_REQUIRED',
        { role },
        "בלוק כותרת חייב headingLevel (H0–H7 לפי הישן)",
      );
    }
    if (!(HEADING_LEVELS as readonly number[]).includes(input.headingLevel)) {
      throw new ContentModelError(
        'errors.block.INVALID_HEADING_LEVEL',
        { level: String(input.headingLevel) },
        'headingLevel חייב להיות שלם 0–7',
      );
    }
  } else if (input.headingLevel !== undefined) {
    throw new ContentModelError(
      'errors.block.HEADING_LEVEL_FORBIDDEN',
      { role, level: String(input.headingLevel) },
      'headingLevel מוגדר רק לבלוקי כותרת',
    );
  }
  if (input.inline !== undefined) {
    if (!Array.isArray(input.inline)) {
      throw new ContentModelError(
        'errors.block.NOT_A_BLOCK',
        { reason: 'inline:not-array' },
        'inline חייב מערך של InlineItem',
      );
    }
    for (const item of input.inline) {
      if (!isInlineItem(item)) {
        throw new ContentModelError(
          'errors.block.NOT_A_BLOCK',
          { reason: 'inline:invalid-item' },
          'כל פריט ה-inline חייב להיות InlineItem תקין',
        );
      }
    }
  }
  if (input.children !== undefined) {
    if (!Array.isArray(input.children)) {
      throw new ContentModelError(
        'errors.block.INVALID_CHILDREN',
        { reason: 'not-array' },
        'children חייב מערך של ContentBlock',
      );
    }
    for (const child of input.children) {
      if (!isContentBlock(child)) {
        throw new ContentModelError(
          'errors.block.INVALID_CHILDREN',
          { reason: 'invalid-child' },
          'כל ילד חייב להיות ContentBlock תקין (כולל אמיתת גזירה)',
        );
      }
    }
  }
  const ordinal = input.ordinal ?? 0;
  if (!isSafeOrdinal(ordinal)) {
    throw new ContentModelError(
      'errors.block.INVALID_ORDINAL',
      { value: String(ordinal) },
      'ordinal חייב שלם בטוח ואי־שלילי',
    );
  }
  if (input.origin !== undefined && !isValidOrigin(input.origin)) {
    throw new ContentModelError(
      'errors.block.INVALID_ORIGIN',
      { origin: input.origin },
      'origin חייב מחרוזת זהות חוקית',
    );
  }
  const styleId = input.styleId ?? (role === 'heading' ? `heading-${input.headingLevel}` : role);
  const id = deriveNodeId(input.source, ordinal, input.origin);
  // בנייה בסדר הצהרת השדות; שדות אופציונליים נעדרים כשאינם (ולא undefined)
  let block: Record<string, unknown> = {
    id,
    role,
    ...(role === 'heading' ? { headingLevel: input.headingLevel } : {}),
    styleId,
    source: input.source,
    inline: Object.freeze([...(input.inline ?? [])]),
  };
  if (input.children !== undefined) {
    block = { ...block, children: Object.freeze([...input.children]) };
  }
  block = { ...block, ordinal };
  if (input.origin !== undefined) {
    block = { ...block, origin: input.origin };
  }
  return Object.freeze(block) as unknown as ContentBlock;
}

/** בדיקה מבנית מלאה — שדות הבלוק, ילדיו ואמיתת גזירת המזהה (לא זורקת). */
export function isContentBlock(value: unknown): value is ContentBlock {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  if (typeof v.role !== 'string' || !(BLOCK_ROLES as readonly string[]).includes(v.role)) return false;
  if (!isSourceSpan(v.source)) return false;
  if (typeof v.styleId !== 'string' || !isValidIdValue(v.styleId)) return false;
  if (v.role === 'heading') {
    if (typeof v.headingLevel !== 'number' || !(HEADING_LEVELS as readonly number[]).includes(v.headingLevel)) {
      return false;
    }
  } else if (v.headingLevel !== undefined) {
    return false;
  }
  if (!Array.isArray(v.inline) || !v.inline.every((item) => isInlineItem(item))) return false;
  if (v.children !== undefined) {
    if (!Array.isArray(v.children) || !v.children.every((child) => isContentBlock(child))) return false;
  }
  if (typeof v.ordinal !== 'number' || !isSafeOrdinal(v.ordinal)) return false;
  if (v.origin !== undefined && (typeof v.origin !== 'string' || !isValidOrigin(v.origin))) return false;
  try {
    return deriveNodeId(v.source as SourceSpan, v.ordinal as number, v.origin as string | undefined) === v.id;
  } catch {
    return false;
  }
}

/** מיפוי עומק של עץ בלוקים (הבלוק עצמו = עומק 1). */
export function blockDepth(block: ContentBlock): number {
  if (block.children === undefined || block.children.length === 0) return 1;
  let max = 0;
  for (const child of block.children) {
    const d = blockDepth(child);
    if (d > max) max = d;
  }
  return 1 + max;
}

/** אורך הפרוסה שהבלוק מכסה במקור (תווי UTF-16). */
export function blockSpanLength(block: ContentBlock): number {
  return spanLength(block.source);
}
