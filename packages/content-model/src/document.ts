/**
 * document.ts — מסגרת המסמך: metadata, חלקים/סימנים, זרמי הערות ו־round-trip (שלב 16).
 *
 * אסמכתא: אפיון §3.1/§3.3 (מבני הישן כמקור למיפוי) · §6.2 (חוזה) ·
 * תכנית שלב 16: "מבני metadata, heading levels H0–H7, paragraph, shaar,
 * custom boxes, notes streams וחלוקה לחלקים/סימנים" · שלב 17 (הפרסר ימלא).
 *
 * עקרונות:
 *   1. ContentBlock (§6.2) נשאר ככתבו; המסגרת התורנית — חלקים ← סימנים ←
 *      בלוקים — עוטפת אותו בלי לשנותו. זה מבטא את ההיררכיה האמיתית
 *      של ספר תורני ואת השדות simanNumber/subNumber מהישן.
 *   2. זרמי ההערות (שוליים/סיום/צד/עורך) נפרדים מהגוף עם קישור לעוגן
 *      — הנחת היסוד לשלב 20 (מספור טרם העימוד). הפניות בלי יעד נדחות
 *      כאן ובמפורש; הערה שאין מפנה אליה מדווחת (findOrphanNotes) ולא
 *      נבלעת בשקט.
 *   3. החלטות הזנחה מתועדות (שער שלב 16): noteRules ו־customStyles
 *      מהישן הם הגדרות — ביתם settings-schema (שלב 30); כאן נשמרים
 *      מזהי הסגנונות בשימוש בלבד. LayoutMode/TextPosition/PageType/
 *      ColumnLayout הם מושגי פריסה — ביתם layout-api (שלבים 50+);
 *      הקישור אליהם דרך styleId + headingLevel.
 *   4. sourceHash מוזרק על ידי הפרסר (ADR-002, ‎@tora/layout-api) —
 *      ל־content-model אין תלויות, ולכן כאן הוא נבדק מבנית בלבד.
 */

import { ContentModelError } from './errors.js';
import { isSourceSpan, isValidIdValue, makeAnchorId } from './spans.js';
import type { AnchorId, NodeId, SourceSpan } from './spans.js';
import { isContentBlock, MAX_BLOCK_DEPTH, blockDepth } from './blocks.js';
import type { ContentBlock } from './blocks.js';

// ─────────────────────────── Metadata ───────────────────────────

/**
 * עשרת מפתחות ה־metadata ההכרחיים מהתוכנה הישנה (types/text.ts,
 * BookMetadata). הרישום פתוח: מפתח נוסף מהמקור יתווסף על ידי הפרסר
 * (שלב 17) בלי לשנות כאן דבר.
 */
export const LEGACY_METADATA_KEYS: readonly string[] = Object.freeze([
  'שם הספר',
  'נושא',
  'נושא מפורט',
  'פרטי מהדורא',
  'שם המחבר',
  'מקום ושנת הוצאה',
  'שמירת זכויות',
  'פרטי הוצאה לאור',
  'פרטי קשר',
  'פרטים נוספים',
] as const);

/** ערך metadata אחד עם מקורו (stream: 'metadata'). */
export interface MetadataEntry {
  readonly key: string;
  readonly value: string;
  readonly source: SourceSpan;
}

// ─────────────────────────── חלקים וסימנים ───────────────────────────

/** עיצוב שער — כמו PageType הישן, בהיקף הבחירה התוכנית: main/back/sub. */
export type ShaarDesign = 'main' | 'back' | 'sub';

/** כל עיצובי השער החוקיים. */
export const SHAAR_DESIGNS: readonly ShaarDesign[] = Object.freeze(['main', 'back', 'sub'] as const);

/**
 * סימן — פרק הספר התורני. נושא את מספרי הישן (simanNumber/subNumber),
 * את בחירת עיצוב השער ואת בלוקי התוכן שלו בסדר המסמך.
 */
export interface Siman {
  readonly id: NodeId;
  readonly simanNumber: number;
  readonly subNumber?: number;
  readonly shaarDesign?: ShaarDesign;
  readonly source?: SourceSpan;
  readonly blocks: readonly ContentBlock[];
}

/** חלק הספר — מכיל סימנים; ספר ללא חלוקה מפורשת הוא חלק אחד. */
export interface Part {
  readonly id: NodeId;
  readonly title?: string;
  readonly source?: SourceSpan;
  readonly simanim: readonly Siman[];
}

// ─────────────────────────── זרמי הערות ───────────────────────────

/** סוג הערה — ארבעת הזרמים המוכרים מהישן. */
export type NoteKind = 'footnote' | 'endnote' | 'sidenote' | 'editorial';

/** כל סוגי ההערות החוקיים — סדר קבוע. */
export const NOTE_KINDS: readonly NoteKind[] = Object.freeze([
  'footnote', 'endnote', 'sidenote', 'editorial',
] as const);

/** הערה אחת: מזהה, עוגן הפנייה (אם נקבע) וגוף ההערה כבלוק note-body. */
export interface NoteEntry {
  readonly noteId: string;
  readonly kind: NoteKind;
  readonly anchor?: AnchorId;
  readonly block: ContentBlock;
}

/** ארבעת זרמי ההערות — נפרדים מהגוף עוד לפני העימוד (שלב 20). */
export interface NoteStreams {
  readonly footnotes: readonly NoteEntry[];
  readonly endnotes: readonly NoteEntry[];
  readonly sidenotes: readonly NoteEntry[];
  readonly editorial: readonly NoteEntry[];
}

// ─────────────────────────── המסמך ───────────────────────────

/**
 * מסמך תורני שלם: metadata, חלקים←סימנים←בלוקים, זרמי הערות,
 * מזהי סגנונות בשימוש, hash המקור (מוזרק) ואורך המקור בתווי UTF-16
 * (לחישוב כיסוי אטומים מלא — שלב 21).
 */
export interface TorahDocument {
  readonly schemaVersion: 1;
  readonly documentId: string;
  readonly metadata: readonly MetadataEntry[];
  readonly parts: readonly Part[];
  readonly notes: NoteStreams;
  readonly customStyleIds: readonly string[];
  readonly sourceHash: string;
  readonly sourceLength: number;
}

const HEX64 = /^[0-9a-f]{64}$/;

function docError(key: string, params: Record<string, string>, message: string): never {
  throw new ContentModelError(key, params, message);
}

function isSafeCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

// ─────────────────────────── בנייה ואימות ───────────────────────────

/**
 * בניית מסמך מאומת: מאמת עומק את כל הרכיבים (כולל אמיתות גזירה של
 * כל בלוק), מייחד מזהי בלוקים בכל העץ, מייחד מזהי הערות בכל הזרמים,
 * ודורש שכל הפניית note-reference תיפתר להערה קיימת. מחזיר עותק
 * קפוא — מתאים גם לפרסור תוצאת JSON (round-trip).
 */
export function makeTorahDocument(input: unknown): TorahDocument {
  if (input === null || typeof input !== 'object') {
    docError('errors.document.NOT_A_DOCUMENT', { reason: 'not-an-object' }, 'המסמך חייב להיות אובייקט');
  }
  const v = input as Record<string, unknown>;
  if (v.schemaVersion !== 1) {
    docError(
      'errors.document.INVALID_SCHEMA_VERSION',
      { version: String(v.schemaVersion) },
      'schemaVersion חייב להיות 1',
    );
  }
  if (typeof v.documentId !== 'string' || !isValidIdValue(v.documentId)) {
    docError(
      'errors.document.INVALID_DOCUMENT_ID',
      { documentId: String(v.documentId) },
      'documentId חייב מחרוזת זהות חוקית',
    );
  }
  // ── metadata ──
  if (!Array.isArray(v.metadata)) {
    docError('errors.document.INVALID_METADATA', { reason: 'not-array' }, 'metadata חייב מערך ערכים');
  }
  const metadata: MetadataEntry[] = [];
  const metaKeys = new Set<string>();
  for (const entry of v.metadata as unknown[]) {
    if (entry === null || typeof entry !== 'object') {
      docError('errors.document.INVALID_METADATA', { reason: 'entry-not-object' }, 'ערך metadata חייב אובייקט');
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.key !== 'string' || e.key.length === 0 || typeof e.value !== 'string' || !isSourceSpan(e.source)) {
      docError(
        'errors.document.INVALID_METADATA',
        { reason: 'entry-fields', key: typeof e.key === 'string' ? e.key.slice(0, 32) : '?' },
        'ערך metadata חייב key לא ריק, value מחרוזת ו־SourceSpan תקין (בזרם metadata)',
      );
    }
    if ((e.source as SourceSpan).stream !== 'metadata') {
      docError(
        'errors.document.INVALID_METADATA',
        { reason: 'wrong-stream', key: e.key as string },
        'פרוסת ערך metadata חייבת להיות בזרם metadata',
      );
    }
    if (metaKeys.has(e.key as string)) {
      docError(
        'errors.document.DUPLICATE_METADATA_KEY',
        { key: e.key as string },
        `מפתח metadata כפול: ${e.key}`,
      );
    }
    metaKeys.add(e.key as string);
    metadata.push(Object.freeze({ key: e.key as string, value: e.value as string, source: e.source as SourceSpan }));
  }
  // ── parts ← simanim ← blocks ──
  if (!Array.isArray(v.parts) || v.parts.length === 0) {
    docError('errors.document.INVALID_PART', { reason: 'empty-or-not-array' }, 'המסמך חייב לפחות חלק אחד');
  }
  const parts: Part[] = [];
  const seenBlockIds = new Set<string>();
  const seenNoteRefs = new Set<string>();
  const validateBlock = (block: unknown, path: string): ContentBlock => {
    if (!isContentBlock(block)) {
      docError(
        'errors.block.NOT_A_BLOCK',
        { reason: `invalid-block:${path}` },
        `בלוק לא תקין בנתיב ${path} (כולל אמיתת גזירה)`,
      );
    }
    const b = block as ContentBlock;
    if (seenBlockIds.has(b.id)) {
      docError('errors.block.DUPLICATE_NODE_ID', { id: b.id, path }, `מזהה בלוק כפול: ${b.id}`);
    }
    seenBlockIds.add(b.id);
    if (blockDepth(b) > MAX_BLOCK_DEPTH) {
      docError(
        'errors.block.DEPTH_EXCEEDED',
        { depth: String(blockDepth(b)), limit: String(MAX_BLOCK_DEPTH) },
        `עומק קינון בלוקים חורג מ־${MAX_BLOCK_DEPTH}`,
      );
    }
    for (const item of b.inline) {
      if (item.kind === 'note-reference') seenNoteRefs.add(item.noteId);
    }
    return b;
  };
  const validateSimanBlocks = (blocks: unknown, path: string): ContentBlock[] => {
    if (!Array.isArray(blocks)) {
      docError('errors.document.INVALID_SIMAN', { reason: `${path}:blocks-not-array` }, `בלוקי הסימן בנתיב ${path} חייבים מערך`);
    }
    const out: ContentBlock[] = [];
    let i = 0;
    for (const block of blocks as unknown[]) {
      const b = validateBlock(block, `${path}[${i}]`);
      out.push(b);
      i++;
    }
    return out;
  };
  for (const partEntry of v.parts as unknown[]) {
    if (partEntry === null || typeof partEntry !== 'object') {
      docError('errors.document.INVALID_PART', { reason: 'part-not-object' }, 'חלק חייב אובייקט');
    }
    const p = partEntry as Record<string, unknown>;
    if (typeof p.id !== 'string' || !isValidIdValue(p.id)) {
      docError('errors.document.INVALID_PART', { reason: 'part-id' }, 'מזהה חלק חייב מחרוזת זהות חוקית');
    }
    if (p.title !== undefined && (typeof p.title !== 'string' || p.title.length === 0)) {
      docError('errors.document.INVALID_PART', { reason: 'part-title' }, 'כותרת חלק, אם קיימת — מחרוזת לא ריקה');
    }
    if (p.source !== undefined && !isSourceSpan(p.source)) {
      docError('errors.document.INVALID_PART', { reason: 'part-source' }, 'פרוסת חלק, אם קיימת — SourceSpan תקין');
    }
    if (!Array.isArray(p.simanim) || p.simanim.length === 0) {
      docError('errors.document.INVALID_PART', { reason: 'empty-simanim', partId: p.id as string }, 'כל חלק חייב לפחות סימן אחד');
    }
    const simanim: Siman[] = [];
    for (const simanEntry of p.simanim as unknown[]) {
      if (simanEntry === null || typeof simanEntry !== 'object') {
        docError('errors.document.INVALID_SIMAN', { reason: 'siman-not-object' }, 'סימן חייב אובייקט');
      }
      const s = simanEntry as Record<string, unknown>;
      if (typeof s.id !== 'string' || !isValidIdValue(s.id)) {
        docError('errors.document.INVALID_SIMAN', { reason: 'siman-id' }, 'מזהה סימן חייב מחרוזת זהות חוקית');
      }
      if (
        typeof s.simanNumber !== 'number' || !Number.isSafeInteger(s.simanNumber) || s.simanNumber < 1
      ) {
        docError(
          'errors.document.INVALID_SIMAN_NUMBER',
          { simanNumber: String(s.simanNumber) },
          'מספר סימן חייב שלם בטוח ≥ 1',
        );
      }
      if (s.subNumber !== undefined && (typeof s.subNumber !== 'number' || !Number.isSafeInteger(s.subNumber) || s.subNumber < 1)) {
        docError(
          'errors.document.INVALID_SIMAN_NUMBER',
          { simanNumber: `${s.simanNumber}/${String(s.subNumber)}` },
          'תת־מספר, אם קיים — שלם בטוח ≥ 1',
        );
      }
      if (s.shaarDesign !== undefined && !(SHAAR_DESIGNS as readonly string[]).includes(s.shaarDesign as string)) {
        docError(
          'errors.document.INVALID_SHAAR_DESIGN',
          { shaarDesign: String(s.shaarDesign) },
          `עיצוב שער חייב להיות אחד מ: ${SHAAR_DESIGNS.join(', ')}`,
        );
      }
      if (s.source !== undefined && !isSourceSpan(s.source)) {
        docError('errors.document.INVALID_SIMAN', { reason: 'siman-source' }, 'פרוסת סימן, אם קיימת — SourceSpan תקין');
      }
      const path = `${p.id}/${s.id}`;
      simanim.push(
        Object.freeze({
          id: s.id as NodeId,
          simanNumber: s.simanNumber as number,
          ...(s.subNumber === undefined ? {} : { subNumber: s.subNumber as number }),
          ...(s.shaarDesign === undefined ? {} : { shaarDesign: s.shaarDesign as ShaarDesign }),
          ...(s.source === undefined ? {} : { source: s.source as SourceSpan }),
          blocks: Object.freeze(validateSimanBlocks(s.blocks, path)),
        }),
      );
    }
    parts.push(
      Object.freeze({
        id: p.id as NodeId,
        ...(p.title === undefined ? {} : { title: p.title as string }),
        ...(p.source === undefined ? {} : { source: p.source as SourceSpan }),
        simanim: Object.freeze(simanim),
      }),
    );
  }
  // ── note streams ──
  if (v.notes === null || typeof v.notes !== 'object') {
    docError('errors.document.INVALID_NOTE', { reason: 'not-an-object' }, 'זרמי ההערות חייבים אובייקט');
  }
  const n = v.notes as Record<string, unknown>;
  const noteStreams: Record<NoteKind, NoteEntry[]> = { footnote: [], endnote: [], sidenote: [], editorial: [] };
  const pluralOf: Record<NoteKind, string> = {
    footnote: 'footnotes',
    endnote: 'endnotes',
    sidenote: 'sidenotes',
    editorial: 'editorial',
  };
  const seenNoteIds = new Set<string>();
  for (const kind of NOTE_KINDS) {
    const list = n[pluralOf[kind]];
    if (!Array.isArray(list)) {
      docError(
        'errors.document.INVALID_NOTE',
        { reason: `${pluralOf[kind]}:not-array` },
        `זרם ${pluralOf[kind]} חייב מערך`,
      );
    }
    for (const noteEntry of list as unknown[]) {
      if (noteEntry === null || typeof noteEntry !== 'object') {
        docError('errors.document.INVALID_NOTE', { reason: 'entry-not-object', kind }, 'הערה חייבת אובייקט');
      }
      const e = noteEntry as Record<string, unknown>;
      if (typeof e.noteId !== 'string' || !isValidIdValue(e.noteId)) {
        docError('errors.document.INVALID_NOTE', { reason: 'noteId', kind }, 'מזהה הערה חייב מחרוזת זהות חוקית');
      }
      if (e.kind !== kind) {
        docError(
          'errors.document.INVALID_NOTE',
          { reason: 'kind-mismatch', kind: String(e.kind), stream: pluralOf[kind] },
          `סוג ההערה אינו תואם לזרם (${e.kind} ב־${pluralOf[kind]})`,
        );
      }
      if (e.anchor !== undefined && (typeof e.anchor !== 'string' || !isValidIdValue(e.anchor))) {
        docError('errors.document.INVALID_NOTE', { reason: 'anchor', kind }, 'עוגן הערה, אם קיים — מחרוזת זהות חוקית');
      }
      const block = validateBlock(e.block, `notes/${pluralOf[kind]}/${e.noteId}`);
      if (block.role !== 'note-body') {
        docError(
          'errors.document.INVALID_NOTE_BLOCK_ROLE',
          { noteId: e.noteId as string, role: block.role },
          'גוף הערה חייב להיות בלוק בתפקיד note-body',
        );
      }
      if (seenNoteIds.has(e.noteId as string)) {
        docError('errors.document.DUPLICATE_NOTE_ID', { noteId: e.noteId as string }, `מזהה הערה כפול: ${e.noteId}`);
      }
      seenNoteIds.add(e.noteId as string);
      noteStreams[kind].push(
        Object.freeze({
          noteId: e.noteId as string,
          kind,
          ...(e.anchor === undefined ? {} : { anchor: makeAnchorId(e.anchor as string) }),
          block,
        }),
      );
    }
  }
  // כל הפנייה חייבת להיפתר — אין הפניה תלויה באוויר
  for (const noteId of seenNoteRefs) {
    if (!seenNoteIds.has(noteId)) {
      docError(
        'errors.document.UNRESOLVED_NOTE_REFERENCE',
        { noteId },
        `הפניית הערה שאין לה יעד: ${noteId}`,
      );
    }
  }
  // ── customStyleIds / sourceHash / sourceLength ──
  if (v.customStyleIds !== undefined && !Array.isArray(v.customStyleIds)) {
    docError('errors.document.NOT_A_DOCUMENT', { reason: 'customStyleIds:not-array' }, 'customStyleIds חייב מערך מחרוזות');
  }
  const customStyleIds: string[] = [];
  for (const styleId of (v.customStyleIds ?? []) as unknown[]) {
    if (typeof styleId !== 'string' || !isValidIdValue(styleId)) {
      docError('errors.document.NOT_A_DOCUMENT', { reason: 'customStyleIds:bad-id' }, 'מזהה סגנון מותאם חייב מחרוזת זהות חוקית');
    }
    customStyleIds.push(styleId);
  }
  if (typeof v.sourceHash !== 'string' || (v.sourceHash !== '' && !HEX64.test(v.sourceHash))) {
    docError(
      'errors.document.INVALID_SOURCE_HASH',
      { sourceHash: String(v.sourceHash).slice(0, 16) },
      'sourceHash חייב מחרוזת ריקה או 64 תווי hex קטנים (ADR-002)',
    );
  }
  if (!isSafeCount(v.sourceLength)) {
    docError(
      'errors.document.NOT_A_DOCUMENT',
      { reason: 'sourceLength' },
      'sourceLength חייב שלם בטוח ואי־שלילי (תווי UTF-16 של המקור)',
    );
  }
  return Object.freeze({
    schemaVersion: 1 as const,
    documentId: v.documentId as string,
    metadata: Object.freeze(metadata),
    parts: Object.freeze(parts),
    notes: Object.freeze({
      footnotes: Object.freeze(noteStreams.footnote),
      endnotes: Object.freeze(noteStreams.endnote),
      sidenotes: Object.freeze(noteStreams.sidenote),
      editorial: Object.freeze(noteStreams.editorial),
    }),
    customStyleIds: Object.freeze(customStyleIds),
    sourceHash: v.sourceHash as string,
    sourceLength: v.sourceLength as number,
  });
}

/** בדיקה מבנית מלאה של המסמך (לא זורקת). */
export function isTorahDocument(value: unknown): value is TorahDocument {
  try {
    makeTorahDocument(value);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────── סריאליזציה (round-trip) ───────────────────────────

/**
 * סריאליזציה דטרמיניסטית למסמך: אותו מסמך ← אותה מחרוזת ביט-ביט
 * (הבנאים קובעים סדר שדות אחיד). לא קנוניזציה כללית — זו נעשית
 * ב־canonicalHash (ADR-002) על ידי מי שצריך לגבב.
 */
export function serializeDocument(doc: TorahDocument): string {
  return JSON.stringify(doc);
}

/** פרסור מחרוזת שהופקה ב־serializeDocument — מאומת מחדש במלואו. */
export function parseDocument(json: string): TorahDocument {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    docError(
      'errors.document.NOT_A_DOCUMENT',
      { reason: 'json' },
      `פרסור ה־JSON נכשל: ${(e as Error).message}`,
    );
  }
  return makeTorahDocument(parsed);
}

// ─────────────────────────── עזרי מסמך ───────────────────────────

/** רשימת ההערות לפי סוג — מפנה את הכפילות של editorial (בלי ׳ס׳). */
function noteList(notes: NoteStreams, kind: NoteKind): readonly NoteEntry[] {
  switch (kind) {
    case 'footnote': return notes.footnotes;
    case 'endnote': return notes.endnotes;
    case 'sidenote': return notes.sidenotes;
    case 'editorial': return notes.editorial;
  }
}

/** כל בלוקי המסמך — גוף (חלקים←סימנים←בלוקים רקורסיבית) וגופי ההערות. */
export function allBlocks(doc: TorahDocument): readonly ContentBlock[] {
  const out: ContentBlock[] = [];
  const walk = (blocks: readonly ContentBlock[]): void => {
    for (const block of blocks) {
      out.push(block);
      if (block.children !== undefined) walk(block.children);
    }
  };
  for (const part of doc.parts) {
    for (const siman of part.simanim) walk(siman.blocks);
  }
  for (const kind of NOTE_KINDS) {
    for (const note of noteList(doc.notes, kind)) {
      out.push(note.block);
    }
  }
  return out;
}

/**
 * הערות יתומות — הערות שאף הפנייה במסמך אינה מפנה אליהן. אינן נפסלות
 * כאן (הסרת הערות עורך, למשל, יוצרת יתומות מטבען עד לרישום בספר
 * הטרנספורמציות — שלב 21); הן מדווחות ולא נבלעות בשקט.
 */
export function findOrphanNotes(doc: TorahDocument): readonly string[] {
  const referenced = new Set<string>();
  for (const block of allBlocks(doc)) {
    for (const item of block.inline) {
      if (item.kind === 'note-reference') referenced.add(item.noteId);
    }
  }
  const orphans: string[] = [];
  for (const kind of NOTE_KINDS) {
    for (const note of noteList(doc.notes, kind)) {
      if (!referenced.has(note.noteId)) orphans.push(note.noteId);
    }
  }
  return Object.freeze(orphans);
}
