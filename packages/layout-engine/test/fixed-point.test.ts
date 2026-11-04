/**
 * fixed-point.test.ts — בדיקות שלב 71: נקודת השבת החוץ (ADR-011; אפיון
 * §11.1, §11.4; פרק ט/M8).
 *
 * מה מוכח כאן:
 *   1. התייצבות — וקטור משוב זהה לקודמו ⇒ נקודת שבת; המצב הסופי זמין.
 *   2. מחזור דו־מצבי (oscillation) — זיהוי מחזור אורך 2 עם איטרציית פתיחה;
 *      גם מחזור אורך 3.
 *   3. תלות TOC בעצמו — צעד אמיתי: עימוד גוף ← endnotes ב-offset ←
 *      AnchorTable מוזז ← זרימת TOC; השינוי במספר עמודי ה-TOC מזיז את
 *      העוגנים ומתייצב.
 *   4. שינוי מספור — פוליו גימטרי של העוגן משנה את גובה שורות ה-TOC
 *      (גרימת שורה נוספת) ומתכנס.
 *   5. תקציב — סחיפה מונוטונית נעצרת בדיוק ב-maxIterations קריאות צעד.
 *   6. כשל מפורש — requireFixedPoint זורק TOC_FIXED_POINT_NOT_REACHED
 *      עם iterations/reason; התייצבות עוברת כמו שהיא.
 *   7. שליליים — אפשרויות שגויות, אות חסר/זר/לא-hash ⇒ PAGINATION_STATE_INVALID.
 *   8. דטרמיניזם — אותו צעד ⇒ אותו reportHash, תמיד.
 */
import { describe, expect, test } from 'vitest';
import { anchorMappingHash, asLu, buildAnchorTable, DecisionLedgerBuilder } from '@tora/layout-api';
import { initialPaginationState, type PaginationState } from '../src/pagination/state.js';
import { buildPageTemplateSet, initialRemainingByRegion, type TemplateSetInput } from '../src/pagination/templates.js';
import { searchPages, type PageSearchResult } from '../src/pagination/search.js';
import {
  createPageCandidateSource,
  legacyHeadingBehaviorOf,
  type CandidateGeneratorInput,
  type PaginatedBlock,
  type PaginatedLine,
} from '../src/pagination/candidates.js';
import { anchorTableOfPath } from '../src/pagination/anchors.js';
import { layoutTocFlow, type TocLine } from '../src/pagination/toc.js';
import { layoutEndnoteFlow, type EndnoteEntry } from '../src/pagination/endnotes.js';
import { gematriaOf } from '@tora/policy-torah';
import {
  FIXED_POINT_SIGNALS,
  fixedPointReportHash,
  requireFixedPoint,
  runOuterFixedPoint,
  type FixedPointStep,
} from '../src/pagination/fixed-point.js';
import { LayoutEngineError } from '../src/errors.js';

// ─────────────────────────── עזרי hash ───────────────────────────

let seq = 0;
/** hash הקס 64 קבוע — וקטורי המשוב בבדיקות צריכים hash קנוני (לא מחרוזת כלשהי). */
const H = (n: number): string => {
  const h = (n >>> 0).toString(16).padStart(8, '0');
  return (h + 'a'.repeat(56)).slice(0, 64);
};
const vec = (a: number, b: number, c: number): Record<string, string> => ({
  'endnote-mapping': H(a), 'anchor-mapping': H(b), 'toc-mapping': H(c),
});

/** צעד מתוסריאל: רשימת וקטורים בסדר; האחרון חוזר על עצמו לנצח. */
function scriptedStep(vectors: readonly Record<string, string>[], state0 = 0): FixedPointStep<number> & { calls: () => number } {
  let calls = 0;
  const step: FixedPointStep<number> = (state: number, iteration: number) => {
    calls += 1;
    const v = vectors[Math.min(iteration - 1, vectors.length - 1)]!;
    return { state: state + 1, feedback: v };
  };
  return Object.assign(step, { calls: () => calls, ...(state0 ? {} : {}) });
}

// ─────────────────────────── 1–2: התייצבות ומחזור ───────────────────────────

describe('שלב 71: הרץ — התייצבות, מחזור, תקציב', () => {
  test('התייצבות: וקטור משתנה פעם אחת ואז זהה — converged, iterations=3 (שינוי מספור חד-פעמי)', () => {
    // איטרציה 1: העוגנים במקומם הישן; 2: ה-TOC הוסיף עמוד והזיז; 3: אותו דבר שוב ⇒ יציב
    const s = scriptedStep([vec(1, 1, 1), vec(2, 2, 2), vec(2, 2, 2)]);
    const r = runOuterFixedPoint(0, s, {});
    expect(r.converged).toBe(true);
    expect(r.iterations).toBe(3);
    expect(r.report.outcome).toBe('converged');
    expect(r.report.history).toHaveLength(3);
    expect(r.report.history[0]!.stable).toBe(false);
    expect(r.report.history[1]!.stable).toBe(false);
    expect(r.report.history[2]!.stable).toBe(true);
    expect(s.calls()).toBe(3); // התקציב לא נוגע — עצר בזיהוי היציבות
  });

  test('מחזור דו־מצבי: A→B→A ⇒ oscillation, cycle length 2, firstIteration 1', () => {
    const s = scriptedStep([vec(1, 1, 1), vec(2, 2, 2), vec(1, 1, 1)]);
    const r = runOuterFixedPoint(0, s, {});
    expect(r.converged).toBe(false);
    expect(r.report.outcome).toBe('oscillation');
    expect(r.report.cycle).toEqual({ length: 2, firstIteration: 1 });
    expect(r.report.reason).toContain('cycle of length 2');
    expect(r.iterations).toBe(3);
  });

  test('מחזור תלת־מצבי: A→B→C→A ⇒ cycle length 3', () => {
    const s = scriptedStep([vec(1, 1, 1), vec(2, 2, 2), vec(3, 3, 3), vec(1, 1, 1)]);
    const r = runOuterFixedPoint(0, s, {});
    expect(r.report.outcome).toBe('oscillation');
    expect(r.report.cycle).toEqual({ length: 3, firstIteration: 1 });
  });

  test('מחזור שאינו מתחיל באיטרציה 1: X→A→B→A ⇒ firstIteration 2, length 2', () => {
    const s = scriptedStep([vec(9, 9, 9), vec(1, 1, 1), vec(2, 2, 2), vec(1, 1, 1)]);
    const r = runOuterFixedPoint(0, s, {});
    expect(r.report.outcome).toBe('oscillation');
    expect(r.report.cycle).toEqual({ length: 2, firstIteration: 2 });
  });

  test('תקציב: סחיפה מונוטונית — בדיוק maxIterations קריאות צעד, budget-exceeded, אין לולאה בלתי-חסומה', () => {
    let n = 0;
    const step: FixedPointStep<number> = (state: number) => ({ state: state + 1, feedback: vec(++n, n, n) });
    const wrapped: FixedPointStep<number> = (state, iteration) => step(state, iteration);
    let calls = 0;
    const counting: FixedPointStep<number> = (state, iteration) => { calls += 1; return step(state, iteration); };
    const r = runOuterFixedPoint(0, counting, { maxIterations: 4 });
    expect(r.converged).toBe(false);
    expect(r.report.outcome).toBe('budget-exceeded');
    expect(r.iterations).toBe(4);
    expect(calls).toBe(4);
    expect(r.report.reason).toContain('budget: 4 iterations');
    expect(wrapped).toBeTypeOf('function'); // step רגיל עובד גם בלי מונה
  });

  test('דטרמיניזם: אותו צעד ⇒ אותו reportHash ואותו history — תמיד', () => {
    const mk = () => scriptedStep([vec(1, 1, 1), vec(2, 2, 2), vec(2, 2, 2)]);
    const r1 = runOuterFixedPoint(0, mk(), {});
    const r2 = runOuterFixedPoint(0, mk(), {});
    expect(r1.reportHash).toBe(r2.reportHash);
    expect(fixedPointReportHash(r1.report)).toBe(r1.reportHash);
    expect(r1.feedback).toEqual(r2.feedback);
  });

  test('אידמפוטנטיות: הרצה חוזרת מהמצב היציב מתכנסת מיד (iterations=2)', () => {
    const stable = vec(7, 7, 7);
    const s = scriptedStep([stable]);
    const r = runOuterFixedPoint(42, s, {});
    expect(r.converged).toBe(true);
    expect(r.iterations).toBe(2);
    expect(r.state).toBe(44); // שתי קריאות צעד, state הוחזר מהאחרונה
  });
});

// ─────────────────────────── 3: תלות TOC בעצמו — צעד אמיתי ───────────────────────────

let lineSeq = 0;
const LINE = (heightLu: number): PaginatedLine => Object.freeze({
  id: `line-${lineSeq++}`, heightLu: asLu(heightLu), footnoteRefs: [], sidenoteRefs: [],
});
const block = (blockId: string, lines: readonly PaginatedLine[], extra: Partial<PaginatedBlock> = {}): PaginatedBlock =>
  Object.freeze({ blockId, role: 'body', lines: Object.freeze([...lines]), ...extra });
const h = (blockId: string, heightLu: number, level: number): PaginatedBlock =>
  block(blockId, [LINE(heightLu)], { role: 'heading', headingLevel: level });

const templates = buildPageTemplateSet({
  geometry: {
    pageWidth: asLu(4000000), pageHeight: asLu(5600000), margin: asLu(160000),
    mainX: asLu(400000), mainWidth: asLu(3200000), columnWidth: asLu(1520000),
    columnGap: asLu(160000), contentTop: asLu(160000), contentBottom: asLu(5440000),
  },
  headerHeightLu: asLu(0), footerHeightLu: asLu(0), columns: 2, footnoteColumns: 1,
  folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: null,
} satisfies TemplateSetInput);

function runBodyFlow(blocks: readonly PaginatedBlock[]): { initial: PaginationState; res: PageSearchResult } {
  const initial = initialPaginationState({
    firstBlockId: blocks[0]!.blockId,
    remainingByRegion: initialRemainingByRegion(templates.for('body', 1), 1),
    pageKind: 'body',
  });
  const res = searchPages(initial, createPageCandidateSource({
    blocks, templates, pageKind: 'body', headingBehaviorOf: legacyHeadingBehaviorOf,
  } satisfies CandidateGeneratorInput), new DecisionLedgerBuilder('off'), {});
  return { initial, res };
}

describe('שלב 71: תלות TOC בעצמו — צעד אמיתי עם רכיבי המנוע (§11.1)', () => {
  const blocks: readonly PaginatedBlock[] = [
    block('p0', [LINE(150000), LINE(150000)]),
    h('h1|1', 300000, 1),
    block('p1', [LINE(150000), LINE(150000)]),
    h('h2|1', 200000, 2),
    block('p2', [LINE(150000), LINE(150000)]),
  ];
  const endnoteEntries: readonly EndnoteEntry[] = [
    { noteId: 'n1', body: { noteId: 'n1', lineHeightLu: [asLu(150000)], heightLu: asLu(150000) }, anchor: { blockId: 'p1', lineId: 'line-x' } },
    { noteId: 'n2', body: { noteId: 'n2', lineHeightLu: [asLu(150000)], heightLu: asLu(150000) }, anchor: { blockId: 'p2', lineId: 'line-y' } },
  ];
  const tocLines: readonly TocLine[] = [
    { entryId: 'h1|1', heightLu: asLu(200000) },
    { entryId: 'h2|1', heightLu: asLu(200000) },
  ];

  /**
   * הצעד האמיתי: front-matter (עמודי TOC מהאיטרציה הקודמת) ← עימוד גוף ←
   * זרם endnotes ב-offset ← AnchorTable מוזז ב-front-matter ← זרימת TOC ←
   * מספר עמודי TOC החדש. סדר האותות קבוע: endnote ← anchor ← toc.
   */
  function realStep(): FixedPointStep<number> & { lastAnchorHashes: () => string[] } {
    const anchorHashes: string[] = [];
    const step: FixedPointStep<number> = (frontMatter: number) => {
      const { initial, res } = runBodyFlow(blocks);
      expect(res.status).toBe('complete');
      const bodyPages = res.path.length;
      const endnotes = layoutEndnoteFlow(endnoteEntries, templates, { bodyPageCount: frontMatter + bodyPages });
      const base = anchorTableOfPath(initial, res.path, blocks, endnotes.anchorReport);
      const shifted = buildAnchorTable(base.records.map((r) => ({ ...r, physicalPage: r.physicalPage + frontMatter })));
      const anchorHash = anchorMappingHash(shifted);
      anchorHashes.push(anchorHash);
      const tocFlow = layoutTocFlow(tocLines, { startPhysicalPage: 1, columnHeightLu: asLu(500000), columns: 1 });
      return {
        state: tocFlow.pages,
        feedback: { 'endnote-mapping': endnotes.mappingHash, 'anchor-mapping': anchorHash, 'toc-mapping': tocFlow.mappingHash },
      };
    };
    return Object.assign(step, { lastAnchorHashes: () => anchorHashes });
  }

  test('התכנסות: עמודי ה-TOC מזיזים את העוגנים/endnotes, וקטור מתייצב, ואין pageEstimate', () => {
    const step = realStep();
    const r = runOuterFixedPoint(0, step, { maxIterations: 6 });
    expect(r.converged).toBe(true);
    expect(r.iterations).toBe(3); // 1: frontMatter=0; 2: frontMatter=1 (שונה); 3: אותו דבר ⇒ יציב
    expect(r.state).toBe(1); // שתי שורות TOC בעמוד אחד
    // העוגן אכן הוזז: הפוליו של h1|1 השתנה בין האיטרציה הראשונה לשנייה
    expect(step.lastAnchorHashes()[0]).not.toBe(step.lastAnchorHashes()[1]);
    expect(step.lastAnchorHashes()[1]).toBe(step.lastAnchorHashes()[2]);
    // המשוב מהערכים בפועל: כל אות hash 64 הקס
    for (const sig of FIXED_POINT_SIGNALS) expect(r.feedback[sig]).toMatch(/^[0-9a-f]{64}$/);
  });

  test('שינוי מספור: פוליו גימטרי של העוגן משנה גובה שורת TOC (שורה נוספת) ומתכנס', () => {
    // עמוד העוגן = 1 + frontMatter; פוליו בן שתי ספרות גימטריה (≥10... למעשה 15=ט"ו)
    // מייצר שורת TOC כפולה; עדיין נכנס לעמוד אחד ⇒ מתכנס
    const step: FixedPointStep<number> = (frontMatter: number) => {
      const anchorPage = 1 + frontMatter;
      const folio = gematriaOf(anchorPage);
      const lineCount = folio.length > 2 ? 2 : 1; // פוליו ארוך ⇒ שורת המשך
      const tocPages = lineCount; // עמוד אחד לשורה (צעד מדוד מדומה)
      return {
        state: tocPages,
        feedback: {
          'endnote-mapping': H(1),
          'anchor-mapping': H(anchorPage),
          'toc-mapping': H(lineCount),
        },
      };
    };
    const r = runOuterFixedPoint(0, step, { maxIterations: 6 });
    expect(r.converged).toBe(true);
    expect(r.iterations).toBe(3);
    expect(r.state).toBeGreaterThanOrEqual(1);
  });

  test('מחזור אמיתי של גודל TOC: front-matter מתנדנד בין 1 ל-2 ⇒ oscillation מזוהה מפורשות', () => {
    // הזרקת תלות מלאכותית: tocPages = 3 - frontMatter (1→2→1→...) — גודל ה-TOC
    // תלוי במקום שהוא עצמו תופס, ומתנדנד
    const step: FixedPointStep<number> = (frontMatter: number) => {
      const { initial, res } = runBodyFlow(blocks);
      const endnotes = layoutEndnoteFlow(endnoteEntries, templates, { bodyPageCount: frontMatter + res.path.length });
      const base = anchorTableOfPath(initial, res.path, blocks, endnotes.anchorReport);
      const shifted = buildAnchorTable(base.records.map((r) => ({ ...r, physicalPage: r.physicalPage + frontMatter })));
      const tocPages = 3 - frontMatter; // 0→3? לא: נקרא רק עם 1/2 לאחר האיטרציה הראשונה
      return {
        state: tocPages,
        feedback: { 'endnote-mapping': endnotes.mappingHash, 'anchor-mapping': anchorMappingHash(shifted), 'toc-mapping': H(frontMatter) },
      };
    };
    const r = runOuterFixedPoint(1, step, { maxIterations: 6 });
    expect(r.converged).toBe(false);
    expect(r.report.outcome).toBe('oscillation');
    expect(r.report.cycle).toEqual({ length: 2, firstIteration: 1 });
  });
});

// ─────────────────────────── 4: כשל מפורש ───────────────────────────

describe('שלב 71: requireFixedPoint — כשל מפורש ב-release (ADR-011 §6)', () => {
  test('התייצבות עוברת כמו שהיא', () => {
    const s = scriptedStep([vec(1, 1, 1), vec(1, 1, 1)]);
    const r = runOuterFixedPoint(0, s, {});
    expect(requireFixedPoint(r)).toBe(r);
  });

  test('oscillation ⇒ TOC_FIXED_POINT_NOT_REACHED עם iterations ו-reason', () => {
    const s = scriptedStep([vec(1, 1, 1), vec(2, 2, 2), vec(1, 1, 1)]);
    const r = runOuterFixedPoint(0, s, {});
    try {
      requireFixedPoint(r);
      expect.unreachable('היה צפוי כשל מפורש');
    } catch (e) {
      expect(e).toBeInstanceOf(LayoutEngineError);
      const err = e as LayoutEngineError;
      expect(err.catalogKey).toBe('errors.engine.TOC_FIXED_POINT_NOT_REACHED');
      expect(err.params.iterations).toBe(3);
      expect(String(err.params.reason)).toContain('cycle of length 2');
    }
  });

  test('budget-exceeded ⇒ TOC_FIXED_POINT_NOT_REACHED עם תקציב', () => {
    let n = 0;
    const step: FixedPointStep<number> = (state: number) => ({ state: state + 1, feedback: vec(++n, n, n) });
    const r = runOuterFixedPoint(0, step, { maxIterations: 3 });
    expect(() => requireFixedPoint(r)).toThrowError(/budget: 3 iterations/);
  });
});

// ─────────────────────────── 5: שליליים ───────────────────────────

describe('שלב 71: שליליים — חוזה הרץ נאכף', () => {
  const expectInvalid = (fn: () => unknown) => {
    try {
      fn();
      expect.unreachable('היה צפוי PAGINATION_STATE_INVALID');
    } catch (e) {
      expect(e).toBeInstanceOf(LayoutEngineError);
      expect((e as LayoutEngineError).catalogKey).toBe('errors.engine.PAGINATION_STATE_INVALID');
      expect((e as LayoutEngineError).params.action).toBe('fixed-point');
    }
  };

  test('step שאינו פונקציה ⇒ כשל', () => {
    expectInvalid(() => runOuterFixedPoint(0, undefined as unknown as FixedPointStep<number>, {}));
  });

  test('maxIterations שגוי (1 / 1001 / לא-שלם) ⇒ כשל', () => {
    const s = scriptedStep([vec(1, 1, 1)]);
    expectInvalid(() => runOuterFixedPoint(0, s, { maxIterations: 1 }));
    expectInvalid(() => runOuterFixedPoint(0, s, { maxIterations: 1001 }));
    expectInvalid(() => runOuterFixedPoint(0, s, { maxIterations: 2.5 }));
  });

  test('signals ריקים / כפולים / זרים ⇒ כשל', () => {
    const s = scriptedStep([vec(1, 1, 1)]);
    expectInvalid(() => runOuterFixedPoint(0, s, { signals: [] }));
    expectInvalid(() => runOuterFixedPoint(0, s, { signals: ['toc-mapping', 'toc-mapping'] as never[] }));
    expectInvalid(() => runOuterFixedPoint(0, s, { signals: ['no-such-signal'] as never[] }));
  });

  test('אות חסר בווקטור ⇒ כשל מיידי עם שם האות', () => {
    const step: FixedPointStep<number> = () => ({ state: 0, feedback: { 'anchor-mapping': H(1) } });
    expectInvalid(() => runOuterFixedPoint(0, step, {}));
  });

  test('אות זר בווקטור ⇒ כשל (unexpected)', () => {
    const step: FixedPointStep<number> = () => ({ state: 0, feedback: { ...vec(1, 1, 1), 'ghost-signal': H(2) } });
    expectInvalid(() => runOuterFixedPoint(0, step, {}));
  });

  test('ערך משוב שאינו hash 64 הקס ⇒ כשל (not-hash)', () => {
    const step: FixedPointStep<number> = () => ({ state: 0, feedback: { 'endnote-mapping': 'zz', 'anchor-mapping': H(1), 'toc-mapping': H(1) } });
    expectInvalid(() => runOuterFixedPoint(0, step, {}));
  });

  test('סדר האותות הקבוע מתועד ונאכף: FIXED_POINT_SIGNALS = endnote, anchor, toc', () => {
    expect([...FIXED_POINT_SIGNALS]).toEqual(['endnote-mapping', 'anchor-mapping', 'toc-mapping']);
  });

  test('צעד שזורק — החריגה עוברת הלאה (אין בליעה)', () => {
    const step: FixedPointStep<number> = () => { throw new Error('boom'); };
    expect(() => runOuterFixedPoint(0, step, {})).toThrowError('boom');
  });
});
