/**
 * page-search.test.ts — בדיקות שלב 51: חיפוש חסום ודטרמיניסטי לעמודים
 * (אפיון §9.2, §6.7, §6.6; ADR-010; פרק ז/M6).
 *
 * מה מוכח כאן:
 *   1. **שחזור תוצאה**: אותו קלט ⇐ אותו מסלול, אותו פנקס ואותו
 *      מלאי תקציב — 10 ריצות (שער השלב: "בחירת עמוד מוסברת ומוגבלת").
 *   2. **תקציבים קטנים/גדולים**: אלומה רחבה מוצאת מסלול שאינו גרוע
 *      מהצר; בפיקסטורה ייעודית היא מוצאת את המסלול המאוזן.
 *   3. **tie-break וסדר מועמדים**: וקטור ⇒ stateHash ⇒ מספר יצירה;
 *      ריצה כפולה נותנת תוצאה זהה בוקטור ובמסלול.
 *   4. **טבלת המרה**: מצב שנראה באיכות טובה/שווה ⇒ dominated נרשם
 *      עם מזהה המודח והמודח, ואינו מורחב.
 *   5. **מיצוי תקציב**: fallback מפורש SEARCH_BUDGET_EXHAUSTED בפנקס,
 *      status=budget-exhausted; המדיניות יכולה לאסור (allowFallback=false)
 *      ⇒ כשל מפורש מקוטלג.
 *   6. **הפנקס מתעד הכל**: לכל הרחבה שהתקבלה רשומה; לכל dominated
 *      רשומה; גזימות cap ו-beam נרשמות עם קודי סיבה.
 *   7. **שרשרת המעברים של המסלול** עוברת את verifyTransitionChain של
 *      שלב 49 (המסלול מוסבר מעבר-לעבר; שער שלב 49 מתממש בפועל).
 *   8. וקטור איכות: אורך 9 חובה; לקסיקוגרפיה; חיבור; סקלר תצוגה.
 *   9. מקור שאינו מסתיים (מעגל) ⇒ כשל מפורש; מקור ריק ⇒ complete
 *      עם מסלול ריק.
 */
import { describe, expect, test } from 'vitest';
import { DecisionLedgerBuilder } from '@tora/layout-api';
import { LayoutEngineError } from '../src/errors.js';
import {
  advanceCursor,
  consumeRegion,
  initialPaginationState,
  openPage,
  parseCursor,
  switchColumn,
  verifyTransitionChain,
  type PaginationState,
  type PaginationTransition,
} from '../src/pagination/state.js';
import {
  comparePageQuality,
  DEFAULT_PAGE_SEARCH_BUDGET,
  pageQualityDisplayScalar,
  PAGE_QUALITY_LENGTH,
  searchPages,
  ZERO_PAGE_QUALITY,
  type PageCandidateSource,
  type PageExpansion,
  type PageQualityVector,
} from '../src/pagination/search.js';

const REGIONS: Readonly<Record<string, number>> = Object.freeze({
  'page:1:col:0': 600000,
  'page:1:col:1': 600000,
  'page:1:notes': 80000,
});

function initial(): PaginationState {
  return initialPaginationState({ firstBlockId: 'body|1|para', remainingByRegion: REGIONS as never });
}

function q(components: Partial<Record<number, number>> = {}): PageQualityVector {
  const out = new Array<number>(PAGE_QUALITY_LENGTH).fill(0);
  for (const [i, v] of Object.entries(components)) out[Number(i)] = v!;
  return Object.freeze(out);
}

const LINE_LU = 1000;
const COLUMN_LINES = 600; // 600000 / 1000

/** אזורי עמוד לפי אינדקס — מפתחות קנוניים page:{N}:… */
function regionsFor(pageIndex: number): Record<string, number> {
  return {
    [`page:${pageIndex}:col:0`]: 600000,
    [`page:${pageIndex}:col:1`]: 600000,
    [`page:${pageIndex}:notes`]: 80000,
  };
}

interface VariantSpec {
  readonly id: string;
  /** כמות קווים בהרחבה זו. */
  readonly fill: number;
  /** רכיב 8 (columnImbalance) פר קו. */
  readonly imbalancePerLine: number;
}

/**
 * מקור מועמדים דטרמיניסטי לבדיקה: מסמך של `totalLines` קווים; מספר
 * הקווים שנצרכו נגזר מהסמן (fragmentIndex). כל וריאנט ממלא עמוד/טור
 * עד גבול הנותר — מעברי טור/עמוד דרך המעברים הטהורים של שלב 49.
 * closesRegion מסומן להרחבה שפתחה עמוד חדש (מעבר עמוד = סגירת אזור
 * בפיקסטורה זו).
 */
function makePageSource(totalLines: number, variants: readonly VariantSpec[]): PageCandidateSource {
  const cache = new Map<string, readonly PageExpansion[]>();
  return {
    expansions(state: PaginationState): readonly PageExpansion[] {
      const hit = cache.get(state.stateHash);
      if (hit !== undefined) return hit;
      const result = build(state);
      cache.set(state.stateHash, result);
      return result;
    },
  };
  function build(state: PaginationState): readonly PageExpansion[] {
    const linesDone = parseCursor(state.contentCursor).fragmentIndex;
    const linesLeft = totalLines - linesDone;
    if (linesLeft <= 0) return [];
    const out: PageExpansion[] = [];
    for (const v of variants) {
      const take = Math.min(v.fill, linesLeft);
      let s = state;
      const transitions: PaginationTransition[] = [];
      let openedPage = false;
      for (let i = 0; i < take; i++) {
        // קו נוסף בטור הנוכחי; אם אין מקום — החלפת טור ואז עמוד חדש
        const regionId = `page:${s.physicalPageIndex}:col:${s.columnIndex}`;
        if ((s.remainingByRegion[regionId] ?? 0) >= LINE_LU) {
          const step = consumeRegion(s, regionId, LINE_LU);
          transitions.push(step.transition);
          s = step.state;
        } else if (s.columnIndex === 0) {
          const sw = switchColumn(s, 1);
          transitions.push(sw.transition);
          const step = consumeRegion(sw.state, `page:${sw.state.physicalPageIndex}:col:1`, LINE_LU);
          transitions.push(step.transition);
          s = step.state;
        } else {
          const pg = openPage(s, regionsFor(s.physicalPageIndex + 1) as never);
          transitions.push(pg.transition);
          const step = consumeRegion(pg.state, `page:${pg.state.physicalPageIndex}:col:0`, LINE_LU);
          transitions.push(step.transition);
          s = step.state;
          openedPage = true;
        }
        // קידום הסמן — מספר הקווים שנצרכו נשמר בסמן (fragmentIndex)
        const adv = advanceCursor(s, {
          blockId: parseCursor(s.contentCursor).blockId,
          fragmentIndex: linesDone + i + 1,
          atomIndex: 0,
        });
        transitions.push(adv.transition);
        s = adv.state;
      }
      out.push({
        candidateId: `fill:${v.id}:${take}`,
        transitions,
        toState: s,
        quality: q({
          8: v.imbalancePerLine * take,
          9: s.physicalPageIndex - 1 - (state.physicalPageIndex - 1),
        }),
        closesRegion: openedPage,
      });
    }
    return out;
  }
}

/** מקור סמנים פשוט — צעד אחד בכל הרחבה (בדיקות שרשרת וטבלה). */
function makeStepSource(steps: number): PageCandidateSource {
  const cache = new Map<string, readonly PageExpansion[]>();
  return {
    expansions(state) {
      const hit = cache.get(state.stateHash);
      if (hit !== undefined) return hit;
      const f = parseCursor(state.contentCursor).fragmentIndex;
      if (f >= steps) return [];
      const step = advanceCursor(state, { blockId: 'body|1|para', fragmentIndex: f + 1, atomIndex: 0 });
      const result: readonly PageExpansion[] = [Object.freeze({
        candidateId: `step:${f + 1}`,
        transitions: [step.transition],
        toState: step.state,
        quality: q({ 8: f % 2 === 0 ? 1 : 0 }),
        closesRegion: false,
      })];
      cache.set(state.stateHash, result);
      return result;
    },
  };
}

describe('שלב 51 — חיפוש חסום ודטרמיניסטי לעמודים (§9.2; ADR-010)', () => {
  test('וקטור איכות: אורך 9 חובה; לקסיקוגרפיה; סקלר תצוגה', () => {
    expect(PAGE_QUALITY_LENGTH).toBe(9);
    expect(comparePageQuality(q({ 0: 1 }), q({ 0: 2 }))).toBe(-1);
    expect(comparePageQuality(q({ 0: 2, 8: 0 }), q({ 0: 2, 8: 5 }))).toBe(-1);
    expect(comparePageQuality(ZERO_PAGE_QUALITY, ZERO_PAGE_QUALITY)).toBe(0);
    expect(() => comparePageQuality([1, 2] as never, ZERO_PAGE_QUALITY)).toThrow(LayoutEngineError);
    expect(pageQualityDisplayScalar(q({ 8: 1 }))).toBeGreaterThan(0);
    expect(pageQualityDisplayScalar(ZERO_PAGE_QUALITY)).toBe(0);
  });

  test('שחזור תוצאה: אותו מסלול, אותו פנקס ואותו תקציב — 10 ריצות', () => {
    const source = makePageSource(COLUMN_LINES * 2 + 30, [
      { id: 'small', fill: 3, imbalancePerLine: 0 },
      { id: 'large', fill: 7, imbalancePerLine: 2 },
    ]);
    const runOnce = () => {
      const ledger = new DecisionLedgerBuilder('decisions');
      const res = searchPages(initial(), source, ledger);
      const built = ledger.build()!;
      return JSON.stringify({
        path: res.path.map((e) => e.candidateId),
        quality: res.quality,
        budget: res.budget,
        records: built.records.length,
      });
    };
    const results = new Set(Array.from({ length: 10 }, runOnce));
    expect(results.size).toBe(1);
  });

  test('תקציבים קטנים/גדולים: אלומה רחבה אינה גרועה מהצרה; מוצאת את המאוזן', () => {
    // small: 3 קווים להרחבה, איזון מושלם; large: 7 קווים, חוסר איזון כבד.
    // רכיב 8 (איזון) לפני 9 (ספירת עמודים) — הווקטור מעדיף איזון.
    const total = 21;
    const source = makePageSource(total, [
      { id: 'small', fill: 3, imbalancePerLine: 0 },
      { id: 'large', fill: 7, imbalancePerLine: 5 },
    ]);
    const narrow = searchPages(initial(), source, new DecisionLedgerBuilder('decisions'), {
      budget: { maxCandidatesPerState: 8, maxBeamWidth: 1, maxExpandedStates: 1000, maxOuterIterations: 8 },
    });
    const wide = searchPages(initial(), source, new DecisionLedgerBuilder('decisions'), {
      budget: { maxCandidatesPerState: 8, maxBeamWidth: 16, maxExpandedStates: 1000, maxOuterIterations: 8 },
    });
    expect(narrow.status).toBe('complete');
    expect(wide.status).toBe('complete');
    // הכל נצרך (21 קווים עד הסוף)
    expect(parseCursor(wide.finalState.contentCursor).fragmentIndex).toBe(total);
    expect(parseCursor(narrow.finalState.contentCursor).fragmentIndex).toBe(total);
    // האלומה הרחבה אינה גרועה מהצרה לעולם
    expect(comparePageQuality(wide.quality, narrow.quality)).toBeLessThanOrEqual(0);
    // ובפיקסטורה זו היא אכן מוצאת את המסלול המאוזן (רכיב 8 = 0)
    expect(wide.quality[8]).toBe(0);
  });

  test('tie-break: וקטור ⇒ stateHash ⇒ יצירה; ריצה כפולה זהה', () => {
    // שני וריאנטים עם אותה איכות — ההכרעה לפי הסדר הקנוני בלבד
    const source = makePageSource(9, [
      { id: 'a', fill: 3, imbalancePerLine: 0 },
      { id: 'b', fill: 3, imbalancePerLine: 0 },
    ]);
    const r1 = searchPages(initial(), source, new DecisionLedgerBuilder('decisions'));
    const r2 = searchPages(initial(), source, new DecisionLedgerBuilder('decisions'));
    expect(r1.path.map((e) => e.candidateId)).toEqual(r2.path.map((e) => e.candidateId));
    expect(r1.quality).toEqual(r2.quality);
    expect(r1.finalState.stateHash).toEqual(r2.finalState.stateHash);
  });

  test('טבלת המרה: מצב שנראה באיכות טובה/שווה ⇒ dominated נרשם ואינו מורחב', () => {
    // שני מועמדים לאותו toState — השני (הגרוע) מודח בטבלה ונרשם
    const inner = makeStepSource(4);
    const source: PageCandidateSource = {
      expansions(state) {
        const exps = inner.expansions(state);
        if (exps.length === 0) return [];
        return [
          exps[0]!,
          { ...exps[0]!, candidateId: `${exps[0]!.candidateId}:worse`, quality: q({ 8: 7 }) },
        ];
      },
    };
    const ledger = new DecisionLedgerBuilder('full');
    const res = searchPages(initial(), source, ledger);
    expect(res.status).toBe('complete');
    const records = ledger.build()!.records;
    const domRecords = records.filter((r) => r.rejected.some((x) => x.reason === 'transposition-dominated'));
    expect(domRecords.length).toBeGreaterThan(0);
    for (const r of domRecords) {
      expect(r.selectedCandidateId).not.toContain(':worse');
      expect(r.rejected[0]!.candidateId).toContain(':worse');
    }
    expect(res.budget.dominated).toBe(domRecords.length);
    // המסלול עצמו נקי מכפילויות — כל מעבר ייחודי
    const hashes = res.path.flatMap((e) => e.transitions).map((t) => t.fromStateHash);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  test('מיצוי תקציב: fallback מפורש SEARCH_BUDGET_EXHAUSTED; איסור ⇒ כשל מפורש', () => {
    // 40 קווים בהרחבות של 3 — לפחות 14 הרחבות; תקציב 6 ⇒ מיצוי מובטח
    const source = makePageSource(40, [
      { id: 'small', fill: 3, imbalancePerLine: 1 },
      { id: 'large', fill: 5, imbalancePerLine: 2 },
    ]);
    const tinyBudget = { maxCandidatesPerState: 8, maxBeamWidth: 4, maxExpandedStates: 6, maxOuterIterations: 8 };
    const ledger = new DecisionLedgerBuilder('full');
    const res = searchPages(initial(), source, ledger, { budget: tinyBudget });
    expect(res.status).toBe('budget-exhausted');
    expect(res.budget.exhausted).toBe(true);
    const records = ledger.build()!.records;
    const fb = records.filter((r) => r.fallbackCode === 'SEARCH_BUDGET_EXHAUSTED');
    expect(fb.length).toBe(1);
    expect(fb[0]!.scopeId).toBe('search:budget-exhausted');
    expect(fb[0]!.selectedCandidateId.startsWith('node:')).toBe(true);
    // אסור לפי המדיניות — כשל מפורש מקוטלג (לא תוצאה חלקית בשקט)
    expect(() => searchPages(initial(), source, new DecisionLedgerBuilder('decisions'), {
      budget: tinyBudget,
      allowBudgetExhaustedFallback: false,
    })).toThrow(LayoutEngineError);
  });

  test('מקור ריק ⇒ complete עם מסלול ריק; מקור מעגלי ⇒ כשל מפורש', () => {
    const empty: PageCandidateSource = { expansions: () => [] };
    const res = searchPages(initial(), empty, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    expect(res.path).toEqual([]);
    expect(res.finalState.stateHash).toBe(initial().stateHash);
    expect(res.quality).toEqual(ZERO_PAGE_QUALITY);
    // מקור מעגלי: הרחבה שמחזירה לאותו מצב בדיוק — נדחית בטבלה (equal),
    // החזית מתרוקנת בלי מצב סופי ⇒ כשל מפורש מקוטלג
    const cyclic: PageCandidateSource = {
      expansions(state) {
        return [Object.freeze({
          candidateId: 'loop',
          transitions: [],
          toState: state,
          quality: ZERO_PAGE_QUALITY,
          closesRegion: false,
        })];
      },
    };
    expect(() => searchPages(initial(), cyclic, new DecisionLedgerBuilder('decisions'))).toThrow(LayoutEngineError);
  });

  test('הפנקס מתעד הכל: הרחבות שהתקבלו, dominated, גזימות cap ו-beam', () => {
    // 10 וריאנטים בני-הבחנה (יעדים שונים, איכויות שונות) — חסד 4 גוזם 6;
    // אלומה 2 גוזזת את שאר הילדים
    const inner = makeStepSource(6);
    const source: PageCandidateSource = {
      expansions(state) {
        const exps = inner.expansions(state);
        if (exps.length === 0) return [];
        return Array.from({ length: 10 }, (_, i) => {
          const f = parseCursor(state.contentCursor).fragmentIndex;
          const step = advanceCursor(state, { blockId: 'body|1|para', fragmentIndex: f + 1 + i, atomIndex: 0 });
          return Object.freeze({
            candidateId: `jump:${i + 1}`,
            transitions: [step.transition],
            toState: step.state,
            quality: q({ 8: i }),
            closesRegion: false,
          });
        });
      },
    };
    const ledger = new DecisionLedgerBuilder('full');
    const res = searchPages(initial(), source, ledger, {
      budget: { maxCandidatesPerState: 4, maxBeamWidth: 2, maxExpandedStates: 500, maxOuterIterations: 8 },
    });
    expect(res.status).toBe('complete');
    const records = ledger.build()!.records;
    const capRecords = records.filter((r) => r.rejected.some((x) => x.reason === 'candidate-cap-pruned'));
    expect(capRecords.length).toBeGreaterThan(0);
    expect(capRecords[0]!.rejected.length).toBe(6);
    const beamRecords = records.filter((r) => r.rejected.some((x) => x.reason === 'beam-pruned'));
    expect(beamRecords.length).toBeGreaterThan(0);
    // הרחבות שהתקבלו נרשמות (לפחות מסלול הזוכה)
    const accepted = records.filter((r) => r.rejected.length === 0 && r.scopeId.startsWith('search:exp:'));
    expect(accepted.length).toBeGreaterThanOrEqual(res.path.length);
  });

  test('שרשרת המעברים של המסלול עוברת את verifyTransitionChain (שער שלב 49 בפועל)', () => {
    const source = makePageSource(COLUMN_LINES + 15, [
      { id: 'small', fill: 3, imbalancePerLine: 0 },
      { id: 'large', fill: 5, imbalancePerLine: 3 },
    ]);
    const res = searchPages(initial(), source, new DecisionLedgerBuilder('decisions'));
    expect(res.path.length).toBeGreaterThan(0);
    const transitions = res.path.flatMap((e) => e.transitions);
    expect(() => verifyTransitionChain(initial(), transitions)).not.toThrow();
    // המצב הסופי של התוצאה הוא אכן המצב שאליו מגיעה השרשרת
    const last = res.path[res.path.length - 1]!;
    expect(last.toState.stateHash).toBe(res.finalState.stateHash);
    // כל fromHash ייחודי — אין הרחבה כפולה
    const hashes = transitions.map((t) => t.fromStateHash);
    expect(new Set(hashes).size).toBe(hashes.length);
    // כל התוכן נצרך
    expect(parseCursor(res.finalState.contentCursor).fragmentIndex).toBe(COLUMN_LINES + 15);
  });

  test('סגירת אזור עימוד נרשמת בתוצאה ובפנקס (§9.2)', () => {
    const total = COLUMN_LINES * 2 + 10; // מחייב מעברי עמוד
    const source = makePageSource(total, [
      { id: 'small', fill: 3, imbalancePerLine: 0 },
      { id: 'large', fill: 7, imbalancePerLine: 2 },
    ]);
    const ledger = new DecisionLedgerBuilder('full');
    const res = searchPages(initial(), source, ledger);
    expect(res.status).toBe('complete');
    expect(res.finalState.physicalPageIndex).toBeGreaterThan(1);
    expect(res.regionClosures.length).toBeGreaterThan(0);
    for (const idx of res.regionClosures) {
      expect(res.path[idx]!.closesRegion).toBe(true);
    }
    const regionRecords = ledger.build()!.records.filter((r) => r.scopeId.startsWith('search:region:'));
    expect(regionRecords.length).toBeGreaterThanOrEqual(res.regionClosures.length);
  });

  test('ברירת המחדל של תקציב העמודים (ADR-010 §3) — נפרדת משבירת השורות', () => {
    expect(DEFAULT_PAGE_SEARCH_BUDGET.maxCandidatesPerState).toBe(64);
    expect(DEFAULT_PAGE_SEARCH_BUDGET.maxBeamWidth).toBe(8);
    expect(DEFAULT_PAGE_SEARCH_BUDGET.maxExpandedStates).toBe(100000);
    expect(DEFAULT_PAGE_SEARCH_BUDGET.maxOuterIterations).toBe(8);
    expect(Object.isFrozen(DEFAULT_PAGE_SEARCH_BUDGET)).toBe(true);
  });
});
