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
import { type LayoutUnit } from '@tora/layout-api';
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
  switchColumn,
  type PaginationState,
  type PaginationTransition,
} from './state.js';
import { initialRemainingByRegion, type PageTemplateSet } from './templates.js';
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
}

/**
 * בניית הגבולות החוקיים למילוי הטור הנוכחי: הליכה קדימה מהסמן כל עוד
 * קווים נכנסים לנותר; כל גבול חוקי הוא מועמד. הליכה דרך בלוק אטום
 * ממשיכה עד סופו — גבולות בתוכו אינם נוצרים; אם הטור מתמלא באמצעו,
 * הגבול האחרון שנוצר הוא לפני תחילתו (הבלוק לא הוצב חלקית לעולם).
 * מועמד חירום יחיד כשאף קו של גוף רגיל אינו נכנס לטור ריק.
 */
function buildBoundaries(
  map: FlowMap,
  state: PaginationState,
  remainingLu: number,
  policy: Required<LegalPageBreakPolicy>,
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
  while (true) {
    const at = lineAt(map, pos);
    if (at === null) break;
    const { line, block } = at;
    if (used + line.heightLu > remainingLu) break; // feasibility: אינו נכנס — ההליכה נעצרת
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
      });
      lastAddedBoundaryLineCount = count;
    }
    pos = nextPos;
  }
  // טור ריק שאף קו אינו נכנס — מועמד חירום יחיד לגוף רגיל (EMERGENCY_LINE);
  // בלוק אטום שאינו נכנס — אין מועמד כלל (§10.3 — הכרעת ADR-005 בשלב 55)
  if (out.length === 0 && used === 0 && lastAddedBoundaryLineCount < 0) {
    const at = lineAt(map, pos);
    if (at !== null && !isAtomicBlock(at.block, policy)) {
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
    const boundaries = buildBoundaries(map, state, remaining, policy);
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
        for (const ref of boundary.footnoteRefs) {
          const p = pendFootnote(s, ref);
          transitions.push(p.transition);
          s = p.state;
        }
        for (const ref of boundary.sidenoteRefs) {
          const p = pendSidenote(s, ref);
          transitions.push(p.transition);
          s = p.state;
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
        // חירום HIGH=2; רכיב 8 (columnImbalance) — תת-מילוי הטור באלפי-LU;
        // רכיב 9 (pageCountDebt) — עמוד שנפתח בהרחבה זו.
        const v = new Array<number>(9).fill(0);
        v[0] = boundary.emergency ? 2 : 0;
        v[7] = Math.min(1024, Math.floor(Math.max(0, remaining - boundary.heightLu) / 1000));
        v[8] = closesRegion ? 1 : 0;
        out.push({
          candidateId: `pg:${state.physicalPageIndex}:${state.columnIndex}→${boundary.cursorBlockId}@${boundary.cursorFragment}${boundary.emergency ? ':EMERGENCY' : ''}`,
          transitions,
          toState: s,
          quality: Object.freeze(v) as PageQualityVector,
          closesRegion,
          ...(boundary.emergency ? { fallbackCode: 'EMERGENCY_LINE' as const } : {}),
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
