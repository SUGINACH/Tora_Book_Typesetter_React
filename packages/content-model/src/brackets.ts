/**
 * brackets.ts — עץ סוגריים מבני בפרסר (שלב 19).
 *
 * אסמכתא: אפיון §10.4 ("ה־parser בונה bracket tree ולא רק regex לוקאלי";
 * "מצב ה־stack נמצא ב־PaginationState"; "סוגר לא סגור בקלט מדווח כבעיית
 * קלט; לא 'מתוקן' בשקט") · §14.2 (Text Audit מבדיל נוסח מקור/תו מושמט/
 * תו מיוצר) · תכנית שלב 19: "נעילת מבני continuation/segments כך שהמנוע
 * לא יצטרך לנחש היררכיה מאוחר יותר".
 *
 * עקרונות:
 *   1. העץ נבנה מעל אטומי התוכן בלבד — אחרי שהתחביר (כולל תוחמי הערות
 *      השוליים עצמם) הוצא בשלב 17. כך סוגריים של תחביר אינם מזהמים את
 *      המבנה, וסוגריים בגוף הערה הם חלק מהסריקה של אותה הערה.
 *   2. התאמה פר־סוג — בדיוק כמו הישן (‎findMatchingCloseBracket‎ ספר
 *      עומק תו-בודד לכל סוג נפרד): מחסנית עצמאית ל־()‏ ול־[]; קלט
 *      מעורב פתולוגי ([ ( … ] ) אינו "מתוקן" — ה־( מדווח כלא-סגור.
 *      העץ עצמו מקנן גם בין סוגים ([ ( ) ] — ה־( הוא ילד של ה־[).
 *   3. כל זוג מזהה דטרמיניסטי מהמקור (‎bracket:v1|…‎), פרוסות מדויקות
 *      לפתיחה ולסגירה, ורשימת הבלוקים שהוא חוצה — זהו מצב ה־continuation
 *      שהמנוע יצרוך בשלבים 49+/65 בלי regex ובלי ניחוש היררכיה.
 *   4. דיווח בלבד: פתיחה בלי סגירה וסגירה בלי פתיחה מדווחות כאזהרות
 *      קלט — לעולם לא מושלמות/מוסרות בשקט (ADR-007, §10.4).
 *   5. טהור ודטרמיניסטי; הסריקה נגזרת מהמסמך ואינה נשמרת בו — ניתנת
 *      לחישוב מחדש בכל עת (‎scanBrackets(doc)‎).
 */

import { ContentModelError } from './errors.js';
import { isSourceSpan, makeSourceSpan } from './spans.js';
import type { ContentStream, NodeId, SourceSpan } from './spans.js';
import type { ContentBlock } from './blocks.js';
import type { NoteEntry, NoteKind, TorahDocument } from './document.js';

// ─────────────────────────── סוגי יסוד ───────────────────────────

/** סוג זוג סוגריים — עגולים () ומרובעים [] בלבד; גרשיים צרפתיים «» הם פיסוק תוכן, לא סוגריים מבניים. */
export type BracketKind = 'round' | 'square';

/** הגדרת זוג — טבלה קפואה (מקור: מקביל ל־paren-protector הישן). */
export interface BracketPairDef {
  readonly kind: BracketKind;
  readonly open: string;
  readonly close: string;
}

/** זוגות הסוגריים המבניים — בסדר קבוע. */
export const BRACKET_PAIRS: readonly BracketPairDef[] = Object.freeze([
  { kind: 'round', open: '(', close: ')' },
  { kind: 'square', open: '[', close: ']' },
] as const);

/** עומק קינון מרבי שנכנס לעץ ולדוחות הבלוק (מעבר לזה — הזוג נספר ב־pairs אך לא מעוצם; מגן קלט פתולוגי). */
export const MAX_BRACKET_DEPTH = 64;

/** צומת זוג בעץ — פתיחה, סגירה, קינון והבלוקים שהזוג חוצה. */
export interface BracketPairNode {
  /** ‎bracket:v1|doc|stream|kind|openStart|closeStart‎ — דטרמיניסטי מהמקור. */
  readonly id: string;
  readonly kind: BracketKind;
  /** עומק קינון כולל (כל הסוגים יחד) — 1 לזוג החיצוני ביותר. */
  readonly depth: number;
  /** פרוסת תו הפתיחה (תו אחד, אותו זרם). */
  readonly openSpan: SourceSpan;
  /** פרוסת תו הסגירה; חסר כשהזוג לא נסגר. */
  readonly closeSpan?: SourceSpan;
  /** הבלוקים שהזוג מקיף (בסדר הזרימה) — אורך > 1 = זוג חוצה בלוקים/שורות/עמודים. */
  readonly blockIds: readonly NodeId[];
  /** זוגות מקוננים בתוכו (בסדר הופעה, לרבות מסוגים אחרים). */
  readonly children: readonly BracketPairNode[];
}

/** בעיית סוגריים בקלט — דיווח בלבד, אף תיקון. */
export interface BracketIssue {
  readonly kind: 'unclosed-open' | 'stray-close';
  readonly bracketKind: BracketKind;
  /** פרוסת התו הבעייתי. */
  readonly span: SourceSpan;
  /** זוג הפתיחה שלא נסגר — מלא רק ב־unclosed-open. */
  readonly pairId?: string;
  readonly detail: string;
}

/** מצב הסוגריים בגבול בלוק — ה־continuation שהמנוע יצרוך (שלבים 49+/65). */
export interface BracketBlockState {
  readonly blockId: NodeId;
  /** זוגות פתוחים בכניסה לבלוק (בסדר פתיחה). */
  readonly openAtStart: readonly string[];
  /** זוגות שעדיין פתוחים ביציאה מהבלוק. */
  readonly openAtEnd: readonly string[];
  /** זוגות שנפתחו בתוך הבלוק (עד עומק מדווח). */
  readonly openedWithin: readonly string[];
  /** זוגות שנסגרו בתוך הבלוק (עד עומק מדווח). */
  readonly closedWithin: readonly string[];
}

/** תוצאת סריקה של יחידת זרימה אחת (גוף המסמך, או גוף הערה אחת). */
export interface BracketScan {
  /** הזרם שנסרק. */
  readonly stream: ContentStream;
  /** מזהה ההערה — רק כשמדובר בגוף הערה. */
  readonly noteId?: string;
  /** זוגות ברמה העליונה (בסדר הופעה). */
  readonly roots: readonly BracketPairNode[];
  /** כל הזוגות שטוח (בסדר הופעה) — כולל מעומק חריג; לחיפוש מהיר. */
  readonly pairs: readonly BracketPairNode[];
  readonly issues: readonly BracketIssue[];
  /** מצב לכל בלוק בזרימה — בסדר הזרימה. */
  readonly blockStates: readonly BracketBlockState[];
  /** עומק קינון כולל מרבי שנצפה. */
  readonly maxDepth: number;
}

/** תוצאת סריקה מלאה: גוף + כל גופי ההערות. */
export interface BracketScanResult {
  readonly body: BracketScan;
  readonly notes: readonly { readonly noteId: string; readonly kind: NoteKind; readonly scan: BracketScan }[];
}

// ─────────────────────────── קידוד מזהים ───────────────────────────

const BRACKET_ID_PREFIX = 'bracket:v1';

function encodeIdSegment(value: string): string {
  return value.replace(/%/g, '%25').replace(/\|/g, '%7C');
}

function bracketId(
  documentId: string,
  stream: ContentStream,
  kind: BracketKind,
  openStart: number,
  closeStart: number | undefined,
): string {
  const id =
    `${BRACKET_ID_PREFIX}|${encodeIdSegment(documentId)}|${stream}|${kind}` +
    `|${openStart}|${closeStart === undefined ? 'unclosed' : String(closeStart)}`;
  if (id.length > 512) {
    throw new ContentModelError(
      'errors.bracket.ID_DERIVATION_TOO_LONG',
      { length: String(id.length) },
      'מזהה זוג הסוגריים חורג מ־512 תווים',
    );
  }
  return id;
}

// ─────────────────────────── פנים הסריקה ───────────────────────────

/** פתיחה בזמן הסריקה — מזהה סופי נקבע בסגירה או בסיום (unclosed). */
interface OpenEntry {
  readonly kind: BracketKind;
  readonly openStart: number;
  readonly openBlockOrdinal: number;
  readonly depth: number; // עומק כולל בעת הפתיחה
  finalId: string;
  children: BracketPairNode[];
}

/** מצב בלוק בזמן הסריקה — הפניות; מומר למזהים בהקפאה הסופית. */
interface MutableBlockState {
  readonly blockId: NodeId;
  readonly openAtStart: OpenEntry[];
  openAtEnd: OpenEntry[];
  readonly openedWithin: OpenEntry[];
  readonly closedWithin: string[];
}

/**
 * סריקת סוגריים מלאה של מסמך: גוף המסמך כזרימה אחת רציפה (בלוקים בסדר
 * המסמך, כולל ילדים — סדר ה־inline נשמר), וגוף כל הערה כזרימה עצמאית
 * (הערה מסודרת בנפרד — סוגריה חייבים להיסגר בתוכה או להיות מדווחים).
 * טהורה: אותו מסמך ← אותה תוצאה, תמיד.
 */
export function scanBrackets(doc: TorahDocument): BracketScanResult {
  const bodyBlocks: ContentBlock[] = [];
  const walkBody = (blocks: readonly ContentBlock[]): void => {
    for (const block of blocks) {
      bodyBlocks.push(block);
      if (block.children !== undefined) walkBody(block.children);
    }
  };
  for (const part of doc.parts) {
    for (const siman of part.simanim) walkBody(siman.blocks);
  }
  const body = scanUnit(bodyBlocks, 'body', doc.documentId);

  const notes: { noteId: string; kind: NoteKind; scan: BracketScan }[] = [];
  const noteKinds: readonly { kind: NoteKind; list: readonly NoteEntry[] }[] = [
    { kind: 'footnote', list: doc.notes.footnotes },
    { kind: 'endnote', list: doc.notes.endnotes },
    { kind: 'sidenote', list: doc.notes.sidenotes },
    { kind: 'editorial', list: doc.notes.editorial },
  ];
  for (const { kind, list } of noteKinds) {
    for (const note of list) {
      const noteBlocks: ContentBlock[] = [];
      const walkNote = (blocks: readonly ContentBlock[]): void => {
        for (const block of blocks) {
          noteBlocks.push(block);
          if (block.children !== undefined) walkNote(block.children);
        }
      };
      walkNote([note.block]);
      notes.push({
        noteId: note.noteId,
        kind,
        scan: scanUnit(noteBlocks, streamOfNote(kind), doc.documentId, note.noteId),
      });
    }
  }
  return Object.freeze({ body, notes: Object.freeze(notes) });
}

function streamOfNote(kind: NoteKind): ContentStream {
  switch (kind) {
    case 'footnote': return 'footnote';
    case 'endnote': return 'endnote';
    case 'sidenote': return 'sidenote';
    case 'editorial': return 'body'; // תוכן הערת עורך נשמר בזרם הגוף — סריקה עצמאית לכל הערה
  }
}

function scanUnit(blocks: readonly ContentBlock[], stream: ContentStream, documentId: string, noteId?: string): BracketScan {
  const pairs: BracketPairNode[] = [];
  const roots: BracketPairNode[] = [];
  const issues: BracketIssue[] = [];
  const states: MutableBlockState[] = [];
  const flowBlockIds: NodeId[] = []; // מוזן בתחילת כל בלוק — לחיתוך blockIds מדויק
  // מחסנית פר־סוג — בדיוק כמו הישן (ספירת עומק תו-בודד לכל סוג)
  const stacks: Record<BracketKind, OpenEntry[]> = { round: [], square: [] };
  let maxDepth = 0;

  const allOpen = (): OpenEntry[] => {
    const merged = [...stacks.round, ...stacks.square];
    merged.sort((a, b) => a.openStart - b.openStart || a.kind.localeCompare(b.kind));
    return merged;
  };
  /** הפתיחה המקיפה הקרובה — הפתיחה הפתוחה עם המיקום הגדול ביותר לפני pos (כל הסוגים). */
  const enclosingOpen = (pos: number): OpenEntry | undefined => {
    let best: OpenEntry | undefined;
    for (const entry of allOpen()) {
      if (entry.openStart < pos && (best === undefined || entry.openStart > best.openStart)) best = entry;
    }
    return best;
  };

  for (let blockOrdinal = 0; blockOrdinal < blocks.length; blockOrdinal = blockOrdinal + 1) {
    const block = blocks[blockOrdinal] as ContentBlock;
    flowBlockIds.push(block.id);
    const state: MutableBlockState = {
      blockId: block.id,
      openAtStart: allOpen(),
      openAtEnd: [],
      openedWithin: [],
      closedWithin: [],
    };
    states.push(state);

    for (const item of block.inline) {
      if (item.kind !== 'text') continue; // הפניות/עוגנים/סימונים — אין בהם תווי סוגריים
      for (const atom of item.atoms) {
        const text = atom.text;
        const base = atom.source.startUtf16;
        for (let i = 0; i < text.length; i = i + 1) {
          const ch = text[i] as string;
          for (const def of BRACKET_PAIRS) {
            if (ch === def.open) {
              const depth = stacks.round.length + stacks.square.length + 1;
              const entry: OpenEntry = {
                kind: def.kind,
                openStart: base + i,
                openBlockOrdinal: blockOrdinal,
                depth,
                finalId: '',
                children: [],
              };
              stacks[def.kind].push(entry);
              if (depth > maxDepth) maxDepth = depth;
              if (depth <= MAX_BRACKET_DEPTH) state.openedWithin.push(entry);
              continue;
            }
            if (ch === def.close) {
              const entry = stacks[def.kind].pop();
              if (entry === undefined) {
                // סגירה בלי פתיחה — דיווח בלבד (§10.4: לא "מתוקן" בשקט)
                issues.push({
                  kind: 'stray-close',
                  bracketKind: def.kind,
                  span: makeSourceSpan(documentId, stream, base + i, base + i + 1),
                  detail: `סוגר סגירה '${def.close}' ללא פתיחה מתאימה באותו סוג`,
                });
                continue;
              }
              entry.finalId = bracketId(documentId, stream, def.kind, entry.openStart, base + i);
              const node: BracketPairNode = Object.freeze({
                id: entry.finalId,
                kind: entry.kind,
                depth: entry.depth,
                openSpan: makeSourceSpan(documentId, stream, entry.openStart, entry.openStart + 1),
                closeSpan: makeSourceSpan(documentId, stream, base + i, base + i + 1),
                blockIds: Object.freeze(flowBlockIds.slice(entry.openBlockOrdinal, blockOrdinal + 1)),
                children: Object.freeze(entry.children),
              });
              pairs.push(node);
              const parent = enclosingOpen(entry.openStart);
              if (parent !== undefined) parent.children.push(node);
              else roots.push(node);
              if (node.depth <= MAX_BRACKET_DEPTH) state.closedWithin.push(node.id);
              continue;
            }
          }
        }
      }
    }
    state.openAtEnd = allOpen();
  }

  // פתיחות שלא נסגרו — דיווח בלבד; הצמדה לעץ מבפנים החוצה (הילדים נבנים
  // לפני שההורה קופא)
  const remaining = allOpen();
  for (let i = remaining.length - 1; i >= 0; i = i - 1) {
    const entry = remaining[i] as OpenEntry;
    entry.finalId = bracketId(documentId, stream, entry.kind, entry.openStart, undefined);
    const node: BracketPairNode = Object.freeze({
      id: entry.finalId,
      kind: entry.kind,
      depth: entry.depth,
      openSpan: makeSourceSpan(documentId, stream, entry.openStart, entry.openStart + 1),
      blockIds: Object.freeze(flowBlockIds.slice(Math.min(entry.openBlockOrdinal, Math.max(flowBlockIds.length - 1, 0)))),
      children: Object.freeze(entry.children),
    });
    pairs.push(node);
    // הורה = הפתיחה הפתוחה עם המיקום הגדול ביותר לפני הפתיחה שלי
    let parent: OpenEntry | undefined;
    for (let j = i - 1; j >= 0; j = j - 1) {
      const cand = remaining[j] as OpenEntry;
      if (cand.openStart < entry.openStart) { parent = cand; break; }
    }
    if (parent !== undefined) parent.children.push(node);
    else roots.push(node);
    issues.push({
      kind: 'unclosed-open',
      bracketKind: entry.kind,
      span: node.openSpan,
      pairId: entry.finalId,
      detail: `סוגר פתיחה '${entry.kind === 'round' ? '(' : '['}' לא נסגר עד סוף הזרימה`,
    });
  }

  // הקפאה סופית — המרת ההפניות למזהים (כולם כבר נקבעו: סגורים וגם לא-סגורים)
  const blockStates: BracketBlockState[] = states.map((s) => Object.freeze({
    blockId: s.blockId,
    openAtStart: Object.freeze(s.openAtStart.map((e) => e.finalId)),
    openAtEnd: Object.freeze(s.openAtEnd.map((e) => e.finalId)),
    openedWithin: Object.freeze(s.openedWithin.map((e) => e.finalId)),
    closedWithin: Object.freeze(s.closedWithin),
  }));

  return Object.freeze({
    stream,
    ...(noteId !== undefined ? { noteId } : {}),
    roots: Object.freeze(roots),
    pairs: Object.freeze(pairs),
    issues: Object.freeze(issues),
    blockStates: Object.freeze(blockStates),
    maxDepth,
  });
}

// ─────────────────────────── שאילתות למנוע (בלי regex) ───────────────────────────

/** זוגות שחוצים יותר מבלוק אחד — המקרים שמדיניות חציית העמוד (שלב 65) חייבת להכיר. */
export function crossingPairs(scan: BracketScan): readonly BracketPairNode[] {
  return scan.pairs.filter((p) => p.blockIds.length > 1);
}

/** מצב הסוגריים ביציאה מבלוק נתון — ‎undefined‎ אם הבלוק אינו בזרימה. */
export function blockExitState(scan: BracketScan, blockId: NodeId): BracketBlockState | undefined {
  return scan.blockStates.find((s) => s.blockId === blockId);
}

/** האם הזרימה מסתיימת בתוך סוגריים פתוחים (המשך לזרימה/מסמך הבא). */
export function endsInsideBracket(scan: BracketScan): boolean {
  const last = scan.blockStates.at(-1);
  return last !== undefined && last.openAtEnd.length > 0;
}

/** אימות מבני של תוצאת סריקה — לבדיקות ולביקורת (שלב 21 יצרוך). */
export function isBracketScanResult(value: unknown): value is BracketScanResult {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Partial<BracketScanResult>;
  if (v.body === undefined || !Array.isArray(v.notes)) return false;
  const b = v.body;
  if (!Array.isArray(b.pairs) || !Array.isArray(b.issues) || !Array.isArray(b.blockStates)) return false;
  for (const p of b.pairs) {
    if (typeof p.id !== 'string' || !isSourceSpan(p.openSpan)) return false;
    if (p.closeSpan !== undefined && !isSourceSpan(p.closeSpan)) return false;
  }
  return true;
}
