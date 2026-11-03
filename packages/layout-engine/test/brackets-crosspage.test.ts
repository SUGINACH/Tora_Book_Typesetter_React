/**
 * brackets-crosspage.test.ts — בדיקות שלב 65: סוגריים חוצי עמוד בתוך המצב
 * (אפיון §10.4; פרק ח/M7).
 *
 * מבחני החובה: סוגריים מקוננים חוצי טור ועמוד; סוגר לא סגור בקלט מדווח
 * כבעיית קלט.
 *
 * מה מוכח כאן:
 *   1. **המחסנית במצב** (§9.1; אין protectParens): סוגריים חוצים טורים
 *      ועמודים — ה־LIFO נשמר לאורך המסלול כולו (verifyTransitionChain).
 *   2. **זיהוי חציות-עמוד**: bracketPageCrossingsOf — רק פותחים שנשארו
 *      בסוף עמוד (לא חציות-טור תוך-עמודיות).
 *   3. **קלט לקוי מדווח**: זוג שלא נסגר — atDocumentEnd, לא "מתוקן".
 *   4. **מדיניות התצוגה**: bracketTransformFor — suppress/continuation-mark
 *      כ־TransformRecord עם סיבה ומקור; none (ברירת המחדל) — אין שינוי.
 */
import { describe, expect, test } from 'vitest';
import { asLu, DecisionLedgerBuilder } from '@tora/layout-api';
import { initialPaginationState, verifyTransitionChain, type PaginationState } from '../src/pagination/state.js';
import { buildPageTemplateSet, initialRemainingByRegion, type TemplateSetInput } from '../src/pagination/templates.js';
import { searchPages } from '../src/pagination/search.js';
import {
  createPageCandidateSource,
  bracketPageCrossingsOf,
  type CandidateGeneratorInput,
  type PaginatedBlock,
  type PaginatedLine,
} from '../src/pagination/candidates.js';
import {
  bracketDisplayPolicyOf,
  bracketTransformFor,
  DEFAULT_BRACKET_DISPLAY_POLICY,
} from '@tora/policy-torah';

let lineSeq = 0;
const LINE = (heightLu: number, extra: Partial<PaginatedLine> = {}): PaginatedLine => Object.freeze({
  id: `line-${lineSeq++}`,
  heightLu: asLu(heightLu),
  footnoteRefs: [],
  sidenoteRefs: [],
  ...extra,
});
function block(blockId: string, lines: readonly PaginatedLine[], extra: Partial<PaginatedBlock> = {}): PaginatedBlock {
  return Object.freeze({ blockId, role: 'body', lines: Object.freeze([...lines]), ...extra });
}

const templates = buildPageTemplateSet({
  geometry: {
    pageWidth: asLu(4000000), pageHeight: asLu(5600000), margin: asLu(160000),
    mainX: asLu(400000), mainWidth: asLu(3200000), columnWidth: asLu(1520000),
    columnGap: asLu(160000), contentTop: asLu(160000), contentBottom: asLu(5440000),
  },
  headerHeightLu: asLu(0),
  footerHeightLu: asLu(0),
  columns: 2,
  footnoteColumns: 1,
  folioPosition: 'bottom_center',
  showFolio: false,
  sidenoteWidthLu: null,
} satisfies TemplateSetInput);
const H = templates.for('body', 1).regions.find((r) => r.role === 'body-column' && r.columnIndex === 0)!.rect.height;

const inputFor = (blocks: readonly PaginatedBlock[]): CandidateGeneratorInput => ({ blocks, templates, pageKind: 'body' });
const initialState = (firstBlockId: string): PaginationState =>
  initialPaginationState({ firstBlockId, remainingByRegion: initialRemainingByRegion(templates.for('body', 1), 1) });
const runFull = (blocks: readonly PaginatedBlock[]) => {
  const src = createPageCandidateSource(inputFor(blocks));
  const res = searchPages(initialState(blocks[0]!.blockId), src, new DecisionLedgerBuilder('decisions'));
  return { src, res, first: initialState(blocks[0]!.blockId), crossings: bracketPageCrossingsOf(initialState(blocks[0]!.blockId), res.path) };
};

describe('שלב 65 — סוגריים חוצי עמוד בתוך המצב (§10.4)', () => {
  const lineH = Math.floor(H / 10);

  test('מקוננים חוצי טור ועמוד: המחסנית נשמרת; LIFO לאורך כל המסלול; אין pass תיקון', () => {
    const openA = 'bracket:v1|doc|body|round|10|20';
    const openB = 'bracket:v1|doc|body|square|30|40';
    const blocks = [
      block('body|1', [
        LINE(lineH, { bracketOpens: [{ pairId: openA, kind: 'round' }] }),
        ...Array.from({ length: 12 }, () => LINE(lineH)), // חוצה טורים ועמודים
        LINE(lineH, { bracketOpens: [{ pairId: openB, kind: 'square' }] }),
        ...Array.from({ length: 10 }, () => LINE(lineH)),
        LINE(lineH, { bracketCloses: [openB, openA] }),
      ]),
    ];
    const { res, first } = runFull(blocks);
    expect(res.status).toBe('complete');
    // השרשרת עוברת — כל הפתיחות/סגירות זורמות דרך המעברים בסדר LIFO
    expect(() => verifyTransitionChain(first, res.path.flatMap((e) => e.transitions))).not.toThrow();
    // בקץ — מחסנית ריקה (הזוגות נסגרו)
    expect(res.finalState.openBracketStack.length).toBe(0);
    // המסמך חוצה עמודים (הסוגריים חצו בפועל)
    expect(res.finalState.physicalPageIndex).toBeGreaterThan(1);
    // אין פונקציית תיקון סוגריים — ההרחבות נושאות את האירועים (נבדק בשער 52/56; כאן — עקביות המסלול)
  });

  test('חציית עמוד מזוהה: פותח בדיוק בקו האחרון של העמוד — ולא פתיחות באמצע עמוד', () => {
    const openA = 'bracket:v1|doc|body|round|1|9';
    const openMid = 'bracket:v1|doc|body|round|2|4';
    const blocks = [
      block('body|1', [
        // 19 קווים + הקו האחרון של עמוד 1 (טור 1) פותח סוגריים — בדיוק בסוף העמוד
        ...Array.from({ length: 19 }, () => LINE(lineH)),
        LINE(lineH, { bracketOpens: [{ pairId: openA, kind: 'round' }] }),
      ]),
      block('body|2', [
        // פתיחה באמצע עמוד 2 (אינה חציית-עמוד) + סגירות מאוחרות
        ...Array.from({ length: 4 }, () => LINE(lineH)),
        LINE(lineH, { bracketOpens: [{ pairId: openMid, kind: 'round' }] }),
        ...Array.from({ length: 6 }, () => LINE(lineH)),
        LINE(lineH, { bracketCloses: [openMid, openA] }),
      ]),
    ];
    const { res, crossings, first } = runFull(blocks);
    expect(res.status).toBe('complete');
    expect(res.finalState.openBracketStack.length).toBe(0);
    // חציית-העמוד: רק הזוג שנפתח בקו האחרון של עמוד 1 — לא הפתיחה שבאמצע עמוד 2
    const pageCrossings = crossings.filter((c) => !c.atDocumentEnd);
    expect(pageCrossings.length).toBe(1);
    expect(pageCrossings[0]!.pairId).toBe(openA);
    expect(pageCrossings[0]!.physicalPageIndex).toBe(1);
    expect(pageCrossings[0]!.atDocumentEnd).toBe(false);
    // אין דיווחי קלט-לקוי (שני הזוגות נסגרו)
    expect(crossings.filter((c) => c.atDocumentEnd).length).toBe(0);
    expect(() => verifyTransitionChain(first, res.path.flatMap((e) => e.transitions))).not.toThrow();
  });

  test('סוגר לא סגור בקלט — מדווח כבעיית קלט (atDocumentEnd); לא "מתוקן בשקט"', () => {
    const openUnclosed = 'bracket:v1|doc|body|round|3|7';
    const blocks = [
      block('body|1', [
        ...Array.from({ length: 5 }, () => LINE(lineH)),
        LINE(lineH, { bracketOpens: [{ pairId: openUnclosed, kind: 'round' }] }),
        ...Array.from({ length: 3 }, () => LINE(lineH)),
      ]),
    ];
    const { res, crossings } = runFull(blocks);
    expect(res.status).toBe('complete'); // העימוד מסתיים; הדיווח הוא נתונים, לא קריסה
    const unclosed = crossings.filter((c) => c.atDocumentEnd);
    expect(unclosed.length).toBe(1);
    expect(unclosed[0]!.pairId).toBe(openUnclosed);
    expect(res.finalState.openBracketStack.length).toBe(1); // המחסנית נשארת פתוחה — אמת במצב
  });

  test('מדיניות התצוגה: suppress/continuation-mark כ-TransformRecord עם סיבה ומקור; none — אין', () => {
    const crossing = { pairId: 'bracket:v1|doc|body|round|1|9', kind: 'round' as const, physicalPageIndex: 2, candidateId: 'pg:2:1→body|2@5', atDocumentEnd: false };
    const openAtom = { __brand: 'AtomId', value: 'atom:v1|doc|body|1|9' } as unknown as Parameters<typeof bracketTransformFor>[2];
    const markAtom = { __brand: 'AtomId', value: 'generated:bracket-mark|1' } as unknown as Parameters<typeof bracketTransformFor>[3];
    // ברירת המחדל — none: אין טרנספורמציה (הסוגר חוצה כחוק)
    expect(DEFAULT_BRACKET_DISPLAY_POLICY.pageEndOpen).toBe('none');
    expect(bracketTransformFor(crossing, DEFAULT_BRACKET_DISPLAY_POLICY, openAtom, markAtom)).toBeNull();
    // suppress — תו מושמט מותר: from=האטום, to=ריק, reason מתועד
    const sup = bracketTransformFor(crossing, { pageEndOpen: 'suppress' }, openAtom, markAtom)!;
    expect(sup.kind).toBe('suppress');
    expect(sup.from.length).toBe(1);
    expect(sup.to.length).toBe(0);
    expect(sup.reason).toBe('bracket-open-at-page-end');
    expect(sup.detail).toMatchObject({ pairId: crossing.pairId, page: 2 });
    // continuation-mark — תו מיוצר: from=ריק, to=האטום שנולד
    const mark = bracketTransformFor(crossing, { pageEndOpen: 'continuation-mark' }, openAtom, markAtom)!;
    expect(mark.kind).toBe('insert');
    expect(mark.from.length).toBe(0);
    expect(mark.to.length).toBe(1);
    expect(mark.reason).toBe('bracket-continuation-mark');
    // קלט לקוי — אף פעולה (מדווח, לא מתוקן)
    expect(bracketTransformFor({ ...crossing, atDocumentEnd: true }, { pageEndOpen: 'suppress' }, openAtom, markAtom)).toBeNull();
    // המדיניות מההגדרות — הברירה הנעולה
    expect(bracketDisplayPolicyOf({ values: {} }).pageEndOpen).toBe('none');
  });

  test('דטרמיניזם: זיהוי החציות זהה בין ריצות', () => {
    const openA = 'bracket:v1|doc|body|round|2|8';
    const blocks = [
      block('body|1', [
        ...Array.from({ length: 20 }, () => LINE(lineH)),
        LINE(lineH, { bracketOpens: [{ pairId: openA, kind: 'round' }] }),
      ]),
      block('body|2', [
        ...Array.from({ length: 6 }, () => LINE(lineH)),
        LINE(lineH, { bracketCloses: [openA] }),
      ]),
    ];
    const once = () => {
      const { crossings } = runFull(blocks);
      return JSON.stringify(crossings);
    };
    expect(once()).toBe(once());
    expect(once()).toBe(once());
  });
});
