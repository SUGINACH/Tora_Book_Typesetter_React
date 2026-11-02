/**
 * candidates.ts — מחולל מועמדי עמודים בגבולות חוקיים בלבד (שלב 52; פרק ז/M6).
 *
 * אסמכתא: אפיון §9.1 ("המנוע מייצר candidates רק בגבולות חוקיים: בין קווי
 * פסקה, סוף בלוק אטומי, barrier של H3 או page opener. אין 'חצי מהשורות'
 * ואין פירוק note-body כאילו היה גוף רגיל"), §9.3 (סדר חישוב של עמוד),
 * §10.3 (גוף הערה אטומי כברירת מחדל), §10.4 (סוגריים — מצב המחסנית
 * במצב; אין protectParens), §10.1 (ליווי כותרות — המנגנון כאן, הערכים
 * ב-M7), §6.6 (אילוץ קשה נפסל לפני תמחור — "אין עמוד זול שאינו חוקי").
 *
 * עקרונות (שער השלב: "candidates פסולים לא מגיעים ל־comparator; אין
 * אובדן תוכן בין candidates"):
 *   1. המחולל מקבל את הבלוקים **לאחר שבירת השורות** (פלט שלב 47) כקלט
 *      מובנה — PaginatedBlock/PaginatedLine — ומייצר הרחבות לחיפוש של
 *      שלב 51: מילוי הטור הנוכחי עד גבול חוקי + מעבר טור/עמוד.
 *   2. **גבולות חוקיים בלבד**: סוף בלוק תמיד חוקי; גבול בין-קווי בתוך
 *      פסקה חוקי רק אם המדיניות מתירה (ברירת מחדל: כן) והבלוק אינו
 *      אטום; בלוק אטום (note-body כברירת מחדל, כותרות, תיבות) — רק
 *      סופו גבול חוקי; מחסום ליווי כותרת (headingEscortLines; ברירת
 *      מחדל 0 — ערכי היעד ב-M7; המנגנון כאן ונבדק).
 *   3. **feasibility לפני cost** (§6.6): קו שאינו נכנס לנותר בטור פשוט
 *      אינו מוצב — הגבול אינו נוצר. המקרה הפתולוגי היחיד — קו של גוף
 *      רגיל שגבוה מטור ריק כולו — מקבל מועמד חירום יחיד עם
 *      fallbackSeverity HIGH (רכיב 1 של ADR-004) ו־fallbackCode
 *      EMERGENCY_LINE: הקו מוצב, הגלישה היא ממצא — לא הצלחה שקטה.
 *      בלוק אטום שאינו נכנס לטור ריק — אין מועמד חוקי כלל (§10.3:
 *      דחיית עוגן/פיצול/שגיאה — הכרעת מדיניות ב-ADR-005 שלב 55).
 *   4. **אין אובדן תוכן**: הגבולות מכסים את כל המשכי הזרימה — הגבול
 *      האחרון לפני מילוי הטור נוצר תמיד; כל קו מוצב בדיוק פעם אחת
 *      לאורך כל מסלול; הפניות הערות נאספות עם הקו שלהן (pend); סוגריים
 *      חוצי-גבול מתועדים במצב (bracketOpen/bracketClose) — חציית עמוד
 *      חוקית מעצם המודל (§10.4).
 *   5. המדיניות מוזרקת (LegalPageBreakPolicy) — הליבה אינה מכירה H2
 *      (§10); ברירות המחדל נעולות כאן ומתועדות.
 */
import { asLu, type LayoutUnit } from '@tora/layout-api';
import { LayoutEngineError } from '../errors.js';
import {
  advanceCursor,
  bracketClose,
  bracketOpen,
  consumeRegion,
  openPage,
  parseCursor,
  pendFootnote,
  pendSidenote,
  placeFootnotes,
  placeSidenotes,
  switchColumn,
  type PaginationState,
  type PaginationTransition,
} from './state.js';
import { initialRemainingByRegion, type PageTemplateSet } from './templates.js';
import {
  type NoteBodySpec,
  noteBodyIssues,
  reserveNote,
  resolveNotePolicy,
  splitNoteBodySpec,
  type NoteReservationPolicy,
} from './notes.js';
import type { PageCandidateSource, PageExpansion, PageQualityVector } from './search.js';
import { legacyHeadingBehaviorOf, type HeadingFlowBehavior } from './heading-defaults.js';

// ─────────────────────────── מודל הקלט ───────────────────────────

/** קו שנשבר מראש — יחידת ההצבה של העימוד (מוכן על ידי המנוע מפלט שלב 47). */
export interface PaginatedLine {
  /** מזהה קנוני — ייחודי בזרימה. */
  readonly id: string;
  /** גובה הקו ב-LU (שורת הגוף; שבירת השורות כבר נעשתה). */
  readonly heightLu: LayoutUnit;
  /** הפניות הערות שוליים שהקו נושא (סמנים) — ההערה נעשית ממתינה כשהקו מוצב. */
  readonly footnoteRefs: readonly string[];
  /** הפניות הערות צד (H7) שהקו נושא. */
  readonly sidenoteRefs: readonly string[];
  /**
   * אירועי סוגריים בקו זה (מעץ הסוגריים של הפרסר; שלב 19) — פתיחות
   * וסגירות. המחולל מזרים אותם למצב כשהקו מוצב; חציית עמוד חוקית
   * מעצם המודל (§10.4 — המחסנית במצב, אין protectParens).
   */
  readonly bracketOpens?: readonly { pairId: string; kind: 'round' | 'square' }[];
  readonly bracketCloses?: readonly string[];
}

/** תפקיד בלוק בזרימת העימוד. */
export type FlowBlockRole = 'body' | 'heading' | 'note-body' | 'custom-box' | 'toc-entry';

/** בלוק בזרימת העימוד — קווים גמורים + גורמי חוקיות. */
export interface PaginatedBlock {
  readonly blockId: string;
  readonly role: FlowBlockRole;
  /** לכותרות בלבד (headingLevel של המודל). */
  readonly headingLevel?: number;
  readonly lines: readonly PaginatedLine[];
  /**
   * אטום — אסור לחצות בין טורים/עמודים: רק סוף הבלוק גבול חוקי
   * (§9.1). note-body אטום כברירת מחדל (§10.3) גם אם הדגל לא הוגדר.
   */
  readonly atomic?: boolean;
}

/**
 * מדיניות גבולות חוקיים — מוזרקת; הליבה אינה מכירה H2 (§10).
 * כל ברירת מחדל מתועדת ונעולה כאן.
 */
export interface LegalPageBreakPolicy {
  /** מותר לשבור טור/עמוד בתוך פסקה (בין קווים)? ברירת מחדל: כן. */
  readonly allowIntraParagraphBreaks?: boolean;
  /**
   * מספר קווי ליווי מינימום אחרי כותרת באותו טור (§10.1) — גבול שנוצר
   * פחות מ-K קווים אחרי כותרת אינו חוקי. ברירת מחדל 0 (כבוי; הערכים
   * נקבעים ב-M7); המנגנון כאן ונבדק.
   */
  readonly headingEscortLines?: number;
  /** note-body אטום (§10.3)? ברירת מחדל: כן. */
  readonly atomicNoteBodies?: boolean;
  /**
   * צעד הילוך על גבולות בין-קוויים — מונע פיצוץ מועמדים בפסקאות
   * ארוכות; הכיסוי נשמר (הגבול האחרון לפני מילוי הטור תמיד נוצר).
   * ברירת מחדל: 1 (כל גבול).
   */
  readonly boundaryStride?: number;
}

export const DEFAULT_LEGAL_PAGE_BREAK_POLICY: Readonly<Required<LegalPageBreakPolicy>> = Object.freeze({
  allowIntraParagraphBreaks: true,
  headingEscortLines: 0,
  atomicNoteBodies: true,
  boundaryStride: 1,
});

export interface CandidateGeneratorInput {
  /** הבלוקים בסדר הזרימה (allBlocks של המסמך). */
  readonly blocks: readonly PaginatedBlock[];
  /** סט התבניות (שלב 50). */
  readonly templates: PageTemplateSet;
  /** סוג העמודים בזרימה זו. */
  readonly pageKind: 'body' | 'toc' | 'notes';
  readonly policy?: LegalPageBreakPolicy;
  /**
   * גופי ההערות המדודים (שלב 53; ADR-005) — כשמסופק, כל הפניית הערה
   * בקווים נצרבת מיד בתוך הליכת הגבולות (שריון בחיפוש; §9.3#5):
   * גובה ההערה + הפרדה מצמצמים את המקום לגוף; הערה שאינה נכנסת —
   * דחיית עוגן; פיצול לפי המדיניות. כשחסר — התנהגות שלב 52 (pend בלבד).
   */
  readonly noteBodies?: ReadonlyMap<string, NoteBodySpec>;
  readonly notePolicy?: NoteReservationPolicy;
  /**
   * התנהגות כותרת לפי רמה — מוזרק (שלב 58; §10.1: "הליבה אינה יודעת מהו
   * H2"). ברירת מחדל: legacy — H0/H1/H2 page-opener, H3 barrier, H4–H6
   * inline, H7 sidenote-stream. הזרקה מ-policy-torah מחליפה את המספרים
   * הקשיחים; אין עריכת מנוע לכותרת חדשה.
   */
  readonly headingBehaviorOf?: (level: number) => {
    readonly flowRole: 'page-opener' | 'full-width-barrier' | 'inline' | 'sidenote-stream';
    readonly forcePageBreak: boolean;
    readonly escortLines: number;
    /** תבנית העמוד שהפותח פותח (§10.1 H0/H1; שלב 59–60) — undefined = סוג הזרימה. */
    readonly forcePageTemplate?: 'main-shaar' | 'back-shaar' | 'sub-shaar' | 'toc' | 'body' | 'notes';
    /** הפותחת חייבת recto (§10.1 H1 parity; שלב 60) — עמוד ריק לפני verso. */
    readonly startOnRecto?: boolean;
    /** ריווח ועיטורי פתיחה (§10.1 H2; שלב 61) — ממודדים מהגאומטריה והקווים. */
    readonly openerSpacing?: {
      readonly spaceBeforePct: number;
      readonly ornamentTopEm: number;
      readonly ornamentBottomEm: number;
    };
  };
}

// ─────────────────────────── אימות קלט ───────────────────────────

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0;
}

/** אימות קלט המחולל — רשימת בעיות (ריקה = תקין). */
export function candidateInputIssues(input: CandidateGeneratorInput): string[] {
  const issues: string[] = [];
  if (typeof input !== 'object' || input === null || !Array.isArray(input.blocks)) { issues.push('blocks'); return issues; }
  if (input.pageKind !== 'body' && input.pageKind !== 'toc' && input.pageKind !== 'notes') issues.push('pageKind');
  if (input.templates === null || typeof input.templates !== 'object' || typeof input.templates.for !== 'function') issues.push('templates');
  const seenBlocks = new Set<string>();
  const seenLines = new Set<string>();
  for (let b = 0; b < input.blocks.length; b++) {
    const blk = input.blocks[b] as Record<string, unknown> | null;
    if (typeof blk !== 'object' || blk === null) { issues.push(`blocks[${b}]`); continue; }
    if (typeof blk.blockId !== 'string' || blk.blockId.length === 0) { issues.push(`blocks[${b}].blockId`); continue; }
    if (seenBlocks.has(blk.blockId)) issues.push(`blocks[${b}].blockId:duplicate`);
    seenBlocks.add(blk.blockId as string);
    if (!['body', 'heading', 'note-body', 'custom-box', 'toc-entry'].includes(String(blk.role))) issues.push(`blocks[${b}].role`);
    if (blk.role === 'heading' && !Number.isSafeInteger(blk.headingLevel)) issues.push(`blocks[${b}].headingLevel`);
    if (!Array.isArray(blk.lines) || (blk.lines as unknown[]).length === 0) { issues.push(`blocks[${b}].lines:empty`); continue; }
    for (let l = 0; l < (blk.lines as unknown[]).length; l++) {
      const line = (blk.lines as unknown[])[l] as Record<string, unknown> | null;
      const ll = `blocks[${b}].lines[${l}]`;
      if (typeof line !== 'object' || line === null) { issues.push(`${ll}`); continue; }
      if (typeof line.id !== 'string' || line.id.length === 0) { issues.push(`${ll}.id`); continue; }
      if (seenLines.has(line.id)) issues.push(`${ll}.id:duplicate`);
      seenLines.add(line.id as string);
      if (!isPositiveInt(line.heightLu)) issues.push(`${ll}.heightLu`);
      for (const field of ['footnoteRefs', 'sidenoteRefs'] as const) {
        const arr = line[field] as readonly unknown[] | undefined;
        if (arr !== undefined) {
          if (!Array.isArray(arr) || arr.some((ref) => typeof ref !== 'string' || ref.length === 0 || ref.length > 256)) {
            issues.push(`${ll}.${field}`);
          }
        }
      }
      if (line.bracketOpens !== undefined) {
        const arr = line.bracketOpens as readonly unknown[];
        if (!Array.isArray(arr) || arr.some((o) => typeof o !== 'object' || o === null
          || typeof (o as Record<string, unknown>).pairId !== 'string' || ((o as Record<string, unknown>).kind !== 'round' && (o as Record<string, unknown>).kind !== 'square'))) {
          issues.push(`${ll}.bracketOpens`);
        }
      }
      if (line.bracketCloses !== undefined && (!Array.isArray(line.bracketCloses) || (line.bracketCloses as readonly unknown[]).some((c) => typeof c !== 'string' || (c as string).length === 0))) {
        issues.push(`${ll}.bracketCloses`);
      }
    }
  }
  // התנהגות כותרות מוזרקת (שלב 58) — אימות מבני כולל forcePageTemplate
  // (שלב 59): התבנית הנדרשת חייבת להיות סוג עמוד לגיטימי של הזרימה
  if (input.headingBehaviorOf !== undefined) {
    const levels = new Set<number>();
    for (const blk of input.blocks) {
      if (blk.role === 'heading' && blk.headingLevel !== undefined) levels.add(blk.headingLevel);
    }
    for (let level = 0; level <= 7; level++) levels.add(level);
    for (const level of levels) {
      const b = input.headingBehaviorOf(level);
      if (typeof b !== 'object' || b === null
        || !['page-opener', 'full-width-barrier', 'inline', 'sidenote-stream'].includes(String(b.flowRole))
        || typeof b.forcePageBreak !== 'boolean'
        || !Number.isSafeInteger(b.escortLines) || b.escortLines < 0) {
        issues.push(`headingBehaviorOf(${level})`);
        continue;
      }
      if (b.forcePageTemplate !== undefined) {
        if (!['main-shaar', 'back-shaar', 'sub-shaar', 'toc', 'body', 'notes'].includes(String(b.forcePageTemplate))) {
          issues.push(`headingBehaviorOf(${level}).forcePageTemplate`);
        } else if (b.flowRole !== 'page-opener') {
          // תבנית כפויה תקפה לפותחי-עמוד בלבד (§10.1) — הרחבה שאינה פותחת
          // עמוד אינה יכולה לדרוש תבנית
          issues.push(`headingBehaviorOf(${level}).forcePageTemplate:not-opener`);
        }
      }
      if (b.startOnRecto !== undefined && typeof b.startOnRecto !== 'boolean') {
        issues.push(`headingBehaviorOf(${level}).startOnRecto`);
      } else if (b.startOnRecto === true && b.flowRole !== 'page-opener') {
        // כפיית recto תקפה לפותחי-עמוד בלבד (§10.1 parity)
        issues.push(`headingBehaviorOf(${level}).startOnRecto:not-opener`);
      }
      const sp = b.openerSpacing as { spaceBeforePct?: unknown; ornamentTopEm?: unknown; ornamentBottomEm?: unknown } | undefined;
      if (sp !== undefined) {
        const valid = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100;
        if (!valid(sp.spaceBeforePct) || !valid(sp.ornamentTopEm) || !valid(sp.ornamentBottomEm)) {
          issues.push(`headingBehaviorOf(${level}).openerSpacing`);
        } else if (b.flowRole !== 'page-opener') {
          // ריווח פתיחה תקף לפותחי-עמוד בלבד (§10.1 H2)
          issues.push(`headingBehaviorOf(${level}).openerSpacing:not-opener`);
        }
      }
    }
  }
  return issues;
}

// ─────────────────────────── מיפוי זרימה ───────────────────────────

interface FlowPosition {
  readonly blockIndex: number;
  readonly lineIndex: number;
}

interface FlowMap {
  readonly blocks: readonly PaginatedBlock[];
  readonly blockIndexOf: ReadonlyMap<string, number>;
}

function buildFlowMap(blocks: readonly PaginatedBlock[]): FlowMap {
  const blockIndexOf = new Map<string, number>();
  blocks.forEach((b, i) => blockIndexOf.set(b.blockId, i));
  return { blocks, blockIndexOf };
}

function isAtomicBlock(blk: PaginatedBlock, policy: Required<LegalPageBreakPolicy>): boolean {
  return blk.atomic === true || blk.role === 'heading' || blk.role === 'custom-box'
    || (blk.role === 'note-body' && policy.atomicNoteBodies);
}

/** המרת סמן מצב ← מיקום זרימה; null = קץ המסמך. */
function flowPositionOf(map: FlowMap, state: PaginationState): FlowPosition | null {
  const cursor = parseCursor(state.contentCursor);
  const blockIndex = map.blockIndexOf.get(cursor.blockId);
  if (blockIndex === undefined) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'candidates', reason: `unknown block ${cursor.blockId}` }, 'סמן התוכן מצביע על בלוק שאינו בזרימה');
  }
  const blk = map.blocks[blockIndex]!;
  if (cursor.fragmentIndex >= blk.lines.length) {
    const next = blockIndex + 1;
    if (next >= map.blocks.length) return null;
    return { blockIndex: next, lineIndex: 0 };
  }
  return { blockIndex, lineIndex: cursor.fragmentIndex };
}

/** הקו במיקום — או null מחוץ לזרימה. */
function lineAt(map: FlowMap, pos: FlowPosition): { line: PaginatedLine; block: PaginatedBlock } | null {
  if (pos.blockIndex >= map.blocks.length) return null;
  const block = map.blocks[pos.blockIndex]!;
  if (pos.lineIndex >= block.lines.length) return null;
  return { line: block.lines[pos.lineIndex]!, block };
}

/** המיקום הבא אחרי הצבת הקו במיקום (עובר בלוקים). */
function nextPosition(map: FlowMap, pos: FlowPosition): FlowPosition {
  const blk = map.blocks[pos.blockIndex]!;
  if (pos.lineIndex + 1 >= blk.lines.length) {
    return { blockIndex: pos.blockIndex + 1, lineIndex: 0 };
  }
  return { blockIndex: pos.blockIndex, lineIndex: pos.lineIndex + 1 };
}

// ─────────────────────────── בניית גבולות חוקיים ───────────────────────────

interface BoundaryCandidate {
  /** מיקום הזרימה שאליו מגיע הסמן (הגבול). */
  readonly end: FlowPosition;
  /** סמן היעד: בלוק + אינדקס קו (קץ המסמך — אחרי הקו האחרון של הבלוק האחרון). */
  readonly cursorBlockId: string;
  readonly cursorFragment: number;
  /** גובה כולל שהוצב. */
  readonly heightLu: number;
  /** חירום: קו גולש בטור ריק (גוף רגיל בלבד). */
  readonly emergency: boolean;
  readonly footnoteRefs: readonly string[];
  readonly sidenoteRefs: readonly string[];
  readonly bracketOpens: readonly { pairId: string; kind: 'round' | 'square' }[];
  readonly bracketCloses: readonly string[];
  readonly lineCount: number;
  /** ההערות שהוצבו בגוש ההערות עד לגבול זה (כולל המשכים שהיו ממתינים). */
  readonly notesPlacedIds: readonly string[];
  /** גובה שנצרב בגוש ההערות עד לגבול זה (כולל הפרדה כשנצרבה). */
  readonly notesPlacedHeightLu: number;
  /** פיצולים שבוצעו עד לגבול זה: מזהה ההמשך ← מפרט ההמשך. */
  readonly noteSplits: readonly { readonly continuationId: string; readonly spec: NoteBodySpec }[];
  /** הפניות שנדחו (דחיית עוגן) — ההליכה נעצרה לפני הקו הנושא אותן. */
  readonly deferredRefs: readonly string[];
  /** ── הערות צד (H7; שלב 54) ── */
  /** הערות צד שהוצבו באזור החיצוני עד לגבול זה (FIFO לפי מקור). */
  readonly sidenotesPlacedIds: readonly string[];
  /** גובה שנצרב באזור החיצוני עד לגבול זה. */
  readonly sidenotesPlacedHeightLu: number;
  /** הערות צד עקורות (ממתינות לעמוד הבא) עד לגבול זה — כולל הממתינות מהעבר. */
  readonly sidenotesDisplaced: readonly string[];
  /** ── מחסום H3 (שלב 56; §9.3#6; §10.1) ── */
  /**
   * מחסום H3 — הכותרת הרוחבית חוצה את שני הטורים: הגבול הזה מציב את
   * הטקסט שלפניו בטור הנוכחי ואז סוגר את שני הטורים עד תחתית הכותרת
   * (barrier); הטקסט שאחריה ממשיך בפס חדש מתחת. ההכרעה מה למלא לפני
   * הכותרת — בחיפוש, דרך עלות הרווחים (איזון לפני הכותרת).
   */
  readonly h3Barrier?: { readonly heightLu: number };
  /** ── פותח עמוד (שלב 59; §10.1 H0 — forcePageTemplate) ──
   * הגבול מסתיים בכותרת פותחת-עמוד: ההרחבה פותחת עמוד חדש בתבנית
   * הנדרשת (forcePageTemplate של הרמה; ברירת מחדל — סוג הזרימה) והכותרת
   * תוצב בראשו בהרחבה הבאה. הפותחת אינה מוצבת לעולם באמצע עמוד —
   * ההליכה נעצרת לפניה (גם בטור חצי-מלא); ההחלטה בתוך ההרחבה (אין
   * post-pass). גבול ריק (שום קו לפניה — למשל אחרי מחסום H3) רק פותח
   * את העמוד ואינו מקדם את הסמן (ההתקדמות היא פתיחת העמוד).
   */
  readonly pageOpener?: { readonly level: number };
}

/** הקשר שריון הערות להליכת הגבולות (שלב 53; ADR-005) — null כשאין גופי הערות. */
interface NotesWalkContext {
  readonly policy: Required<NoteReservationPolicy>;
  /** גופי הערות (כולל המשכים שנוצרו בעבר — המחולל מרחיב את המפה). */
  readonly bodies: ReadonlyMap<string, NoteBodySpec>;
  /** תקציד אזור ההערות של עמוד ריק (להכרעת fail/split). */
  readonly emptyBudgetLu: number;
  /** הנותר בגוש ההערות של העמוד הנוכחי (מהמצב). */
  readonly notesRemainingLu: number;
  /** האם כבר נצרבו הערות בעמוד זה (ההפרדה כבר נצרבה)? */
  readonly notesAlreadyOnPage: boolean;
  /** המשכים ממתינים בתחילת ההליכה — חייבים להיצרב ראשונים. */
  readonly pendingAtStart: readonly string[];
  /** ── הערות צד (H7; שלב 54; §10.3) ── */
  /** הנותר באזור החיצוני של העמוד (מהמצב) — אפס כשאין אזור. */
  readonly outerRemainingLu: number;
  /** תקציד אזור חיצוני של עמוד ריק. */
  readonly emptyOuterBudgetLu: number;
  /** הערות צד ממתינות בתחילת ההליכה (עקורות מהעמוד הקודם — FIFO). */
  readonly pendingSidenotesAtStart: readonly string[];
  /** ── כריכת הערות בין טורים (שלב 57; ADR-005 §3) ── */
  /** גובה הגוף של העמוד (H) — לאילוץ העמודה האחרת. */
  readonly pageBodyHeightLu: number;
  /** השימוש בטור האחר של העמוד (מהמצב) — גוש ההערות צורב משני הטורים. */
  readonly otherColumnUsedLu: number;
  /** ההערות שכבר נצרבו בעמוד זה (מהמצב) — חלק מתקציד העמוד כולו. */
  readonly notesUsedAtStartLu: number;
}

/**
 * בניית הגבולות החוקיים למילוי הטור הנוכחי: הליכה קדימה מהסמן כל עוד
 * קווים נכנסים לנותר; כל גבול חוקי הוא מועמד. הליכה דרך בלוק אטום
 * ממשיכה עד סופו — גבולות בתוכו אינם נוצרים; אם הטור מתמלא באמצעו,
 * הגבול האחרון שנוצר הוא לפני תחילתו (הבלוק לא הוצב חלקית לעולם).
 * מועמד חירום יחיד כשאף קו של גוף רגיל אינו נכנס לטור ריק.
 *
 * שריון הערות (שלב 53; ADR-005; §9.3#5): כשהקשר ההערות מסופק, קו
 * הנושא הפניית הערה מצרב את גובה ההערה (+ הפרדה פעם אחת) מהמקום
 * הפנוי **באותה בדיקת התאמה** — הכל או כלום לקו עם מספר הפניות;
 * הערה שאינה נכנסת ⇒ דחיית עוגן (ההליכה נעצרת לפני הקו); פיצול
 * לפי המדיניות בגבולות קווים עם המשך קנוני. המשכים ממתינים מהמצב
 * נצרבים ראשונים בגוש ההערות של העמוד.
 */
function buildBoundaries(
  map: FlowMap,
  state: PaginationState,
  remainingLu: number,
  policy: Required<LegalPageBreakPolicy>,
  notesCtx: NotesWalkContext | null,
  headingBehaviorOf: (level: number) => HeadingFlowBehavior,
  columnHeightLu: number,
  flowKind: 'body' | 'toc' | 'notes',
): BoundaryCandidate[] {
  const out: BoundaryCandidate[] = [];
  let pos = flowPositionOf(map, state);
  if (pos === null) return out;
  // פותח-עמוד במיקום זרימה? (שלב 59; §10.1) — ההתנהגות המוזרקת קובעת,
  // לא הרמה; רק בראש הבלוק (fragment 0)
  const pageOpenerLevelAt = (p: FlowPosition): number | undefined => {
    if (p.lineIndex !== 0) return undefined;
    const blk = map.blocks[p.blockIndex];
    if (blk === undefined || blk.role !== 'heading' || blk.headingLevel === undefined) return undefined;
    return headingBehaviorOf(blk.headingLevel).flowRole === 'page-opener' ? blk.headingLevel : undefined;
  };
  let used = 0;
  const foot: string[] = [];
  const side: string[] = [];
  const opens: { pairId: string; kind: 'round' | 'square' }[] = [];
  const closes: string[] = [];
  let linesSinceHeading = Number.MAX_SAFE_INTEGER;
  let count = 0;
  let strideCounter = 0;
  let lastAddedBoundaryLineCount = -1;
  // הקשר ההערות — מצב מצטבר לאורך ההליכה (ADR-005)
  let notesPlacedIds: string[] = [];
  let notesPlacedHeight = 0;
  const noteSplits: { continuationId: string; spec: NoteBodySpec }[] = [];
  let separatorBurned = notesCtx !== null && notesCtx.notesAlreadyOnPage;
  let notesGrowTotal = 0; // כולל הפרדה + הערות שנצרבו בהליכה זו
  // הערות צד (H7; שלב 54; §10.3): נצרבות באזור החיצוני **בלי לגזול מהטור**
  // (השוליים לצד הטור, לא מתחתיו); הממתינות (עקורות FIFO) נצרבות ראשונות
  // בראש האזור של העמוד; הערה שאינה נכנסת לשארית — עקירה לעמוד הבא בעלות
  // displacement (רכיב 3); הערה גדולה מאזור ריק — דחיית עוגן (כמו ADR-005:
  // אין פיצול להערות צד, אין גלישה שקטה)
  let sidenotesPlacedIds: string[] = [];
  let sidenotesPlacedHeight = 0;
  let sidenotesDisplaced: string[] = [];
  if (notesCtx !== null) {
    for (const pendId of notesCtx.pendingSidenotesAtStart) {
      const spec = notesCtx.bodies.get(pendId);
      if (spec === undefined) continue;
      if (spec.heightLu > notesCtx.emptyOuterBudgetLu) {
        // גדולה מאזור ריק — לעולם לא תיכנס: העוגן נדחה לנצח ⇒ תקוע/כשל
        // מפורש; כאן — ההליכה מסומנת שתדחה גם את הקו הראשון (אין גבולות)
        sidenotesDisplaced.push(pendId);
        continue;
      }
      if (spec.heightLu <= notesCtx.outerRemainingLu - sidenotesPlacedHeight) {
        sidenotesPlacedIds.push(pendId);
        sidenotesPlacedHeight += spec.heightLu;
      } else {
        sidenotesDisplaced.push(pendId); // נותרת ממתינה — עקורה FIFO (עלות)
      }
    }
    // המשכים (footnotes) ממתינים — נצרבים ראשונים (חובת הצבה); הצריבה
    // מוגבלת למרחב המשותף עם peek לקו הראשון (שלב 53)
    const firstAt = lineAt(map, pos);
    const firstLineH = firstAt !== null ? firstAt.line.heightLu : 0;
    for (const pendId of notesCtx.pendingAtStart) {
      const spec = notesCtx.bodies.get(pendId);
      if (spec === undefined) continue; // לא אמור לקרות — המחולל יוצר את ההמשכים
      const avail = Math.max(0, Math.min(
        notesCtx.notesRemainingLu - notesGrowTotal,
        remainingLu - firstLineH - notesGrowTotal,
        notesCtx.pageBodyHeightLu - notesCtx.otherColumnUsedLu - notesCtx.notesUsedAtStartLu - notesGrowTotal,
      ));
      const outcome = reserveNote(spec, avail, notesCtx.emptyBudgetLu, notesCtx.policy);
      if (outcome.kind === 'fits') {
        notesPlacedIds.push(pendId);
        notesGrowTotal += outcome.placedHeightLu;
      } else if (outcome.kind === 'split') {
        notesPlacedIds.push(pendId);
        notesGrowTotal += outcome.placedHeightLu;
        const contSpec = splitNoteBodySpec(spec, outcome.placedLines);
        noteSplits.push({ continuationId: outcome.continuationId, spec: contSpec });
      }
      // defer/fail להמשך ממתין: הגוש לא יכול להכיל אפילו אותו — ההליכה
      // תיעצר ממילא בבדיקת ההתאמה הראשונה (notesGrowTotal מרחיב את הלחץ)
      // ואם לא — המצב ייתקע והחיפוש ייכשל במפורש (§8.2)
    }
    if (notesPlacedIds.length > 0 && !separatorBurned) {
      notesGrowTotal += notesCtx.policy.separatorHeightLu;
      separatorBurned = true;
    }
    notesPlacedHeight = notesGrowTotal;
  }
  // ── ריווח ועיטורי פתיחה (שלב 61; §10.1 H2 — "measured ornament boxes") ──
  // ההליכה מתחילה בראש הפותחת: הריווח העליון (h2-top-distance — אחוז מגובה
  // הטור) והעיטור העליון (dim-h2-top-h — יחס לגובה הקו הראשון) נצרכים לפני
  // קו הכותרת הראשון; העיטור התחתון (dim-h2-btm-h — יחס לקו האחרון) נצרם
  // מיד אחריו. הכל ממודד מהגאומטריה והקווים בפועל — העיטור תופס בדיוק
  // את המקום שנמדד לו (שער השלב). רק כשהפותחת אכן מוצבת כאן (ראש עמוד
  // חדש מהסוג הנדרש וב-parity הנדרש) — אחרת ההליכה תיעצר בהמשך וגבול
  // פותח-עמוד ריק יפתח את העמוד הנכון (שלבים 59–60).
  const startOpenerLevel = pageOpenerLevelAt(pos);
  let openerBottomPendingLu = 0;
  let startOpenerPlaced = false;
  if (startOpenerLevel !== undefined) {
    const b = headingBehaviorOf(startOpenerLevel);
    const requiredKind = b.forcePageTemplate ?? flowKind;
    const rectoOk = b.startOnRecto !== true || state.physicalPageIndex % 2 === 1;
    const placeableHere = used === 0 && state.columnIndex === 0 && remainingLu === columnHeightLu
      && state.pageKind === requiredKind && rectoOk;
    startOpenerPlaced = placeableHere;
    const sp = b.openerSpacing;
    if (placeableHere && sp !== undefined) {
      const openerBlock = map.blocks[pos.blockIndex]!;
      const firstLineH = openerBlock.lines[pos.lineIndex]?.heightLu ?? 0;
      const lastLineH = openerBlock.lines[openerBlock.lines.length - 1]!.heightLu;
      used += Math.round(sp.spaceBeforePct * columnHeightLu) + Math.round(sp.ornamentTopEm * firstLineH);
      openerBottomPendingLu = Math.round(sp.ornamentBottomEm * lastLineH);
    }
  }
  while (true) {
    const at = lineAt(map, pos);
    if (at === null) break;
    const { line, block } = at;
    // ── פותח עמוד (שלב 59; §10.1 H0 — forcePageTemplate) ──
    // הכותרת הפותחת אינה מוצבת לעולם באמצע עמוד: ההליכה נעצרת לפניה.
    // בראש עמוד חדש (טור 0 מלא, שום דבר לא הוצב ולא נצרב) היא כן מוצבת
    // מכאן והלאה (escort כרגיל); אחרת — אם הוצב תוכן, הגבול בסופו כבר נפלט
    // וסומן pageOpener; אם לא הוצב דבר (מצב לא-טרי, למשל אחרי מחסום H3)
    // נוצר גבול פותח-עמוד ריק שרק פותח עמוד חדש — בלי להקדים את הסמן.
    const openerLevelHere = pageOpenerLevelAt(pos);
    // שלב 61: כשההליכה התחילה בפותחת שאכן מוצבת כאן (ראש עמוד חדש מהסוג
    // הנדרש) — אין לעצור בה באיטרציה הראשונה: היא מוצבת מכאן והלאה; הריווח
    // והעיטורים שנצרכו אינם "תוכן שהוצב" לעניין בדיקת הטריות של העצירה.
    const atPlacedStartOpener = startOpenerPlaced && openerLevelHere === startOpenerLevel && count === 0;
    if (openerLevelHere !== undefined && !atPlacedStartOpener) {
      // שלב 60: הפותחת מוצבת בראש עמוד חדש רק אם העמוד עצמו מתאים לה —
      // הסוג שהמדיניות דורשת (forcePageTemplate; H1 ⇒ sub-shaar) וגם recto
      // כשהמדיניות דורשת (parity; legacy ensureOddPageStart). עמוד זרימה
      // רגיל שאינו מתאים (כולל עמוד ריק שנפתח לכפיית recto) — ההליכה נעצרת
      // וגבול פותח-עמוד ריק יפתח את העמוד הנכון.
      const openerBehaviorHere = headingBehaviorOf(openerLevelHere);
      const requiredKindHere = openerBehaviorHere.forcePageTemplate ?? flowKind;
      const rectoOkHere = openerBehaviorHere.startOnRecto !== true || state.physicalPageIndex % 2 === 1;
      const freshPageTop = used === 0 && state.columnIndex === 0 && remainingLu === columnHeightLu
        && state.pageKind === requiredKindHere && rectoOkHere;
      if (!freshPageTop) {
        if (used === 0 && out.length === 0) {
          out.push({
            end: pos,
            cursorBlockId: block.blockId,
            cursorFragment: 0,
            heightLu: 0,
            emergency: false,
            footnoteRefs: [],
            sidenoteRefs: [],
            bracketOpens: [],
            bracketCloses: [],
            lineCount: 0,
            notesPlacedIds: [...notesPlacedIds],
            notesPlacedHeightLu: notesPlacedHeight,
            noteSplits: [...noteSplits],
            deferredRefs: [],
            sidenotesPlacedIds: [...sidenotesPlacedIds],
            sidenotesPlacedHeightLu: sidenotesPlacedHeight,
            sidenotesDisplaced: [...sidenotesDisplaced],
            pageOpener: { level: openerLevelHere },
          });
          lastAddedBoundaryLineCount = 0;
        }
        break;
      }
      // ראש עמוד חדש — הפותחת מוצבת כאן; ההליכה ממשיכה ממנה
    }
    // מחסום H3 (שלב 56; §9.3#6; §10.1): כותרת רוחבית חוצת-טורים — ההליכה
    // הרגילה נעצרת; נוצר מועמד barrier שמציב את הטקסט שלפניו וסוגר את
    // שני הטורים עד תחתית הכותרת. הטקסט שאחריה — הרחבה חדשה בפס שמתחת.
    // ה-H3 אינה פותחת עמוד מעצמה (§10.1).
    if (block.role === 'heading' && block.headingLevel !== undefined
      && headingBehaviorOf(block.headingLevel).flowRole === 'full-width-barrier') {
      const h3Height = block.lines.reduce((n, l) => n + l.heightLu, 0);
      // סוף ה-H3 — אחרי כל קוויה (אטומית)
      const endPos: FlowPosition = { blockIndex: pos.blockIndex + 1, lineIndex: 0 };
      const atEnd = endPos.blockIndex >= map.blocks.length;
      const lastBlock = map.blocks[map.blocks.length - 1]!;
      out.push({
        end: endPos,
        cursorBlockId: atEnd ? lastBlock.blockId : map.blocks[endPos.blockIndex]!.blockId,
        cursorFragment: atEnd ? lastBlock.lines.length : 0,
        heightLu: used,
        emergency: false,
        footnoteRefs: [...foot],
        sidenoteRefs: [...side],
        bracketOpens: [...opens],
        bracketCloses: [...closes],
        lineCount: count,
        notesPlacedIds: [...notesPlacedIds],
        notesPlacedHeightLu: notesPlacedHeight,
        noteSplits: [...noteSplits],
        deferredRefs: [],
        sidenotesPlacedIds: [...sidenotesPlacedIds],
        sidenotesPlacedHeightLu: sidenotesPlacedHeight,
        sidenotesDisplaced: [...sidenotesDisplaced],
        h3Barrier: { heightLu: h3Height },
      });
      lastAddedBoundaryLineCount = count;
      break; // ההליכה נעצרת במחסום — ההמשך הוא הרחבה חדשה בפס שמתחת
    }
    // feasibility לפני cost: הקו חייב להיכנס גם אחרי שריון ההערות שהוא
    // עצמו גורם (§9.3#5 — "רק אחר כך נקבע שטח הגוף הפנוי")
    if (notesCtx !== null && line.footnoteRefs.length > 0) {
      // הכל או כלום (ADR-005 §6): הערכת הצריבה של כל ההפניות של הקו
      let probeGrow = notesGrowTotal;
      const probePlaced: string[] = [];
      const probeSplits: { continuationId: string; spec: NoteBodySpec }[] = [];
      let deferred: string[] = [];
      for (const ref of line.footnoteRefs) {
        const spec = notesCtx.bodies.get(ref);
        if (spec === undefined) {
          throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'candidates', reason: `missing note body ${ref}` }, 'הפניית הערה בלי גוף מדוד — הקלט חייב לכלול את כל גופי ההערות');
        }
        const sep = probePlaced.length === 0 && !separatorBurned ? notesCtx.policy.separatorHeightLu : 0;
        // המרחב המשותף (§9.3#5): ההערה + הקו שנושא אותה חייבים להיכנס
        // יחד — הזמין להערה = מינימום (תקציד ההערות, מקום הטור אחרי הקו,
        // **והמקום שנותר לגוש ההערות אחרי הטור האחר** — גוש ההערות ברוחב
        // מלא צורב משני הטורים כאחד: הערה שנצרבת כאן אינה יכולה לחדור לטקסט
        // שכבר הוצב בטור האחר; שלב 57 — באג הכריכה הרטרואקטיבית נתפס בסוללה).
        const availForNote = Math.max(0, Math.min(
          notesCtx.notesRemainingLu - probeGrow - sep,
          remainingLu - used - line.heightLu,
          notesCtx.pageBodyHeightLu - notesCtx.otherColumnUsedLu - notesCtx.notesUsedAtStartLu - probeGrow - sep,
        ));
        const outcome = reserveNote(spec, availForNote, notesCtx.emptyBudgetLu, notesCtx.policy);
        if (outcome.kind === 'fits' || outcome.kind === 'split') {
          probePlaced.push(ref);
          probeGrow += sep + outcome.placedHeightLu;
          if (outcome.kind === 'split') {
            probeSplits.push({ continuationId: outcome.continuationId, spec: splitNoteBodySpec(spec, outcome.placedLines) });
          }
        } else {
          deferred.push(ref); // defer או fail — הקו כולו נדחה (דחיית עוגן)
        }
      }
      if (deferred.length > 0 || probePlaced.length === 0) {
        // דחיית עוגן: ההליכה נעצרת לפני הקו — הגבול האחרון הוא לפניו
        break;
      }
      // הצבת ההערות של הקו בפועל — מצטרפות לגוש ההערות של ההליכה
      if (probePlaced.length > 0 && !separatorBurned && notesPlacedIds.length === 0 && probeGrow > notesGrowTotal) {
        separatorBurned = true; // ההפרדה נצרבה ב-probe דרך sep
      }
      notesGrowTotal = probeGrow;
      notesPlacedIds = [...notesPlacedIds, ...probePlaced];
      for (const s of probeSplits) noteSplits.push(s);
      notesPlacedHeight = notesGrowTotal;
    }
    if (used + line.heightLu + notesGrowTotal > remainingLu) break; // feasibility: הקו + ההערות אינם נכנסים יחד
    // הערות צד (H7; שלב 54): הצריבה באזור החיצוני — אינה משפיעה על מקום
    // הטור (השוליים לצד הטקסט); הערה שאינה נכנסת לשארית האזור נעקרת
    // לעמוד הבא בעלות displacement; גדולה מאזור ריק — דחיית עוגן (הקו
    // כולו אינו מוצב; בסופו של דבר תקוע/כשל מפורש — אין גלישה שקטה)
    if (notesCtx !== null && line.sidenoteRefs.length > 0) {
      let deferLine = false;
      for (const ref of line.sidenoteRefs) {
        const spec = notesCtx.bodies.get(ref);
        if (spec === undefined) {
          throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'candidates', reason: `missing sidenote body ${ref}` }, 'הפניית הערת צד בלי גוף מדוד');
        }
        if (spec.heightLu > notesCtx.emptyOuterBudgetLu) {
          deferLine = true; // גדולה מאזור ריק — דחיית עוגן נצחית (§8.2)
          break;
        }
        if (spec.heightLu <= notesCtx.outerRemainingLu - sidenotesPlacedHeight) {
          sidenotesPlacedIds.push(ref);
          sidenotesPlacedHeight += spec.heightLu;
        } else {
          sidenotesDisplaced.push(ref); // עקורה FIFO לעמוד הבא (עלות רכיב 3)
        }
      }
      if (deferLine) break; // ההליכה נעצרת לפני הקו — העוגן עובר עמוד
    }
    const atomic = isAtomicBlock(block, policy);
    // הצבת הקו
    used += line.heightLu;
    count += 1;
    // העיטור התחתון של הפותחת (שלב 61; §10.1 H2): מיד אחרי קו הכותרת
    // האחרון — חלק מהמכלול האטומי של הפתיחה; כל גבול שאחרי הכותרת כולל אותו
    if (openerBottomPendingLu > 0 && block.role === 'heading' && pos.lineIndex + 1 >= block.lines.length) {
      used += openerBottomPendingLu;
      openerBottomPendingLu = 0;
    }
    foot.push(...line.footnoteRefs);
    side.push(...line.sidenoteRefs);
    opens.push(...(line.bracketOpens ?? []));
    closes.push(...(line.bracketCloses ?? []));
    linesSinceHeading = block.role === 'heading' ? 0 : Math.min(linesSinceHeading + 1, Number.MAX_SAFE_INTEGER);
    const nextPos = nextPosition(map, pos);
    const isEndOfBlock = pos.lineIndex + 1 >= block.lines.length;
    // גבול חוקי? סוף בלוק תמיד; בין-קווי רק בפסקה רגילה ולפי המדיניות
    let legal = false;
    if (isEndOfBlock) {
      legal = true;
      strideCounter = 0;
    } else if (!atomic && policy.allowIntraParagraphBreaks) {
      strideCounter += 1;
      if (strideCounter >= policy.boundaryStride) {
        legal = true;
        strideCounter = 0;
      }
    }
    // ליווי כותרת: גבול פחות מ-K קווים אחרי כותרת — אינו חוקי (§10.1);
    // חריג אחד (שלב 59): גבול שנופל בדיוק בראש כותרת פותחת-עמוד — אינו
    // "כותרת תלויה": העמוד נסגר בכוח (forcePageBreak) והפותחת קיבלה עמוד
    // משלה; אסור לסגור גם את הגבול היחיד שמפריד ממנה (אחרת — תקוע)
    const openerAfterBoundary = legal || isEndOfBlock ? pageOpenerLevelAt(nextPos) : undefined;
    if (legal && policy.headingEscortLines > 0 && linesSinceHeading < policy.headingEscortLines
      && openerAfterBoundary === undefined) {
      legal = false;
    }
    if (legal) {
      const atEnd = nextPos.blockIndex >= map.blocks.length;
      const lastBlock = map.blocks[map.blocks.length - 1]!;
      out.push({
        end: nextPos,
        cursorBlockId: atEnd ? lastBlock.blockId : map.blocks[nextPos.blockIndex]!.blockId,
        cursorFragment: atEnd ? lastBlock.lines.length : nextPos.lineIndex,
        heightLu: used,
        emergency: false,
        footnoteRefs: [...foot],
        sidenoteRefs: [...side],
        bracketOpens: [...opens],
        bracketCloses: [...closes],
        lineCount: count,
        notesPlacedIds: [...notesPlacedIds],
        notesPlacedHeightLu: notesPlacedHeight,
        noteSplits: [...noteSplits],
        deferredRefs: [],
        sidenotesPlacedIds: [...sidenotesPlacedIds],
        sidenotesPlacedHeightLu: sidenotesPlacedHeight,
        sidenotesDisplaced: [...sidenotesDisplaced],
        ...(openerAfterBoundary !== undefined ? { pageOpener: { level: openerAfterBoundary } } : {}),
      });
      lastAddedBoundaryLineCount = count;
    }
    pos = nextPos;
  }
  // טור ריק שאף קו אינו נכנס — מועמד חירום יחיד לגוף רגיל (EMERGENCY_LINE);
  // בלוק אטום שאינו נכנס — אין מועמד כלל (§10.3 — הכרעת ADR-005 בשלב 55)
  if (out.length === 0 && used === 0 && lastAddedBoundaryLineCount < 0) {
    const at = lineAt(map, pos);
    if (at !== null && !isAtomicBlock(at.block, policy)
      && (notesCtx === null || (at.line.footnoteRefs.length === 0 && at.line.sidenoteRefs.length === 0))) {
      // הערות על קו חירום: החירום שמור לקו גוף בלבד — קו עם הפניית הערה
      // (שוליים או צד) שאינו נכנס אינו מקבל חירום — דחיית עוגן (ADR-005; שלב 54)
      const { line } = at;
      const nextPos = nextPosition(map, pos);
      const atEnd = nextPos.blockIndex >= map.blocks.length;
      const lastBlock = map.blocks[map.blocks.length - 1]!;
      out.push({
        end: nextPos,
        cursorBlockId: atEnd ? lastBlock.blockId : map.blocks[nextPos.blockIndex]!.blockId,
        cursorFragment: atEnd ? lastBlock.lines.length : nextPos.lineIndex,
        heightLu: line.heightLu,
        emergency: true,
        footnoteRefs: [...line.footnoteRefs],
        sidenoteRefs: [...line.sidenoteRefs],
        bracketOpens: [...(line.bracketOpens ?? [])],
        bracketCloses: [...(line.bracketCloses ?? [])],
        lineCount: 1,
        notesPlacedIds: [...notesPlacedIds],
        notesPlacedHeightLu: notesPlacedHeight,
        noteSplits: [...noteSplits],
        deferredRefs: [],
        sidenotesPlacedIds: [...sidenotesPlacedIds],
        sidenotesPlacedHeightLu: sidenotesPlacedHeight,
        sidenotesDisplaced: [...sidenotesDisplaced],
      });
    }
  }
  return out;
}

// ─────────────────────────── המחולל ───────────────────────────

/** ממשק ההתנהגות שהמנוע צורך — מוזרק מ-policy-torah (שלב 58; §10.1). */
export type { HeadingFlowBehavior } from './heading-defaults.js';

/**
 * מחולל מועמדי העמודים — PageCandidateSource עבור searchPages (שלב 51).
 * טהור ודטרמיניסטי: אותו מצב ⇐ אותן הרחבות באותו סדר (מטמון לפי stateHash).
 */
export function createPageCandidateSource(input: CandidateGeneratorInput): PageCandidateSource & {
  /** סטטיסטיקות לבדיקות — פסילות feasibility (לפני התמחור) והרחבות שנוצרו. */
  readonly stats: Readonly<{ feasibilityRejections: number; expansionsGenerated: number }>;
} {
  const issues = candidateInputIssues(input);
  if (issues.length > 0) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'candidates', reason: issues.join(';') }, `קלט מחולל המועמדים שגוי: ${issues.join(';')}`);
  }
  const policy: Required<LegalPageBreakPolicy> = { ...DEFAULT_LEGAL_PAGE_BREAK_POLICY, ...(input.policy ?? {}) };
  if (!Number.isSafeInteger(policy.headingEscortLines) || policy.headingEscortLines < 0
    || !Number.isSafeInteger(policy.boundaryStride) || policy.boundaryStride < 1) {
    throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'candidates', reason: 'policy' }, 'מדיניות גבולות שגויה');
  }
  const map = buildFlowMap(input.blocks);
  // התנהגות כותרות מוזרקת (שלב 58) — ברירת מחדל legacy בתוך המנוע
  const headingBehaviorOf = input.headingBehaviorOf ?? legacyHeadingBehaviorOf;
  const cache = new Map<string, readonly PageExpansion[]>();
  let feasibilityRejections = 0;
  let expansionsGenerated = 0;
  // הקשר ההערות (שלב 53; ADR-005) — גופי הערות + מדיניות; המחולל
  // מרחיב את המפה בהמשכים שנוצרים בפיצולים (מזהה ‎{noteId}#cont‎)
  const noteBodies = new Map<string, NoteBodySpec>(input.noteBodies ?? []);
  const notePolicy = resolveNotePolicy(input.notePolicy);
  const notesEnabled = (input.noteBodies ?? new Map()).size > 0 || notePolicy.allowLongNoteSplit || notePolicy.separatorHeightLu > 0;
  for (const [, spec] of noteBodies) {
    const bIssues = noteBodyIssues(spec);
    if (bIssues.length > 0) {
      throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'candidates', reason: `note body ${spec.noteId}: ${bIssues.join(';')}` }, `מפרט גוף הערה שגוי: ${spec.noteId}`);
    }
  }
  if (notesEnabled) {
    // כל הפניית הערה בקווי הזרימה חייבת גוף מדוד — אין הצבה של הפניה בלתי-ידועה
    for (const blk of input.blocks) {
      for (const line of blk.lines) {
        for (const ref of line.footnoteRefs) {
          if (!noteBodies.has(ref)) {
            throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'candidates', reason: `missing note body ${ref}` }, 'הפניית הערה בלי גוף מדוד — הקלט חייב לכלול את כל גופי ההערות');
          }
        }
        for (const ref of line.sidenoteRefs) {
          if (!noteBodies.has(ref)) {
            throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'candidates', reason: `missing sidenote body ${ref}` }, 'הפניית הערת צד בלי גוף מדוד — הקלט חייב לכלול את כל גופי ההערות');
          }
        }
      }
    }
    // הערות צד דורשות אזור חיצוני בתבנית (§10.3: recto/verso קובעים את האזור)
    const hasSidenoteRefs = input.blocks.some((b) => b.lines.some((l) => l.sidenoteRefs.length > 0));
    if (hasSidenoteRefs) {
      const first = input.templates.for(input.pageKind, 1);
      if (!first.regions.some((r) => r.role === 'outer-notes')) {
        throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'candidates', reason: 'sidenotes require outer-notes region (sidenoteWidthLu)' }, 'הערות צד דורשות אזור חיצוני בתבניות — הגדר sidenoteWidthLu');
      }
    }
  }

  /**
   * הצבת שער (שלב 60; §10.1 H1, §11.2): הכותרת הפותחת נכנסת לתיבת השער
   * (custom-box) כמכלול אטומי — כל קוויה יחד; הפניות הערות/סוגריים שלה
   * זורמות למצב כרגיל (ההערות יתנקזו לעמוד הגוף הבא — אין אזור הערות
   * בשער). ההמשך — עמוד זרימה חדש. כותרת שאינה נכנסת לתיבה ⇒ אין מועמד
   * ⇒ כשל מפורש (§8.2; אין חירום לכותרות ואין גלישה שקטה).
   */
  const buildShaarPlacement = (state: PaginationState, pos: FlowPosition, blk: PaginatedBlock): readonly PageExpansion[] => {
    const boxRegion = `page:${state.physicalPageIndex}:box`;
    const boxRemaining = state.remainingByRegion[boxRegion];
    if (boxRemaining === undefined) {
      throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'candidates', reason: `missing region ${boxRegion}` }, 'אזור תיבת השער חסר בעמוד השער — תבנית שער חייבת custom-box');
    }
    const lines = blk.lines.slice(pos.lineIndex);
    const totalH = lines.reduce((n, l) => n + l.heightLu, 0);
    if (totalH > boxRemaining || lines.length === 0) return []; // אין מועמד — כשל מפורש בחיפוש
    let s = state;
    const transitions: PaginationTransition[] = [];
    const foot: string[] = [];
    const side: string[] = [];
    const opens: { pairId: string; kind: 'round' | 'square' }[] = [];
    const closes: string[] = [];
    for (const line of lines) {
      foot.push(...line.footnoteRefs);
      side.push(...line.sidenoteRefs);
      opens.push(...(line.bracketOpens ?? []));
      closes.push(...(line.bracketCloses ?? []));
    }
    try {
      const cs = consumeRegion(s, boxRegion, totalH);
      transitions.push(cs.transition);
      s = cs.state;
      for (const ref of foot) {
        const st = pendFootnote(s, ref);
        transitions.push(st.transition);
        s = st.state;
      }
      for (const ref of side) {
        const st = pendSidenote(s, ref);
        transitions.push(st.transition);
        s = st.state;
      }
      for (const open of opens) {
        const st = bracketOpen(s, open.pairId, open.kind);
        transitions.push(st.transition);
        s = st.state;
      }
      for (const close of closes) {
        const st = bracketClose(s, close);
        transitions.push(st.transition);
        s = st.state;
      }
      // הסמן מעבר לכותרת — לבלוק הבא (או קץ המסמך)
      const nextPos: FlowPosition = { blockIndex: pos.blockIndex + 1, lineIndex: 0 };
      const atEnd = nextPos.blockIndex >= map.blocks.length;
      const lastBlock = map.blocks[map.blocks.length - 1]!;
      const cursorBlockId = atEnd ? lastBlock.blockId : map.blocks[nextPos.blockIndex]!.blockId;
      const cursorFragment = atEnd ? lastBlock.lines.length : 0;
      const adv = advanceCursor(s, { blockId: cursorBlockId, fragmentIndex: cursorFragment, atomIndex: 0 });
      transitions.push(adv.transition);
      s = adv.state;
      // המשך הזרימה — עמוד חדש מסוג הזרימה (אין טורי גוף בשער); בקץ המסמך — אין פתיחה
      let closesRegion = false;
      if (!atEnd) {
        const nextPage = s.physicalPageIndex + 1;
        const nextTemplate = input.templates.for(input.pageKind, nextPage);
        const pg = openPage(s, initialRemainingByRegion(nextTemplate, nextPage), input.pageKind);
        transitions.push(pg.transition);
        s = pg.state;
        closesRegion = true;
      }
      const v = new Array<number>(9).fill(0);
      v[8] = closesRegion ? 1 : 0;
      return [Object.freeze({
        candidateId: `pg:${state.physicalPageIndex}:0→${cursorBlockId}@${cursorFragment}:SHAAR`,
        transitions,
        toState: s,
        quality: Object.freeze(v) as PageQualityVector,
        closesRegion,
      })];
    } catch {
      return [];
    }
  };

  const build = (state: PaginationState): readonly PageExpansion[] => {
    const pos = flowPositionOf(map, state);
    if (pos === null) return []; // קץ המסמך
    // ── עמוד שער (שלב 60; §10.1 H1, §11.2) ──
    // עמוד shaar נושא את כותרת הפותחת שלו בתיבת השער (custom-box) ואין
    // בו טורי גוף כלל (§11.2: העמוד כולו עיטור + תיבות): ההרחבה היחידה
    // מציבה את הכותרת (אטומית — כל קוויה) בתיבה, מקדימה את הסמן מעבר לה
    // ופותחת את עמוד הזרימה הבא להמשך התוכן. ההחלטה בתוך ההרחבה (אין post-pass).
    if (state.pageKind === 'main-shaar' || state.pageKind === 'back-shaar' || state.pageKind === 'sub-shaar') {
      const blk = map.blocks[pos.blockIndex]!;
      const behavior = blk.role === 'heading' && blk.headingLevel !== undefined ? headingBehaviorOf(blk.headingLevel) : undefined;
      if (behavior === undefined || behavior.flowRole !== 'page-opener') {
        throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'candidates', reason: `shaar-page-non-opener ${blk.blockId}` }, 'עמוד שער נפתח רק עבור כותרת פותחת-עמוד — הסמן בתחילת העמוד חייב להצביע עליה');
      }
      return buildShaarPlacement(state, pos, blk);
    }
    const columnRegion = `page:${state.physicalPageIndex}:col:${state.columnIndex}`;
    const remaining = state.remainingByRegion[columnRegion];
    if (remaining === undefined) {
      throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'candidates', reason: `missing region ${columnRegion}` }, 'אזור הטור של המצב הנוכחי חסר');
    }
    // הקשר שריון ההערות (§9.3#5): אזור ההערות צורב מהמקום הפנוי לגוף של
    // שני הטורים כאחד — המרחב האפקטיבי = נותר הטור − ההערות שנצרבו בעמוד
    const notesRegionId = `page:${state.physicalPageIndex}:notes`;
    // התבנית של העמוד הנוכחי — לפי סוג העמוד שבמצב (שלב 59: עמוד שנפתח בכוח
    // על-ידי פותחת עשוי להיות מסוג שונה מסוג הזרימה; §9.3#1)
    const template = input.templates.for(state.pageKind, state.physicalPageIndex);
    const emptyNotesBudget = template.footnoteAnchor !== undefined ? template.footnoteAnchor.rect.height : 0;
    let notesCtx: NotesWalkContext | null = null;
    let effectiveRemaining = remaining;
    if (notesEnabled) {
      const notesRemaining = state.remainingByRegion[notesRegionId] ?? emptyNotesBudget;
      const notesUsedOnPage = Math.max(0, emptyNotesBudget - notesRemaining);
      effectiveRemaining = asLu(Math.max(0, remaining - notesUsedOnPage));
      // אזור חיצוני להערות צד (שלב 54; §10.3) — אפס כשאין אזור בתבנית
      const outerRegionId = `page:${state.physicalPageIndex}:outer`;
      const outerRegion = template.regions.find((r) => r.role === 'outer-notes');
      const emptyOuterBudget = outerRegion !== undefined ? outerRegion.rect.height : 0;
      const outerRemaining = outerRegion !== undefined ? (state.remainingByRegion[outerRegionId] ?? emptyOuterBudget) : 0;
      // כריכת הערות בין טורים (שלב 57; ADR-005 §3): גוש ההערות ברוחב מלא
      // צורב משני הטורים — האילוץ של העמודה האחרת נכנס להליכה
      const col0RegionId = `page:${state.physicalPageIndex}:col:0`;
      const col1RegionId = `page:${state.physicalPageIndex}:col:1`;
      const colRegionHeight = template.regions.find((r) => r.role === 'body-column' && r.columnIndex === 0)!.rect.height;
      const otherRegionId = state.columnIndex === 0 ? col1RegionId : col0RegionId;
      const otherRemaining = state.remainingByRegion[otherRegionId];
      const otherColumnUsed = otherRemaining !== undefined ? Math.max(0, colRegionHeight - otherRemaining) : 0;
      notesCtx = {
        policy: notePolicy,
        bodies: noteBodies,
        emptyBudgetLu: emptyNotesBudget,
        notesRemainingLu: notesRemaining,
        notesAlreadyOnPage: notesUsedOnPage > 0,
        pendingAtStart: state.pendingFootnotes,
        outerRemainingLu: outerRemaining,
        emptyOuterBudgetLu: emptyOuterBudget,
        pendingSidenotesAtStart: state.pendingSidenotes,
        pageBodyHeightLu: colRegionHeight,
        otherColumnUsedLu: otherColumnUsed,
        notesUsedAtStartLu: notesUsedOnPage,
      };
    }
    // גובה הטור המלא של התבנית הנוכחית — לזיהוי "ראש עמוד חדש" (שלב 59:
    // פותח-עמוד מוצב רק בראש עמוד טרי; טור 0 מלא ושום דבר לא נצרב בעמוד)
    const columnHeightLu = template.regions.find((r) => r.role === 'body-column' && r.columnIndex === 0)!.rect.height;
    const boundaries = buildBoundaries(map, state, effectiveRemaining, policy, notesCtx, headingBehaviorOf, columnHeightLu, input.pageKind);
    const out: PageExpansion[] = [];
    for (const boundary of boundaries) {
      let s = state;
      const transitions: PaginationTransition[] = [];
      // צריכת גובה — בחירום הקו גולש: מצרכים עד תום הנותר (המצב מתעד; הגלישה
      // נראית באיכות רכיב 1 וב-audit); H3 בראש פס (בלי טקסט-קודם) — אין
      // צריכת טור כלל (consumeRegion דורש כמות חיובית)
      const consumeAmount = boundary.emergency ? remaining : boundary.heightLu;
      if (!boundary.emergency && boundary.heightLu > remaining) {
        feasibilityRejections += 1; // לא אמור לקרות (הגבולות נבנו בגבולות הנותר) — הגנה
        continue;
      }
      try {
        if (consumeAmount > 0) {
          const step = consumeRegion(s, columnRegion, consumeAmount);
          transitions.push(step.transition);
          s = step.state;
        }
        // שריון ההערות (ADR-005): הצריבה בתוך ההרחבה — לא post-pass.
        // ההפניות ממתינות (pend) ואז מוצבות בגוש ההערות של העמוד;
        // ההמשכים מפיצולים נשארים ממתינים לעמוד הבא.
        if (notesCtx !== null && boundary.notesPlacedHeightLu > 0) {
          const notesStep = consumeRegion(s, notesRegionId, boundary.notesPlacedHeightLu);
          transitions.push(notesStep.transition);
          s = notesStep.state;
        }
        for (const ref of boundary.footnoteRefs) {
          const p = pendFootnote(s, ref);
          transitions.push(p.transition);
          s = p.state;
        }
        if (notesCtx !== null && boundary.notesPlacedIds.length > 0) {
          const placed = boundary.notesPlacedIds;
          const pl = placeFootnotes(s, placed);
          transitions.push(pl.transition);
          s = pl.state;
        }
        for (const split of boundary.noteSplits) {
          // ההמשך נכנס למפת הגופים (להרחבות הבאות) וממתין לעמוד הבא
          noteBodies.set(split.continuationId, split.spec);
          const p = pendFootnote(s, split.continuationId);
          transitions.push(p.transition);
          s = p.state;
        }
        for (const ref of boundary.sidenoteRefs) {
          const p = pendSidenote(s, ref);
          transitions.push(p.transition);
          s = p.state;
        }
        // הערות צד (H7; שלב 54): הצריבה באזור החיצוני — הוצבו (כולל העקורות
        // מהעמוד הקודם שנכנסו עכשיו) נוספו לשרשרת; העקורות נשארות ממתינות
        // (עלות displacement ברכיב 3) — הכל בתוך ההרחבה, אין post-pass
        if (notesCtx !== null && boundary.sidenotesPlacedIds.length > 0) {
          const outerRegionId = `page:${state.physicalPageIndex}:outer`;
          if (boundary.sidenotesPlacedHeightLu > 0) {
            const outerStep = consumeRegion(s, outerRegionId, boundary.sidenotesPlacedHeightLu);
            transitions.push(outerStep.transition);
            s = outerStep.state;
          }
          const sp = placeSidenotes(s, boundary.sidenotesPlacedIds);
          transitions.push(sp.transition);
          s = sp.state;
        }
        for (const open of boundary.bracketOpens) {
          const p = bracketOpen(s, open.pairId, open.kind);
          transitions.push(p.transition);
          s = p.state;
        }
        for (const close of boundary.bracketCloses) {
          const p = bracketClose(s, close);
          transitions.push(p.transition);
          s = p.state;
        }
        // גבול פותח-עמוד ריק (שלב 59): הסמן נשאר בראש הפותחת — ההתקדמות
        // היחידה היא פתיחת העמוד (ההרחבה בהמשך תפתח עמוד חדש ותוכנה
        // לא הוצב); השמטת advance-cursor כאן מונעת "סמן אינו מתקדם"
        const curHere = parseCursor(state.contentCursor);
        const boundaryMovesCursor = boundary.cursorBlockId !== curHere.blockId || boundary.cursorFragment !== curHere.fragmentIndex;
        if (boundaryMovesCursor) {
          const adv = advanceCursor(s, { blockId: boundary.cursorBlockId, fragmentIndex: boundary.cursorFragment, atomIndex: 0 });
          transitions.push(adv.transition);
          s = adv.state;
        }
        let closesRegion = false;
        let h3GapLu = 0;
        // ── מחסום H3 (שלב 56; §9.3#6; §10.1): הכותרת הרוחבית חוצת-טורים ──
        // ההרחבה סוגרת את שני הטורים עד תחתית הכותרת (barrierY = העמוק
        // מבין הטורים; הרווח שמעל הכותרת בטור הרדוד הוא עלות האי-איזון —
        // החיפוש מעדיף מסלולים מאוזנים לפני הכותרת); הטקסט שאחריה
        // ממשיך בפס חדש באותו עמוד (אין פתיחת עמוד מעצמה; §10.1).
        if (boundary.h3Barrier !== undefined) {
          const pageHeight = template.regions.find((r) => r.role === 'body-column' && r.columnIndex === 0)!.rect.height;
          const col0Region = `page:${s.physicalPageIndex}:col:0`;
          const col1Region = `page:${s.physicalPageIndex}:col:1`;
          // טור שאינו קיים בתבנית (חד-טורית) — אינו נחשב מלא: used=0
          const rem0 = s.remainingByRegion[col0Region];
          const rem1 = s.remainingByRegion[col1Region];
          const used0 = rem0 !== undefined ? Math.max(0, pageHeight - rem0) : 0;
          const used1 = rem1 !== undefined ? Math.max(0, pageHeight - rem1) : 0;
          const barrierY = Math.max(used0, used1);
          const bandTop = barrierY + boundary.h3Barrier.heightLu;
          // המרחב המשותף עם ההערות (§9.3#5): הפס חייב להיכנס גם עם גוש
          // ההערות שנצרב בעמוד — אחרת ה-H3 עוברת עמוד (feasibility לפני cost)
          const notesUsedOnPageNow = notesCtx !== null ? Math.max(0, emptyNotesBudget - (s.remainingByRegion[notesRegionId] ?? emptyNotesBudget)) : 0;
          if (bandTop + notesUsedOnPageNow > pageHeight || bandTop > pageHeight) {
            feasibilityRejections += 1;
            continue;
          }
          try {
            const burn0 = bandTop - used0;
            const burn1 = bandTop - used1;
            if (burn0 > 0) {
              const b0 = consumeRegion(s, col0Region, burn0);
              transitions.push(b0.transition);
              s = b0.state;
            }
            if (burn1 > 0 && s.remainingByRegion[col1Region] !== undefined) {
              // טור שני קיים בתבנית בלבד (חד-טורית — אין שריפה)
              const b1 = consumeRegion(s, col1Region, burn1);
              transitions.push(b1.transition);
              s = b1.state;
            }
            // הטקסט שאחרי הכותרת ממשיך בטור 0 של הפס החדש (§9.3#3)
            if (s.columnIndex === 1) {
              const sw = switchColumn(s, 0);
              transitions.push(sw.transition);
              s = sw.state;
            }
            closesRegion = true; // barrier מוגדר סוגר אזור (§9.2)
            // עלות אי-האיזון: הרווחים מעל הכותרת בשני הטורים (רכיב 8) —
            // החיפוש מאזן את הטקסט לפני הכותרת ("איזון לפני הכותרת")
            h3GapLu = (barrierY - used0) + (barrierY - used1);
          } catch {
            feasibilityRejections += 1;
            continue;
          }
        } else if (boundary.pageOpener !== undefined) {
          // ── פותח עמוד (שלב 59; §10.1 H0/H1 — forcePageTemplate; שלב 60: parity) ──
          // הגבול מסתיים בכותרת פותחת-עמוד: ההרחבה פותחת עמוד חדש מיד —
          // לא מעבר טור ולא מילוי העמוד הנוכחי (השארית ננטשת; תת-המילוי
          // הוא עלות רכיב 8 ואיזון סוף-פרק יטופל בשלב 66). התבנית — לפי
          // ההתנהגות המוזרקת (forcePageTemplate; ברירת מחדל סוג הזרימה).
          // parity (שלב 60; §10.1 H1): פותחת שחייבת recto והעמוד הבא verso —
          // נפתח עמוד ריק של הזרימה קודם, והפותחת תיפתח בעמוד העוקב (recto)
          // על-ידי גבול פותח-עמוד ריק (legacy ensureOddPageStart; ההחלטה
          // בתוך ההרחבה — אין post-pass; החיפוש מעדיף מסלולים בלי עמודים ריקים).
          const openerBehavior = headingBehaviorOf(boundary.pageOpener.level);
          const openerKind = openerBehavior.forcePageTemplate ?? input.pageKind;
          const nextPage = s.physicalPageIndex + 1;
          const needsBlankForRecto = openerBehavior.startOnRecto === true && nextPage % 2 === 0;
          const openedKind = needsBlankForRecto ? input.pageKind : openerKind;
          const nextTemplate = input.templates.for(openedKind, nextPage);
          const remainingNext = initialRemainingByRegion(nextTemplate, nextPage);
          const pg = openPage(s, remainingNext, openedKind);
          transitions.push(pg.transition);
          s = pg.state;
          closesRegion = true;
        } else {
          // מעבר טור/עמוד (§9.3): טור 0 ← 1 (רק בתבנית דו-טורית); טור 1 (או
          // תבנית חד-טורית) ← עמוד חדש מהתבנית (שלב 50; תיקון שלב 57 — חד-טורי)
          const hasSecondColumn = template.regions.some((r) => r.role === 'body-column' && r.columnIndex === 1);
          if (s.columnIndex === 0 && hasSecondColumn) {
            const sw = switchColumn(s, 1);
            transitions.push(sw.transition);
            s = sw.state;
          } else {
            const nextPage = s.physicalPageIndex + 1;
            const nextTemplate = input.templates.for(input.pageKind, nextPage);
            const remainingNext = initialRemainingByRegion(nextTemplate, nextPage);
            const pg = openPage(s, remainingNext, input.pageKind);
            transitions.push(pg.transition);
            s = pg.state;
            closesRegion = true;
          }
        }
        // וקטור איכות אינקרמנטלי (ADR-004): רכיב 1 (fallbackSeverity) —
        // חירום HIGH=2, פיצול הערה MEDIUM=1 לפיצול; רכיב 3 (noteDisplacement)
        // — המשך מוסר מעוגנו; רכיב 8 (columnImbalance) — תת-מילוי הטור
        // באלפי-LU + רווחי אי-האיזון שלפני H3; רכיב 9 — עמוד שנפתח.
        const v = new Array<number>(9).fill(0);
        v[0] = (boundary.emergency ? 2 : 0) + boundary.noteSplits.length;
        // רכיב 3 (noteDisplacement; ADR-004): פיצולי הערות-שוליים + הערות צד
        // עקורות מעוגנן (FIFO לעמוד הבא) — החיפוש מעדיף הצבה קרובה (§10.3)
        v[2] = boundary.noteSplits.length + boundary.sidenotesDisplaced.length;
        v[7] = Math.min(1024, Math.floor((Math.max(0, effectiveRemaining - boundary.heightLu) + h3GapLu) / 1000));
        v[8] = closesRegion ? 1 : 0;
        out.push({
          candidateId: `pg:${state.physicalPageIndex}:${state.columnIndex}→${boundary.cursorBlockId}@${boundary.cursorFragment}${boundary.emergency ? ':EMERGENCY' : ''}${boundary.noteSplits.length > 0 ? ':SPLIT' : ''}${boundary.h3Barrier !== undefined ? ':H3' : ''}${boundary.pageOpener !== undefined ? ':OPEN' : ''}`,
          transitions,
          toState: s,
          quality: Object.freeze(v) as PageQualityVector,
          closesRegion,
          // קוד fallback יחיד להרחבה: חירום גובר (הם מוכללים הדדית — קו חירום
          // אינו נושא הערות; אם אי-פעם יתנגשו, החירום החמור יותר נרשם)
          ...(boundary.emergency
            ? { fallbackCode: 'EMERGENCY_LINE' as const }
            : (boundary.noteSplits.length > 0 ? { fallbackCode: 'LONG_NOTE_SPLIT' as const } : {})),
        });
      } catch {
        // מעבר לא חוקי (כפילות pend, סוגריים לא-LIFO וכו') — feasibility
        // לפני cost: המועמד אינו נוצר; נרשם בסטטיסטיקה
        feasibilityRejections += 1;
      }
    }
    expansionsGenerated += out.length;
    return out;
  };

  const source: PageCandidateSource = {
    expansions(state: PaginationState): readonly PageExpansion[] {
      const hit = cache.get(state.stateHash);
      if (hit !== undefined) return hit;
      const result = build(state);
      cache.set(state.stateHash, result);
      return result;
    },
    /** קץ המסמך — הסמן אחרי הקו האחרון של הבלוק האחרון (חוזה החיפוש; שלב 51). */
    isDocumentEnd(state: PaginationState): boolean {
      return flowPositionOf(map, state) === null;
    },
  };
  return {
    ...source,
    get stats() {
      return Object.freeze({ feasibilityRejections, expansionsGenerated });
    },
  };
}

// ─────────────────── עוגני כותרות (שלב 60; §10.1 H1 "shaar policy + anchor") ───────────────────

/** עוגן כותרת — העמוד הפיזי שבו הוצבה (זרע ל-AnchorTable של שלב 70 ולכותרות רצות של 67). */
export interface HeadingAnchor {
  readonly blockId: string;
  readonly level: number;
  /** סוג העמוד שנשא את הכותרת (H1 ⇒ sub-shaar; שאר ⇒ סוג הזרימה). */
  readonly pageKind: import('@tora/layout-api').PageKind;
  readonly physicalPageIndex: number;
  /** מזהה ההרחבה שהציבה את הכותרת (לפנקס). */
  readonly candidateId: string;
}

/**
 * טבלת עוגני כותרות ממסלול שעבר: לכל בלוק heading — העמוד שבו הוצב.
 * טהורה ודטרמיניסטית: הולכת לאורך השרשרת (הסמן שלפני כל הרחבה = toState
 * של קודמתה), והכותרת שהמסלול מכסה נרשמת בעמוד שבו התחילה ההרחבה שהציבה
 * אותה. אין pageEstimate — עמוד אמיתי בלבד (§11.1).
 */
export function headingAnchorsOf(
  initial: PaginationState,
  path: readonly PageExpansion[],
  blocks: readonly PaginatedBlock[],
): readonly HeadingAnchor[] {
  const indexOf = new Map<string, number>();
  for (let i = 0; i < blocks.length; i++) indexOf.set(blocks[i]!.blockId, i);
  type Pos = { readonly blockIndex: number; readonly fragment: number };
  const cursorPos = (cursor: string): Pos => {
    const c = parseCursor(cursor);
    const idx = indexOf.get(c.blockId);
    // קץ המסמך (סמן על הבלוק האחרון בפרגמנט סופי) — מיקום מעבר לכולם
    if (idx === undefined) return { blockIndex: blocks.length, fragment: 0 };
    return { blockIndex: idx, fragment: c.fragmentIndex };
  };
  const le = (a: Pos, b: Pos): boolean => a.blockIndex < b.blockIndex || (a.blockIndex === b.blockIndex && a.fragment <= b.fragment);
  const headEndOf = (i: number): Pos => (i + 1 < blocks.length
    ? { blockIndex: i + 1, fragment: 0 }
    : { blockIndex: i, fragment: blocks[i]!.lines.length });
  const out: HeadingAnchor[] = [];
  let prev = initial;
  for (const exp of path) {
    const fromPos = cursorPos(prev.contentCursor);
    const toPos = cursorPos(exp.toState.contentCursor);
    const advanced = fromPos.blockIndex !== toPos.blockIndex || fromPos.fragment !== toPos.fragment;
    if (advanced) {
      // הכותרת טרם הוצבה לפני ההרחבה ⇔ הסמן היה בראשה או לפניו (fromPos ≤ ראשה);
      // ההרחבה הציבה אותה ⇔ הסמן אחריה כבר מעבר לסופה (toPos ≥ סופה — תחילת
      // הבלוק הבא או קץ המסמך). העמוד: זה שבו ההרחבה התחילה (prev).
      for (let i = 0; i < blocks.length; i++) {
        const blk = blocks[i]!;
        if (blk.role !== 'heading' || blk.headingLevel === undefined) continue;
        const headStart: Pos = { blockIndex: i, fragment: 0 };
        if (le(fromPos, headStart) && le(headEndOf(i), toPos)) {
          out.push({
            blockId: blk.blockId,
            level: blk.headingLevel,
            pageKind: prev.pageKind,
            physicalPageIndex: prev.physicalPageIndex,
            candidateId: exp.candidateId,
          });
        }
      }
    }
    prev = exp.toState;
  }
  return out;
}
