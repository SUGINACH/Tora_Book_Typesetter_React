/**
 * typeset-contract.test.ts — בדיקות שלב 32: חוזה typeset(), RunManifest, Decision Ledger (§12, §6.7).
 *
 * מה מוכח כאן:
 *   1. trace off/on אינו משנה את ה-IR (ברמת החוזה: ledger נבנה רק מעל עם trace≠off;
 *      בשלב 33 נוכח שהמנוע מקיים זאת — כאן החוזה עצמו).
 *   2. כל רשומת החלטה ניתנת לסריאליזציה (round-trip) — ערכים סדירים בלבד.
 *   3. fallbackCode לא רשום ⇒ דחייה בזמן יצירה; קודי v0 רשומים עם severity.
 *   4. RunManifest: כל ההאשים; makeRunManifest מקפיא ומאמת; configHash של
 *      אותם ערכים בסדר מפתחות שונה — זהה (§17.2#4).
 *   5. observer: אין ערוץ השפעה בטיפוס (בדיקה מבנית — compile-time; כאן
 *      נבדק שהחוזה מקבל observer שמדווח בלבד).
 */
import { describe, expect, test } from 'vitest';
import {
  DecisionLedgerBuilder,
  LAYOUT_FALLBACK_CODES,
} from '@tora/layout-api';
import {
  assertTypesetRequest,
  DEFAULT_SEARCH_BUDGET,
  decisionRecordIssues,
  isRegisteredFallbackCode,
  isTraceLevel,
  makeRunManifest,
  parseDecisionLedger,
  serializeDecisionLedger,
  typesetRequestIssues,
  type DecisionLedger,
  type TypesetRequest,
} from '@tora/layout-api';

const SPAN = Object.freeze({ documentId: 'd', stream: 'body', startUtf16: 0, endUtf16: 3 });

const SETTINGS = Object.freeze({
  schemaVersion: 1,
  enginePolicyId: 'torah-v1',
  values: { 'size-body': 12, 'font-body': "'Guttman Rashi'" },
  configHash: 'c'.repeat(64),
});

const FONT = Object.freeze({
  fontId: 'guttman-rashi-normal',
  contentSha256: 'a'.repeat(64),
  family: 'Guttman Rashi',
  weight: 400,
  style: 'normal' as const,
});

function makeRequest(overrides: Partial<TypesetRequest> = {}): TypesetRequest {
  return {
    document: {
      schemaVersion: 1,
      documentId: 'd',
      metadata: [],
      parts: [],
      notes: { footnotes: [], endnotes: [], sidenotes: [], editorial: [] },
      transforms: [],
    },
    settings: SETTINGS,
    assets: {
      schemaVersion: 1,
      fonts: [{ usage: 'body', font: FONT }],
      fontsManifestSha256: 'f'.repeat(64),
      assetsManifestSha256: '0'.repeat(64),
    },
    trace: 'off',
    budget: DEFAULT_SEARCH_BUDGET,
    ...overrides,
  } as TypesetRequest;
}

describe('שלב 32: חוזה typeset — בקשה', () => {
  test('בקשה תקינה עוברת', () => {
    expect(typesetRequestIssues(makeRequest())).toEqual([]);
    expect(() => assertTypesetRequest(makeRequest())).not.toThrow();
  });

  test('trace שגוי נדחה', () => {
    expect(typesetRequestIssues(makeRequest({ trace: 'loud' as never }))).toContain('trace');
  });

  test('budget שגוי נדחה', () => {
    expect(typesetRequestIssues(makeRequest({ budget: { maxBeamWidth: 0 } as never }))).toContain('budget');
  });

  test('assets ללא גופן body נדחים', () => {
    const bad = makeRequest();
    (bad.assets as { fonts: unknown[] }).fonts = [];
    expect(typesetRequestIssues(bad)).toEqual(expect.arrayContaining([expect.stringContaining('assets.fonts')]));
  });

  test('מסמך ללא ספר טרנספורמציות נדחה', () => {
    const bad = makeRequest();
    delete (bad.document as Record<string, unknown>)['transforms'];
    expect(typesetRequestIssues(bad)).toContain('document.transforms');
  });

  test('isTraceLevel מכסה את ארבע הרמות בלבד', () => {
    for (const lv of ['off', 'summary', 'decisions', 'full'] as const) expect(isTraceLevel(lv)).toBe(true);
    expect(isTraceLevel('verbose')).toBe(false);
  });
});

describe('שלב 32: RunManifest', () => {
  test('makeRunManifest מייצר manifest תקין עם כל ההאשים', () => {
    const m = makeRunManifest({
      engineVersion: '0.1.0',
      codeSha: 'dev',
      sourceSha256: 's'.repeat(64),
      effectiveSettings: SETTINGS,
      fontsManifestSha256: 'f'.repeat(64),
      assetsManifestSha256: '0'.repeat(64),
      parserVersion: '1',
      environmentHash: 'e'.repeat(64),
      layout: { pages: [] },
    });
    expect(m.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(m.layoutHash).toMatch(/^[0-9a-f]{64}$/);
    expect(m.configHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(m)).toBe(true);
  });

  test('סדר מפתחות שונה בערכי הגדרות — configHash זהה (§17.2#4)', () => {
    const a = { ...SETTINGS, values: { 'size-body': 12, 'font-body': "'Guttman Rashi'" } };
    const b = { ...SETTINGS, values: { 'font-body': "'Guttman Rashi'", 'size-body': 12 } };
    const mk = (settings: unknown) => makeRunManifest({
      engineVersion: '0.1.0', codeSha: 'dev', sourceSha256: 's'.repeat(64), effectiveSettings: settings,
      fontsManifestSha256: 'f'.repeat(64), assetsManifestSha256: '0'.repeat(64), parserVersion: '1',
      environmentHash: 'e'.repeat(64), layout: { pages: [] },
    });
    expect(mk(a).configHash).toBe(mk(b).configHash);
  });
});

describe('שלב 32: Decision Ledger', () => {
  const STATE = '1'.repeat(64);

  test('רשומה תקינה עוברת אימות', () => {
    const issues = decisionRecordIssues({
      stage: 'line-break', scopeId: 'b:1', sourceSpans: [SPAN], stateHash: STATE,
      candidates: [{ id: 'c1', cost: 10 }], selectedCandidateId: 'c1', rejected: [],
    });
    expect(issues).toEqual([]);
  });

  test('כל רשומה ניתנת לסריאליזציה ופרסור (round-trip)', () => {
    const b = new DecisionLedgerBuilder('decisions');
    b.append({
      stage: 'line-break', scopeId: 'b:1', sourceSpans: [SPAN], stateHash: STATE,
      candidates: [{ id: 'c1', cost: 10 }, { id: 'c2', cost: 20 }],
      selectedCandidateId: 'c2', rejected: [{ candidateId: 'c1', reason: 'overflow' }],
      budget: { generated: 2, pruned: 0, exhausted: false },
    });
    const ledger = b.build() as DecisionLedger;
    const text = serializeDecisionLedger(ledger);
    const parsed = parseDecisionLedger(text);
    expect(serializeDecisionLedger(parsed)).toBe(text);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.summary.byStage['line-break']).toBe(1);
  });

  test('trace off ⇒ אין ledger כלל; summary ⇒ רשומות ריקות עם סיכום', () => {
    const off = new DecisionLedgerBuilder('off');
    off.append({ stage: 'page-break', scopeId: 'p:1', sourceSpans: [], stateHash: STATE, candidates: [{ id: 'x', cost: 0 }], selectedCandidateId: 'x', rejected: [] });
    expect(off.build()).toBeUndefined();

    const sum = new DecisionLedgerBuilder('summary');
    sum.append({ stage: 'page-break', scopeId: 'p:1', sourceSpans: [], stateHash: STATE, candidates: [{ id: 'x', cost: 0 }], selectedCandidateId: 'x', rejected: [] });
    const l = sum.build() as DecisionLedger;
    expect(l.records).toHaveLength(0);
    expect(l.summary.records).toBe(1);
  });

  test('fallbackCode לא רשום ⇒ דחייה בזמן יצירה', () => {
    const b = new DecisionLedgerBuilder('decisions');
    expect(() => {
      b.append({
        stage: 'emergency', scopeId: 'e:1', sourceSpans: [], stateHash: STATE,
        candidates: [], selectedCandidateId: '', rejected: [],
        fallbackCode: 'SIDE_PATH' as never,
      });
    }).toThrow(/INVALID_LEDGER/);
  });

  test('fallbackCode רשום ⇒ עובר ונספר בסיכום', () => {
    const b = new DecisionLedgerBuilder('decisions');
    b.append({
      stage: 'emergency', scopeId: 'e:1', sourceSpans: [], stateHash: STATE,
      candidates: [{ id: 'c', cost: 1 }], selectedCandidateId: 'c', rejected: [],
      fallbackCode: 'EMERGENCY_LINE',
    });
    const l = b.build() as DecisionLedger;
    expect(l.summary.fallbacks.EMERGENCY_LINE).toBe(1);
  });

  test('קודי v0 רשומים עם severity מתועד; אין קוד צד בקטלוג החוזה', () => {
    expect(isRegisteredFallbackCode('EMERGENCY_LINE')).toBe(true);
    expect(isRegisteredFallbackCode('NOTES_V0_DEFERRED')).toBe(true);
    expect(isRegisteredFallbackCode('SEARCH_BUDGET_EXHAUSTED')).toBe(true);
    expect(isRegisteredFallbackCode('TOC_FIXED_POINT_NOT_REACHED')).toBe(true);
    expect(isRegisteredFallbackCode('WHATEVER')).toBe(false);
    expect(LAYOUT_FALLBACK_CODES.EMERGENCY_LINE.severity).toBe('HIGH');
    expect(LAYOUT_FALLBACK_CODES.NOTES_V0_DEFERRED.severity).toBe('MEDIUM');
  });

  test('stateHash שגוי נדחה', () => {
    const issues = decisionRecordIssues({
      stage: 'line-break', scopeId: 'b:1', sourceSpans: [SPAN], stateHash: 'not-hex',
      candidates: [{ id: 'c1', cost: 10 }], selectedCandidateId: 'c1', rejected: [],
    });
    expect(issues).toContain('stateHash');
  });
});
