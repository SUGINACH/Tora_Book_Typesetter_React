/**
 * quality-comparator.test.ts — בדיקות שלב 43: אילוצים קשים מול עלויות,
 * QualityVector ו־comparator לקסיקוגרפי (§6.6, §8.2; ADR-004).
 *
 * מה מוכח כאן:
 *   1. אילוץ קשה אינו מנוצח על ידי cost נמוך: מועמד גלישה נפסל לפני
 *      תמחור — ה־DP מעדיף "אין מסלור" על מסלור גולש, גם כשהגלישה
 *      היתה נותנת badness 0.
 *   2. סדר לקסיקוגרפי: fallbackSeverity מנצח lineBadness ענק; runt
 *      מנצח badness; badness מנצח hyphen.
 *   3. תכונות הסדר (property, מוזרעים — LCG דטרמיניסטי, לא Math.random):
 *      אנטי־סימטריה, טרנזיטיביות, ואינווריאנטיות לחיבור — התנאי
 *      לנכונות ה־DP על וקטורים.
 *   4. תיקו וקטורי נשבר לפי רצף אינדקסי השבירה (compareBreakSequences),
 *      ואז לפי מזהה יצירה — יציב בין ריצות.
 *   5. כל דחייה וניצחון של ה־DP נרשמים בפנקס (dpLedgerEntries ⇐ רשומות
 *      תקפות של DecisionLedgerBuilder אמיתי).
 *   6. המודל הווקטורי משמר את הוכחת הגלובליות של שלב 42.
 */
import { describe, expect, test } from 'vitest';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import { parseSourceText } from '@tora/content-model';
import { allBlocks, DecisionLedgerBuilder, type ContentBlock } from '@tora/layout-api';
import { LineCandidateIndex } from '../src/linebreak/candidates.js';
import { tokenize, type InlineLike } from '../src/linebreak/tokens.js';
import { shapeParagraph } from '../src/linebreak/shaping.js';
import { breakParagraphDP, compareBreakSequences } from '../src/linebreak/dp.js';
import { createLevel0Policy } from '../src/linebreak/policy.js';
import {
  addQuality, compareQuality, createQualityCostModel, FALLBACK_SEVERITY_WEIGHT,
  lineQualityVector, QUALITY_VECTOR_KEYS, ZERO_QUALITY, type QualityVector,
} from '../src/linebreak/quality.js';
import { dpLedgerEntries } from '../src/linebreak/ledger-adapter.js';

const FONT = Object.freeze({
  fontId: 'guttman-rashi-normal',
  contentSha256: 'a'.repeat(64),
  family: 'Guttman Rashi',
  weight: 400,
  style: 'normal' as const,
});
const provider = createTestMeasurementProvider();
const FONT_SIZE_LU = 16000;

function indexFor(text: string): { index: LineCandidateIndex; bt: ReturnType<typeof tokenize> } {
  const parsed = parseSourceText(`כותרת 1 - ח\n${text}\n`, { documentId: 'q-test', sourceName: 'q-test.txt' });
  const blocks = allBlocks(parsed.doc).filter((b) => b.role !== 'note-body') as readonly ContentBlock[];
  const bt = tokenize(blocks[1]!.id as string, blocks[1]!.inline as InlineLike, new Map());
  const shaped = shapeParagraph(bt.atoms, provider, FONT, FONT_SIZE_LU as never);
  return { index: new LineCandidateIndex(bt, shaped, () => 0), bt };
}

const BUDGET = { maxCandidatesPerState: 64, maxBeamWidth: 8 };
const vec = (overrides: Partial<QualityVector> = {}): QualityVector => Object.freeze({ ...ZERO_QUALITY, ...overrides });

describe('שלב 43: אילוץ קשה מול cost', () => {
  test('מועמד גלישה נפסל לפני תמחור — ה־DP מעדיף כישלון מפורש על מסלור גולש', () => {
    // מילה ארוכה מהטור באמצע פסקה: קו הגלישה "היה נותן" badness 0 — אך הוא
    // בלתי חוקי; אין המרת אילוץ קשה לקנס רך
    const { index } = indexFor('א ב ג ד אאאאאאאאאאאאאאאאאאאא ה ו ז ח');
    const W = 30000;
    const dp = breakParagraphDP(index, createQualityCostModel(W), createLevel0Policy(), W, BUDGET);
    expect(dp.best).toBeNull();
    expect(dp.lines).toHaveLength(0);
    expect(dp.rejections.some((r) => r.reason === 'overflow')).toBe(true);
    // אף מועמד לא תומחר בלי חוקיות: כל הדחיות עם קוד סיבה מפורש
    expect(dp.rejections.every((r) => r.reason === 'overflow' || r.reason === 'underfill')).toBe(true);
  });

  test('מודל הווקטור משמר את הוכחת הגלובליות של שלב 42 (מקף)', () => {
    const { index } = indexFor('א ב ג ד ה ו ז ח- ט י כ ל מ נ ס ע');
    const W = 96000;
    const dp = breakParagraphDP(index, createQualityCostModel(W), createLevel0Policy(), W, BUDGET);
    expect(dp.best).not.toBeNull();
    expect(dp.lines.every((l) => !l.candidate.metrics.hyphenEnd)).toBe(true);
    // וקטור המסלור: אפס חומרה, אפס מקפים, badness שלם חיובי
    expect(dp.best!.hyphenDebt).toBe(0);
    expect(dp.best!.fallbackSeverity).toBe(0);
    expect(Number.isInteger(dp.best!.lineBadness)).toBe(true);
  });
});

describe('שלב 43: comparator לקסיקוגרפי', () => {
  test('fallbackSeverity מנצח lineBadness ענק', () => {
    const withFallback = vec({ fallbackSeverity: 1, lineBadness: 0 });
    const clean = vec({ fallbackSeverity: 0, lineBadness: 999_999 });
    expect(compareQuality(withFallback, clean)).toBeGreaterThan(0); // הגלישה מפסידה
    expect(compareQuality(clean, withFallback)).toBeLessThan(0);
  });

  test('runtDebt מנצח lineBadness; lineBadness מנצח hyphenDebt (סדר ADR-004)', () => {
    expect(compareQuality(vec({ runtDebt: 1, lineBadness: 0 }), vec({ lineBadness: 999_999 }))).toBeGreaterThan(0);
    // badness זהה ⇒ פחות מקפים מנצח (המקף אחרי ה-badness בסדר)
    expect(compareQuality(vec({ lineBadness: 5_000 }), vec({ lineBadness: 5_000, hyphenDebt: 100 }))).toBeLessThan(0);
    expect(compareQuality(vec({ lineBadness: 5_000, hyphenDebt: 1 }), vec({ lineBadness: 4_999 }))).toBeGreaterThan(0);
    // והרכיבים שמופעלים ב־M6 אינם משפיעים כשהם 0 משני הצדדים
    expect(compareQuality(vec({ lineBadness: 1 }), vec({ lineBadness: 2, noteDisplacement: 0, columnImbalance: 0 }))).toBeLessThan(0);
  });

  test('תכונות הסדר — אנטי־סימטריה, טרנזיטיביות, אינווריאנטיות לחיבור (LCG מוזרע)', () => {
    // מחולל דטרמיניסטי — אין Math.random (כלל 1: דטרמיניזם קודם לכול)
    let seed = 20261102;
    const rnd = (max: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % max;
    };
    const randVec = (): QualityVector => vec({
      fallbackSeverity: rnd(3), headingEscortDebt: rnd(2), noteDisplacement: rnd(2),
      widowOrphanDebt: rnd(3), runtDebt: rnd(2), lineBadness: rnd(40_001),
      hyphenDebt: rnd(5), columnImbalance: rnd(2), pageCountDebt: rnd(2),
    });
    for (let i = 0; i < 2000; i++) {
      const a = randVec();
      const b = randVec();
      const c = randVec();
      const ab = compareQuality(a, b);
      const ba = compareQuality(b, a);
      expect(Math.sign(ab)).toBe(-Math.sign(ba)); // אנטי־סימטריה
      if (ab < 0) {
        // טרנזיטיביות דרך c
        const bc = compareQuality(b, c);
        const ac = compareQuality(a, c);
        if (bc <= 0) expect(ac).toBeLessThanOrEqual(0);
        // אינווריאנטיות לחיבור: a<b ⇐ a+c<b+c (תנאי ה־DP)
        expect(compareQuality(addQuality(a, c), addQuality(b, c))).toBeLessThan(0);
      }
    }
  });

  test('QUALITY_VECTOR_KEYS — 9 רכיבים בסדר ADR-004', () => {
    expect(QUALITY_VECTOR_KEYS).toEqual([
      'fallbackSeverity', 'headingEscortDebt', 'noteDisplacement', 'widowOrphanDebt',
      'runtDebt', 'lineBadness', 'hyphenDebt', 'columnImbalance', 'pageCountDebt',
    ]);
  });
});

describe('שלב 43: תיקו קנוני לפי רצף אינדקסי שבירה', () => {
  test('compareBreakSequences — לקסיקוגרפי; קידומת קצרה קודמת', () => {
    expect(compareBreakSequences([2, 8], [4, 6])).toBeLessThan(0);
    expect(compareBreakSequences([2, 8], [2, 10])).toBeLessThan(0);
    expect(compareBreakSequences([2, 8], [2, 8, 12])).toBeLessThan(0);
    expect(compareBreakSequences([2, 8], [2, 8])).toBe(0);
    expect(compareBreakSequences([10], [2])).toBeGreaterThan(0);
  });

  test('תיקו וקטורי בפועל — הבחירה יציבה בין ריצות ומוסברת בפנקס', () => {
    const { index } = indexFor('אב אב אב אב אב אב');
    const W = 50000;
    const r1 = breakParagraphDP(index, createQualityCostModel(W), createLevel0Policy(), W, BUDGET);
    const r2 = breakParagraphDP(index, createQualityCostModel(W), createLevel0Policy(), W, BUDGET);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
    expect(r1.dominated.length + r1.rejections.length).toBeGreaterThan(0); // יש הכרעות מתועדות
  });
});

describe('שלב 43: רישום דחיות וניצחונות בפנקס', () => {
  test('dpLedgerEntries ⇐ רשומות תקפות של DecisionLedgerBuilder אמיתי', () => {
    const { index, bt } = indexFor('א ב ג ד ה ו ז ח- ט י כ ל מ נ ס ע');
    const W = 96000;
    const dp = breakParagraphDP(index, createQualityCostModel(W), createLevel0Policy(), W, BUDGET);
    const entries = dpLedgerEntries('test-block', bt, dp, W);
    expect(entries.length).toBe(dp.lines.length);
    // הפנקס האמיתי מקבל את כולן בלי שגיאת סכמה
    const ledger = new DecisionLedgerBuilder('decisions');
    for (const e of entries) ledger.append(e);
    const built = ledger.build();
    expect(built?.records.length).toBe(dp.lines.length);
    // לכל קו: מזהה נבחר, מועמדים, דחיות עם סיבה, תקציב ו-spans
    for (const [i, e] of entries.entries()) {
      expect(e.stage).toBe('line-break');
      expect(e.scopeId).toBe(`test-block#f${i}`);
      expect(e.selectedCandidateId).toMatch(/^c:\d+:\d+$/);
      expect(e.candidates.length).toBeGreaterThanOrEqual(1);
      expect(e.candidates[0]!.id).toBe(e.selectedCandidateId);
      expect(e.sourceSpans.length).toBeGreaterThan(0);
      expect(e.budget).toBeDefined();
    }
    // דחיות comparator/חוקיות נרשמות עם סיבה מפורשת
    const reasons = new Set(entries.flatMap((e) => e.rejected.map((r) => r.reason)));
    expect(reasons.size).toBeGreaterThan(0);
    for (const r of reasons) {
      expect(['overflow', 'underfill', 'dominated-by-comparator', 'spans-mandatory-break']).toContain(r);
    }
  });

  test('lineQualityVector — last/natural ללא badness; justify עם badness שלם; חומרת fallback לפי המדידה (שלב 44)', () => {
    const { index } = indexFor('א ב ג ד ה ו ז');
    const cand = (tokIdx: number) => {
      const bp = index.breakPlan.points.find((p) => p.tokenIndex === tokIdx)!;
      return {
        candidate: { metrics: index.measure(0, tokIdx), id: `c:0:${tokIdx}`, breakPoint: bp } as never,
        lineIndex: 0,
        isFirst: true,
        isLast: bp.kind === 'end',
        justification: bp.kind === 'end' ? ('last' as const) : ('justify' as const),
      };
    };
    // קו justify חוקי (בתוך המתיחה המלאה): badness שלם חיובי, אפס חומרת fallback
    const qLegal = lineQualityVector(cand(6) as never, 36000);
    expect(qLegal.fallbackSeverity).toBe(0);
    expect(Number.isInteger(qLegal.lineBadness)).toBe(true);
    expect(qLegal.lineBadness).toBeGreaterThan(0);
    // סמנטיקת שלב 44 (lineFallbackCode בווקטור): קו justify רפוי מעבר למתיחה
    // המלאה הוא underfill ⇒ EMERGENCY_STRETCH ⇒ חומרת MEDIUM ברכיב הראשון —
    // גם כשהקו מתומחר ישירות. ברמה 0 קו כזה כלל אינו חוקי ונפסל ב־DP לפני
    // התמחור (אין המרת אילוץ קשה לקנס רך — שלב 43).
    const q = lineQualityVector(cand(6) as never, 60000);
    expect(Number.isInteger(q.lineBadness)).toBe(true);
    expect(q.fallbackSeverity).toBe(FALLBACK_SEVERITY_WEIGHT.MEDIUM);
    // שורה אחרונה אינה ממתחת (badness 0); כאן היא גולשת מהעמודה ⇒ EMERGENCY_LINE ⇒ HIGH
    const qLast = lineQualityVector(cand(13) as never, 60000);
    expect(qLast.lineBadness).toBe(0);
    expect(qLast.fallbackSeverity).toBe(FALLBACK_SEVERITY_WEIGHT.HIGH);
  });
});
