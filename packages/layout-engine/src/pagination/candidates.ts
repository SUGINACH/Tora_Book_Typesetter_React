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
): BoundaryCandidate[] {
  const out: BoundaryCandidate[] = [];
  let pos = flowPositionOf(map, state);
  if (pos === null) return out;
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
  while (true) {
    const at = lineAt(map, pos);
    if (at === null) break;
    const { line, block } = at;
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
        // יחד — הזמין להערה = מינימום (תקציד ההערות, מקום הטור אחרי הקו).
        // בפיצול זה מבטיח שהחלק הראשון + הקו אכן נכנסים לאותו עמוד.
        const availForNote = Math.max(0, Math.min(
          notesCtx.notesRemainingLu - probeGrow - sep,
          remainingLu - used - line.heightLu,
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
    // ליווי כותרת: גבול פחות מ-K קווים אחרי כותרת — אינו חוקי (§10.1)
    if (legal && policy.headingEscortLines > 0 && linesSinceHeading < policy.headingEscortLines) {
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

  /** page opener (H0/H1; §10.1) — סוגר אזור עימוד; forcePageTemplate ב-M7. */
  const isPageOpener = (blockIndex: number): boolean => {
    const blk = map.blocks[blockIndex];
    return blk !== undefined && blk.role === 'heading' && (blk.headingLevel === 0 || blk.headingLevel === 1);
  };

  const build = (state: PaginationState): readonly PageExpansion[] => {
    const pos = flowPositionOf(map, state);
    if (pos === null) return []; // קץ המסמך
    const columnRegion = `page:${state.physicalPageIndex}:col:${state.columnIndex}`;
    const remaining = state.remainingByRegion[columnRegion];
    if (remaining === undefined) {
      throw new LayoutEngineError('errors.engine.PAGINATION_STATE_INVALID', { action: 'candidates', reason: `missing region ${columnRegion}` }, 'אזור הטור של המצב הנוכחי חסר');
    }
    // הקשר שריון ההערות (§9.3#5): אזור ההערות צורב מהמקום הפנוי לגוף של
    // שני הטורים כאחד — המרחב האפקטיבי = נותר הטור − ההערות שנצרבו בעמוד
    const notesRegionId = `page:${state.physicalPageIndex}:notes`;
    const template = input.templates.for(input.pageKind, state.physicalPageIndex);
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
      };
    }
    const boundaries = buildBoundaries(map, state, effectiveRemaining, policy, notesCtx);
    const out: PageExpansion[] = [];
    for (const boundary of boundaries) {
      let s = state;
      const transitions: PaginationTransition[] = [];
      // צריכת גובה — בחירום הקו גולש: מצרכים עד תום הנותר (המצב מתעד; הגלישה
      // נראית באיכות רכיב 1 וב-audit)
      const consumeAmount = boundary.emergency ? remaining : boundary.heightLu;
      if (!boundary.emergency && boundary.heightLu > remaining) {
        feasibilityRejections += 1; // לא אמור לקרות (הגבולות נבנו בגבולות הנותר) — הגנה
        continue;
      }
      try {
        const step = consumeRegion(s, columnRegion, consumeAmount);
        transitions.push(step.transition);
        s = step.state;
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
        const adv = advanceCursor(s, { blockId: boundary.cursorBlockId, fragmentIndex: boundary.cursorFragment, atomIndex: 0 });
        transitions.push(adv.transition);
        s = adv.state;
        // מעבר טור/עמוד (§9.3): טור 0 ← 1; טור 1 ← עמוד חדש מהתבנית (שלב 50)
        let closesRegion = false;
        if (s.columnIndex === 0) {
          const sw = switchColumn(s, 1);
          transitions.push(sw.transition);
          s = sw.state;
        } else {
          const nextPage = s.physicalPageIndex + 1;
          const nextTemplate = input.templates.for(input.pageKind, nextPage);
          const remainingNext = initialRemainingByRegion(nextTemplate, nextPage);
          const pg = openPage(s, remainingNext);
          transitions.push(pg.transition);
          s = pg.state;
          closesRegion = true;
        }
        if (!closesRegion && isPageOpener(boundary.end.blockIndex)) closesRegion = true;
        // וקטור איכות אינקרמנטלי (ADR-004): רכיב 1 (fallbackSeverity) —
        // חירום HIGH=2, פיצול הערה MEDIUM=1 לפיצול; רכיב 3 (noteDisplacement)
        // — המשך מוסר מעוגנו; רכיב 8 (columnImbalance) — תת-מילוי הטור
        // באלפי-LU (מהמרחב האפקטיבי); רכיב 9 (pageCountDebt) — עמוד שנפתח.
        const v = new Array<number>(9).fill(0);
        v[0] = (boundary.emergency ? 2 : 0) + boundary.noteSplits.length;
        // רכיב 3 (noteDisplacement; ADR-004): פיצולי הערות-שוליים + הערות צד
        // עקורות מעוגנן (FIFO לעמוד הבא) — החיפוש מעדיף הצבה קרובה (§10.3)
        v[2] = boundary.noteSplits.length + boundary.sidenotesDisplaced.length;
        v[7] = Math.min(1024, Math.floor(Math.max(0, effectiveRemaining - boundary.heightLu) / 1000));
        v[8] = closesRegion ? 1 : 0;
        out.push({
          candidateId: `pg:${state.physicalPageIndex}:${state.columnIndex}→${boundary.cursorBlockId}@${boundary.cursorFragment}${boundary.emergency ? ':EMERGENCY' : ''}${boundary.noteSplits.length > 0 ? ':SPLIT' : ''}`,
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
