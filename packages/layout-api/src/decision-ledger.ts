/**
 * decision-ledger.ts — פנקס החלטות וקודי fallback (§6.7; שלב 32).
 *
 * עקרונות:
 *   1. כל רשומת החלטה ניתנת לסריאליזציה (ערכים סדירים בלבד) — בדיקה מוכיחה.
 *   2. fallbackCode רשום מראש ב-LAYOUT_FALLBACK_CODES — אין קוד צד;
 *      יצירת רשומה עם קוד לא רשום נדחית (חוזה: "אין פלט... ללא דרך להסביר
 *      החלטה"; §6.7: "לכל אחד severity ומדיניות release").
 *   3. trace: off/summary לא משנה את ה-IR; 'off' ⇒ אין ledger בפלט.
 *   4. רמות trace: off | summary | decisions | full (§6.7) — deterministic.
 */
import type { SourceSpan } from '@tora/content-model';
import { LayoutApiError } from './errors.js';
import { canonicalJson } from './canonical-hash.js';

// ─────────────────────── רמות trace (§6.7) — מוגדרות כאן כדי למנוע תלות מעגלית
// typeset→decision-ledger היא הכיוון היחיד המותר. ───────────────────────

export type TraceLevel = 'off' | 'summary' | 'decisions' | 'full';
export const TRACE_LEVELS: readonly TraceLevel[] = Object.freeze(['off', 'summary', 'decisions', 'full'] as const);

export function isTraceLevel(v: unknown): v is TraceLevel {
  return typeof v === 'string' && (TRACE_LEVELS as readonly string[]).includes(v);
}

// ─────────────────────────── קודי fallback רשומים ───────────────────────────

export type FallbackSeverity = 'HIGH' | 'MEDIUM';

export interface FallbackCodeEntry {
  readonly code: string;
  readonly severity: FallbackSeverity;
  readonly introducedAtStage: number;
  readonly description: string;
}

/**
 * קודי fallback רשומים (§6.7 + §18-M4 "מותר אלגוריתם פשוט כל עוד הוא
 * דטרמיניסטי ומסומן"). הוספת קוד = הוספה מתועדת בלבד; אין קוד צד.
 */
export const LAYOUT_FALLBACK_CODES: Readonly<Record<string, FallbackCodeEntry>> = Object.freeze({
  // ── v0 (שלד M4): מסומנים במפורש כהחלטות שלד ──
  EMERGENCY_LINE: {
    code: 'EMERGENCY_LINE',
    severity: 'HIGH',
    introducedAtStage: 33,
    description: 'v0: מקטע בלתי-בר-שבירה רחב מהטור — הונח על שורה בפני עצמו; overflow הוא ממצא HIGH (§8.2: אין לחתוך מילה; החירום נרשם).',
  },
  NOTES_V0_DEFERRED: {
    code: 'NOTES_V0_DEFERRED',
    severity: 'MEDIUM',
    introducedAtStage: 33,
    description: 'v0: גופי ההערות הונחו בעמודי notes בסוף המסמך ומספור page-scope קורב ל-siman; השריון האמיתי — שלב 53 (M6).',
  },
  // ── עתידיים (רישום מראש; שימוש ראשון בשלבים 42+/71) ──
  SEARCH_BUDGET_EXHAUSTED: {
    code: 'SEARCH_BUDGET_EXHAUSTED',
    severity: 'MEDIUM',
    introducedAtStage: 43,
    description: 'תקציב החיפוש מוצה (§9.2): נבחר החוקי הטוב ביותר רק אם המדיניות מאפשרת; אין מועמד חוקי — כשל מפורש.',
  },
  EMERGENCY_STRETCH: {
    code: 'EMERGENCY_STRETCH',
    severity: 'MEDIUM',
    introducedAtStage: 44,
    description: 'מתיחת חירום מדורגת (§8.2) — נרשמת עם severity ומדיניות release.',
  },
  LONG_NOTE_SPLIT: {
    code: 'LONG_NOTE_SPLIT',
    severity: 'MEDIUM',
    introducedAtStage: 55,
    description: 'הערה ארוכה מדי לעמוד: פיצול עם continuation marker רק במדיניות מפורשת (§10.3).',
  },
  TOC_FIXED_POINT_NOT_REACHED: {
    code: 'TOC_FIXED_POINT_NOT_REACHED',
    severity: 'HIGH',
    introducedAtStage: 71,
    description: 'נקודת שבת חוץ לא התייצבה (§11.1) — כשל מפורש, לא ניחוש מספר עמוד.',
  },
});

export type FallbackCode = keyof typeof LAYOUT_FALLBACK_CODES;

export function isRegisteredFallbackCode(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(LAYOUT_FALLBACK_CODES, code);
}

// ─────────────────────────── רשומות ───────────────────────────

export type DecisionStage = 'line-break' | 'column-break' | 'page-break' | 'toc' | 'notes' | 'emergency';
export const DECISION_STAGES: readonly DecisionStage[] = Object.freeze(
  ['line-break', 'column-break', 'page-break', 'toc', 'notes', 'emergency'] as const,
);

export interface CandidateSummary {
  readonly id: string;
  readonly cost: number;
}

export interface RejectionSummary {
  readonly candidateId: string;
  readonly reason: string;
}

export interface DecisionBudgetInfo {
  readonly generated: number;
  readonly pruned: number;
  readonly exhausted: boolean;
}

export interface DecisionRecord {
  readonly stage: DecisionStage;
  readonly scopeId: string;
  readonly sourceSpans: readonly SourceSpan[];
  readonly stateHash: string;
  readonly candidates: readonly CandidateSummary[];
  readonly selectedCandidateId: string;
  readonly rejected: readonly RejectionSummary[];
  readonly fallbackCode?: FallbackCode;
  readonly budget?: DecisionBudgetInfo;
}

export interface DecisionLedgerSummary {
  readonly records: number;
  readonly byStage: Readonly<Record<string, number>>;
  readonly fallbacks: Readonly<Record<string, number>>;
}

export interface DecisionLedger {
  readonly schemaVersion: 1;
  readonly traceLevel: TraceLevel;
  readonly records: readonly DecisionRecord[];
  readonly summary: DecisionLedgerSummary;
}

const HEX64 = /^[0-9a-f]{64}$/;

function isSpansArray(v: unknown): boolean {
  return Array.isArray(v) && v.every((s) => typeof s === 'object' && s !== null
    && typeof (s as Record<string, unknown>).startUtf16 === 'number');
}

export function decisionRecordIssues(rec: unknown): string[] {
  const issues: string[] = [];
  if (typeof rec !== 'object' || rec === null) return ['not-an-object'];
  const v = rec as Record<string, unknown>;
  if (!(DECISION_STAGES as readonly string[]).includes(v.stage as string)) issues.push('stage');
  if (typeof v.scopeId !== 'string' || v.scopeId.length === 0 || v.scopeId.length > 256) issues.push('scopeId');
  if (!isSpansArray(v.sourceSpans)) issues.push('sourceSpans');
  if (typeof v.stateHash !== 'string' || !HEX64.test(v.stateHash)) issues.push('stateHash');
  if (!Array.isArray(v.candidates) || (v.candidates as unknown[]).some((c) => typeof (c as Record<string, unknown>)?.id !== 'string' || !Number.isSafeInteger((c as Record<string, unknown>)?.cost))) issues.push('candidates');
  if (typeof v.selectedCandidateId !== 'string' || v.selectedCandidateId.length === 0) issues.push('selectedCandidateId');
  if (!Array.isArray(v.rejected) || (v.rejected as unknown[]).some((r) => typeof (r as Record<string, unknown>)?.candidateId !== 'string' || typeof (r as Record<string, unknown>)?.reason !== 'string')) issues.push('rejected');
  if (v.fallbackCode !== undefined && (typeof v.fallbackCode !== 'string' || !isRegisteredFallbackCode(v.fallbackCode as string))) {
    issues.push('fallbackCode:unregistered');
  }
  if (v.budget !== undefined) {
    const b = v.budget as Record<string, unknown>;
    if (!Number.isSafeInteger(b?.generated) || !Number.isSafeInteger(b?.pruned) || typeof b?.exhausted !== 'boolean') issues.push('budget');
  }
  return issues;
}

// ─────────────────────────── בניית הפנקס ───────────────────────────

export interface AppendDecision {
  readonly stage: DecisionStage;
  readonly scopeId: string;
  readonly sourceSpans: readonly SourceSpan[];
  readonly stateHash: string;
  readonly candidates: readonly CandidateSummary[];
  readonly selectedCandidateId: string;
  readonly rejected: readonly RejectionSummary[];
  readonly fallbackCode?: FallbackCode;
  readonly budget?: DecisionBudgetInfo;
}

export class DecisionLedgerBuilder {
  private readonly records: DecisionRecord[] = [];
  private readonly trace: TraceLevel;

  constructor(trace: TraceLevel) {
    if (!isTraceLevel(trace)) {
      throw new LayoutApiError('errors.layoutir.INVALID_TRACE_LEVEL', { value: String(trace) }, 'רמת trace שגויה');
    }
    this.trace = trace;
  }

  append(entry: AppendDecision): void {
    const rec: DecisionRecord = Object.freeze({
      stage: entry.stage,
      scopeId: entry.scopeId,
      sourceSpans: entry.sourceSpans,
      stateHash: entry.stateHash,
      candidates: Object.freeze([...entry.candidates]),
      selectedCandidateId: entry.selectedCandidateId,
      rejected: Object.freeze([...entry.rejected]),
      ...(entry.fallbackCode !== undefined ? { fallbackCode: entry.fallbackCode } : {}),
      ...(entry.budget !== undefined ? { budget: entry.budget } : {}),
    });
    const issues = decisionRecordIssues(rec);
    if (issues.length > 0) {
      throw new LayoutApiError('errors.layoutir.INVALID_LEDGER', { issues: issues.join('; ') }, `רשומת החלטה שגויה: ${issues.join('; ')}`);
    }
    if (this.trace !== 'off') this.records.push(rec);
  }

  /** סיכום לרמת 'summary'. */
  private summarize(): DecisionLedgerSummary {
    const byStage: Record<string, number> = {};
    const fallbacks: Record<string, number> = {};
    for (const r of this.records) {
      byStage[r.stage] = (byStage[r.stage] ?? 0) + 1;
      if (r.fallbackCode !== undefined) fallbacks[r.fallbackCode] = (fallbacks[r.fallbackCode] ?? 0) + 1;
    }
    return Object.freeze({ records: this.records.length, byStage: Object.freeze(byStage), fallbacks: Object.freeze(fallbacks) });
  }

  /** מבנה סופי; undefined עבור trace 'off'. */
  build(): DecisionLedger | undefined {
    if (this.trace === 'off') return undefined;
    const full = this.trace === 'decisions' || this.trace === 'full';
    const shown = full ? this.records : [];
    return Object.freeze({
      schemaVersion: 1,
      traceLevel: this.trace,
      records: Object.freeze(shown),
      summary: this.summarize(),
    });
  }
}

/** סריאליזציה של ledger — כל רשומה עוברת canonicalJson (בדיקה: ערכים סדירים). */
export function serializeDecisionLedger(ledger: DecisionLedger): string {
  return canonicalJson(ledger);
}

export function parseDecisionLedger(text: string): DecisionLedger {
  const parsed = JSON.parse(text) as DecisionLedger;
  if (!isTraceLevel(parsed?.traceLevel)) {
    throw new LayoutApiError('errors.layoutir.INVALID_LEDGER', { issues: 'traceLevel' }, 'ledger שגוי');
  }
  for (const rec of parsed?.records ?? []) {
    const issues = decisionRecordIssues(rec);
    if (issues.length > 0) {
      throw new LayoutApiError('errors.layoutir.INVALID_LEDGER', { issues: issues.join('; ') }, `רשומת החלטה שגויה: ${issues.join('; ')}`);
    }
  }
  return parsed;
}
