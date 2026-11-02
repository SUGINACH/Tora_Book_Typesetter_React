/**
 * emergency.ts — סולם מדיניות החירום המדורג (שלב 44; אפיון §8.2, §14; ADR-004).
 *
 * כשלים חריגים נפתרים בסדר מדורג, גלוי וקבוע — אין overflow שקט ואין
 * מחיקת תוכן; כל שלב מתועד עם span ועלות:
 *
 *   רמה 0 — רגיל: קו חוקי רק בסבילות הרגילה (מתיחה/כיווץ מלאים).
 *   רמה 1 — EMERGENCY_STRETCH (MEDIUM): קו justify רשאי מתיחה עד פי 2
 *            מהזמינה; כל קו שחורג מהסבילות הרגילה נושא את הקוד ואת
 *            עלות החומרה בווקטור (רכיב 1 — לפני כל איכות).
 *   רמה 2 — גלישה מתועדת EMERGENCY_LINE (HIGH): מילה/רצף בלתי־בר־שבירה
 *            רחב מהטור מונח על קו משלו בשלמותו — לא נחתך ולא נמדד כאפס;
 *            הגלישה נרשמת ונראית בביקורת (§8.2: "overflow הוא HIGH").
 *   רמה 3 — כשל מפורש: כשהמדיניות אוסרת גלישה (allowOverflow=false) —
 *            LayoutEngineError מקוטלג, לא טקסט קטוע.
 *
 * אין hyphenation אוטומטי לעברית בלי policy ומילון מפורשים (§8.2) —
 * שבירת תווים בחירום היא ברירת מחדל כבויה ואינה ממומשת כלל.
 */
import { type AppendDecision, canonicalJson, sha256Hex } from '@tora/layout-api';
import { LayoutEngineError } from '../errors.js';
import type { LineCandidate, LineCandidateIndex } from './candidates.js';
import { breakParagraphDP, type DpBudget, type DpResult, type FeasibilityPolicy } from './dp.js';
import type { JustificationMode } from './candidates.js';
import { createLevel0Policy } from './policy.js';
import { coalesceSpans, type BlockTokens, type Cell } from './tokens.js';
import { createQualityCostModel, lineFallbackCode, type QualityVector } from './quality.js';

/** רמת הסולם שבה נמצא מסלול חוקי. */
export type EmergencyLevel = 0 | 1 | 2;

export type LineFallbackCode = 'EMERGENCY_STRETCH' | 'EMERGENCY_LINE';

export interface LadderResult {
  readonly level: EmergencyLevel;
  readonly dp: DpResult<QualityVector>;
  /** קוד fallback לכל קו (לפי אינדקס הקו) — לפנקס ול־IR (שלב 47). */
  readonly perLineFallback: ReadonlyMap<number, LineFallbackCode>;
  /** רשומות חירום לפנקס — כל שלב שנוסה מתועד עם span ועלות. */
  readonly emergencyRecords: readonly AppendDecision[];
}

export interface LadderOptions {
  /** ברירת מחדל true: גלישה מותרת ברמה 2 עם EMERGENCY_LINE נרשם. */
  readonly allowOverflow?: boolean;
}

/** רמה 1 — מתיחת חירום: סבילות כפולה ל־justify; גלישה עדיין אסורה. */
export function createLevel1Policy(): FeasibilityPolicy {
  return {
    overflowAllowanceLu: 0,
    check(candidate: LineCandidate, justification: JustificationMode, columnWidthLu: number): string | null {
      const m = candidate.metrics;
      if (justification === 'justify') {
        if (m.widthLu - m.shrinkLu > columnWidthLu) return 'overflow';
        if (columnWidthLu - m.widthLu > 2 * m.stretchLu) return 'underfill-emergency';
        return null;
      }
      if (m.widthLu > columnWidthLu) return 'overflow';
      return null;
    },
  };
}

/**
 * רמה 2 — גלישה מתועדת למקטעים בלתי־בר־שבירה בלבד.
 *
 * קו חד־מילולי (אין הזדמנות שבירה פנימית — מילה ארוכה, רצף חסום) חוקי
 * תמיד: הוא מונח על קו משלו בשלמותו עם EMERGENCY_LINE/STRETCH לפי
 * המדידה — לא נחתך ולא נמדד כאפס (§8.2). קו רב־מילילי חייב לעמוד גם
 * כאן בכללי רמה 1 — אחרת היו שוקלים לשבור אותו מוקדם יותר; מניעת
 * "מקטע ענק אחד שממזער את סכום החומרות" היא בדיוק העניין.
 */
export function createLevel2Policy(index: LineCandidateIndex): FeasibilityPolicy {
  return {
    overflowAllowanceLu: Number.MAX_SAFE_INTEGER,
    check(candidate: LineCandidate, justification: JustificationMode, columnWidthLu: number): string | null {
      const hasInternalBreak = index.breakPlan.points.some(
        (p) => (p.kind === 'opportunity' || p.kind === 'mandatory') && p.tokenIndex > candidate.startTok && p.tokenIndex < candidate.endTok,
      );
      if (!hasInternalBreak) return null; // מקטע בלתי־בר־שבירה — חוקי עם קוד גלישה
      // קו רב־מילילי: כללי רמה 1 נותרים בתוקף
      const m = candidate.metrics;
      if (justification === 'justify') {
        if (m.widthLu - m.shrinkLu > columnWidthLu) return 'overflow';
        if (columnWidthLu - m.widthLu > 2 * m.stretchLu) return 'underfill-emergency';
        return null;
      }
      if (m.widthLu > columnWidthLu) return 'overflow';
      return null;
    },
  };
}

/**
 * שבירת פסקה דרך הסולם: מנסים 0 ← 1 ← 2 בסדר קבוע; רמה 3 (כשל מפורש)
 * רק כשהמדיניות אוסרת גלישה. טהור ודטרמיניסטי — אותם קלטים ⇐ אותה רמה
 * ואותם קודי fallback.
 */
export function breakParagraphWithLadder(
  blockId: string,
  bt: BlockTokens,
  index: LineCandidateIndex,
  columnWidthLu: number,
  budget: DpBudget,
  options: LadderOptions = {},
): LadderResult {
  const allowOverflow = options.allowOverflow !== false;
  const model = createQualityCostModel(columnWidthLu);
  const failedLevels: EmergencyLevel[] = [];

  const level0 = breakParagraphDP(index, model, createLevel0Policy(), columnWidthLu, budget);
  if (level0.best !== null) {
    return finish(0, level0, blockId, bt, columnWidthLu, failedLevels);
  }
  failedLevels.push(0);

  const level1 = breakParagraphDP(index, model, createLevel1Policy(), columnWidthLu, budget);
  if (level1.best !== null) {
    return finish(1, level1, blockId, bt, columnWidthLu, failedLevels);
  }
  failedLevels.push(1);

  if (!allowOverflow) {
    // רמה 3 — כשל מפורש: שגיאת פריסה מקוטלגת, לא טקסט קטוע (§8.2)
    throw new LayoutEngineError(
      'errors.engine.NO_LEGAL_LINE_BREAK',
      { blockId, level: 1 },
      'אין מסלול שבירה חוקי וגלישה אסורה במדיניות',
    );
  }

  const level2 = breakParagraphDP(index, model, createLevel2Policy(index), columnWidthLu, budget);
  return finish(2, level2, blockId, bt, columnWidthLu, failedLevels);
}

function finish(
  level: EmergencyLevel,
  dp: DpResult<QualityVector>,
  blockId: string,
  bt: BlockTokens,
  columnWidthLu: number,
  failedLevels: readonly EmergencyLevel[],
): LadderResult {
  const perLineFallback = new Map<number, LineFallbackCode>();
  dp.lines.forEach((line, i) => {
    const code = lineFallbackCode(
      {
        candidate: line.candidate,
        lineIndex: i,
        isFirst: i === 0,
        isLast: line.breakPoint.kind === 'end',
        justification: line.justification,
      },
      columnWidthLu,
    );
    if (code !== null) perLineFallback.set(i, code);
  });
  const emergencyRecords = failedLevels.map((failed) => emergencyTryRecord(blockId, failed, level));
  if (level > 0) emergencyRecords.push(emergencyFinalRecord(blockId, bt, level, dp, perLineFallback));
  return { level, dp, perLineFallback, emergencyRecords };
}

/** רישום שלב שנכשל: איזו רמה נוסתה ונפסלה — לפני שהודלקה הבאה. */
function emergencyTryRecord(blockId: string, failedLevel: EmergencyLevel, finalLevel: EmergencyLevel): AppendDecision {
  const nextCode = finalLevel >= 2 && failedLevel < 2 ? 'EMERGENCY_LINE' : 'EMERGENCY_STRETCH';
  return {
    stage: 'emergency',
    scopeId: `${blockId}:emergency:L${failedLevel}`,
    sourceSpans: [],
    stateHash: sha256Hex(canonicalJson({ blockId, tried: failedLevel, final: finalLevel })),
    candidates: [{ id: `level:${failedLevel}`, cost: 0 }],
    selectedCandidateId: `escalate:${failedLevel + 1}`,
    rejected: [{ candidateId: `level:${failedLevel}`, reason: 'no-legal-path-at-level' }],
    fallbackCode: nextCode,
  };
}

/** רישום הרמה שהופעלה בפועל: קודי ה-fallback לקווים שנפגעו, עם span ועלות. */
function emergencyFinalRecord(
  blockId: string,
  bt: BlockTokens,
  level: EmergencyLevel,
  dp: DpResult<QualityVector>,
  perLineFallback: ReadonlyMap<number, LineFallbackCode>,
): AppendDecision {
  // spans של הקווים שנפגעו — כל שלב חירום מתועד עם span ועלות (שלב 44)
  const sourceSpans = dp.lines
    .map((line, i) => ({ line, i }))
    .filter(({ i }) => perLineFallback.has(i))
    .flatMap(({ line }) => {
      const cells: Cell[] = [];
      for (let t = line.startTok; t < line.endTok; t++) {
        const tok = bt.tokens[t]!;
        if (tok.kind !== 'forced') cells.push(tok);
      }
      return coalesceSpans(cells, bt.atoms);
    });
  const code = [...perLineFallback.values()].includes('EMERGENCY_LINE') ? 'EMERGENCY_LINE' : 'EMERGENCY_STRETCH';
  return {
    stage: 'emergency',
    scopeId: `${blockId}:emergency:L${level}:applied`,
    sourceSpans,
    stateHash: sha256Hex(canonicalJson({ blockId, level, lines: dp.lines.map((l) => l.endTok), codes: [...perLineFallback.entries()] })),
    candidates: [{ id: `level:${level}`, cost: dp.best ? dp.best.fallbackSeverity : 0 }],
    selectedCandidateId: `level:${level}`,
    rejected: [],
    fallbackCode: code,
  };
}
