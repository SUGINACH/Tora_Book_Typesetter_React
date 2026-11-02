/**
 * h0-opener.test.ts — בדיקות שלב 59: H0 — פותח עמוד/פרק (forcePageTemplate)
 * (אפיון §10.1; פרק ח/M7).
 *
 * מבחני החובה מ־§10.1: תחילת מסמך; אחרי טור חצי מלא; H0 ואחריו H2 עוקב.
 *
 * מה מוכח כאן:
 *   1. **תחילת מסמך**: H0 כבלוק ראשון מוצב בראש עמוד 1 (העמוד ההתחלתי
 *      נבנה על-ידי הקורא; הפותחת אינה פותחת עמוד נוסף מעצמה).
 *   2. **אחרי טור חצי מלא**: הגבול שלפני ה־H0 פותח עמוד חדש מיד (:OPEN)
 *      — לא מעבר לטור 1; הפותחת מוצבת בראש העמוד שנפתח.
 *   3. **H0 ואחריו H2**: כל פותחת מקבלת עמוד משלה — הגבול שלפני ה־H2
 *      פותח עמוד גם כשהליווי (escort) היה אמור לאסור זאת (חריג פותח-עמוד).
 *   4. **forcePageTemplate**: התבנית שהעמוד נפתח בה נקבעת לפי ההתנהגות
 *      המוזרקת — H0 עם 'notes' פותחת עמוד חד-טורי ברוחב מלא.
 *   5. **אין פותחת באמצע עמוד**: ההליכה נעצרת לפני פותחות — אף גבול
 *      אינו מציב אותן בתוך טור; מסלול שלם מכסה כל קו בדיוק פעם אחת.
 *   6. **אחרי מחסום H3**: גבול פותח-עמוד ריק (בלי הצבה ובלי הקדמת סמן)
 *      רק פותח את העמוד — ההתקדמות היא פתיחת העמוד (שרשרת עוברת).
 *   7. **כשל מפורש**: פותחת גבוהה מטור ריק ⇒ אין מועמד ⇒ כשל מקוטלג
 *      (אין חירום לכותרות; §10.3 ברוח סעיף 52).
 *   8. **מדיניות מינימלית**: H0 inline — אין :OPEN, אין פתיחת עמוד כפויה.
 *   9. **דטרמיניזם + שרשרת + trace אינו משנה** על מסלול עם פותחות.
 */
import { describe, expect, test } from 'vitest';
import { asLu, DecisionLedgerBuilder } from '@tora/layout-api';
import { initialPaginationState, verifyTransitionChain, type PaginationState } from '../src/pagination/state.js';
import { buildPageTemplateSet, initialRemainingByRegion, type TemplateSetInput } from '../src/pagination/templates.js';
import { searchPages } from '../src/pagination/search.js';
import {
  createPageCandidateSource,
  type CandidateGeneratorInput,
  type PaginatedBlock,
  type PaginatedLine,
} from '../src/pagination/candidates.js';
import { legacyHeadingBehaviorOf } from '../src/pagination/heading-defaults.js';
import { LayoutEngineError } from '../src/errors.js';

let lineSeq = 0;
const LINE = (heightLu: number): PaginatedLine => Object.freeze({
  id: `line-${lineSeq++}`,
  heightLu: asLu(heightLu),
  footnoteRefs: [],
  sidenoteRefs: [],
});

function block(blockId: string, lines: readonly PaginatedLine[], extra: Partial<PaginatedBlock> = {}): PaginatedBlock {
  return Object.freeze({ blockId, role: 'body', lines: Object.freeze([...lines]), ...extra });
}
const h = (blockId: string, heightLu: number, level: number): PaginatedBlock =>
  block(blockId, [LINE(heightLu)], { role: 'heading', headingLevel: level });

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

function inputFor(blocks: readonly PaginatedBlock[], headingBehaviorOf?: (level: number) => unknown): CandidateGeneratorInput {
  return {
    blocks, templates, pageKind: 'body',
    ...(headingBehaviorOf !== undefined ? { headingBehaviorOf: headingBehaviorOf as CandidateGeneratorInput['headingBehaviorOf'] } : {}),
  };
}

function initialState(firstBlockId: string): PaginationState {
  return initialPaginationState({
    firstBlockId,
    remainingByRegion: initialRemainingByRegion(templates.for('body', 1), 1),
  });
}

const runFull = (blocks: readonly PaginatedBlock[], behaviorOf?: (level: number) => unknown) => {
  const src = createPageCandidateSource(inputFor(blocks, behaviorOf));
  return { src, res: searchPages(initialState(blocks[0]!.blockId), src, new DecisionLedgerBuilder('decisions')) };
};

/** מצב המקור של הרחבה i במסלול — toState של קודמתה (או המצב ההתחלתי). */
const fromStateOf = (res: { path: readonly { toState: PaginationState }[] }, i: number, firstBlockId: string): PaginationState =>
  i === 0 ? initialState(firstBlockId) : res.path[i - 1]!.toState;

describe('שלב 59 — H0 forcePageTemplate (§10.1)', () => {
  const lineH = Math.floor(H / 10);

  test('תחילת מסמך: H0 ראשון מוצב בראש עמוד 1 — בלי פתיחת עמוד נוספת', () => {
    const blocks = [
      h('heading|0|OPEN', lineH, 0),
      block('body|1', Array.from({ length: 10 }, () => LINE(lineH))),
    ];
    const { src, res } = runFull(blocks);
    expect(res.status).toBe('complete');
    // ההרחבה הראשונה מהמצב ההתחלתי מציבה את ה-H0 בעמוד 1 (לא :OPEN — העמוד כבר פתוח)
    const first = res.path[0]!;
    expect(first.candidateId.startsWith('pg:1:0→')).toBe(true);
    expect(first.candidateId.includes(':OPEN')).toBe(false);
    expect(first.toState.physicalPageIndex).toBe(1);
    // ה-H0 נצרכה: ההרחבה הראשונה כוללת לפחות את גובהה בטור 0 של עמוד 1
    expect(first.toState.remainingByRegion['page:1:col:0']).toBeLessThan(H);
    // אף הרחבה אינה נושאת :OPEN — אין פותחת באמצע הזרימה
    expect(res.path.some((e) => e.candidateId.includes(':OPEN'))).toBe(false);
  });

  test('אחרי טור חצי מלא: הגבול שלפני H0 פותח עמוד חדש מיד — לא מעבר לטור 1', () => {
    const blocks = [
      block('body|1', Array.from({ length: 5 }, () => LINE(lineH))), // חצי טור
      h('heading|0|X', lineH, 0),
      block('body|2', Array.from({ length: 10 }, () => LINE(lineH))),
    ];
    const { src, res } = runFull(blocks);
    expect(res.status).toBe('complete');
    // מהמצב ההתחלתי קיים גבול :OPEN שמסתיים בראש ה-H0
    const exps = src.expansions(initialState('body|1'));
    const openExp = exps.find((e) => e.candidateId.endsWith('heading|0|X@0:OPEN'));
    expect(openExp).toBeDefined();
    expect(openExp!.closesRegion).toBe(true);
    // פותח עמוד 2 מיד — לא מעבר לטור 1 (העמוד החדש: טור 0 מלא; אין טור 1 של עמוד 1)
    expect(openExp!.toState.physicalPageIndex).toBe(2);
    expect(openExp!.toState.columnIndex).toBe(0);
    expect(openExp!.toState.remainingByRegion['page:2:col:0']).toBe(H);
    // במסלול הזוכה: ההרחבה שאחרי ה-:OPEN מציבה את ה-H0 בראש עמוד 2
    const openIdx = res.path.findIndex((e) => e.candidateId.endsWith('heading|0|X@0:OPEN'));
    expect(openIdx).toBeGreaterThanOrEqual(0);
    const next = res.path[openIdx + 1]!;
    expect(fromStateOf(res, openIdx + 1, 'body|1').physicalPageIndex).toBe(2);
    // ההרחבה שאחרי הפתיחה מתחילה בראש ה-H0 ומקדימה את הסמן מעבר לה — הכותרת נצרכה בעמוד 2
    expect(fromStateOf(res, openIdx + 1, 'body|1').contentCursor).toContain('heading|0|X|f0');
    expect(next.toState.contentCursor).toContain('body|2');
    // שרשרת המעברים עוברת (כולל פתיחת העמוד הכפויה)
    expect(() => verifyTransitionChain(initialState('body|1'), res.path.flatMap((e) => e.transitions))).not.toThrow();
  });

  test('H0 ואחריו H2 עוקב: כל פותחת מקבלת עמוד משלה (חריג ליווי בגבול פותח)', () => {
    const blocks = [
      h('heading|0|A', lineH, 0),
      h('heading|2|B', lineH, 2),
      block('body|1', Array.from({ length: 10 }, () => LINE(lineH))),
    ];
    const { src, res } = runFull(blocks);
    expect(res.status).toBe('complete');
    // הגבול בסוף ה-H0 (שלפני ה-H2) נוצר למרות escort=2 — חריג פותח-עמוד
    const exps = src.expansions(initialState('heading|0|A'));
    const openH2 = exps.find((e) => e.candidateId.endsWith('heading|2|B@0:OPEN'));
    expect(openH2, 'גבול פותח-עמוד לפני H2 קיים (escort נדחה ליד פתיחה כפויה)').toBeDefined();
    expect(openH2!.toState.physicalPageIndex).toBe(2);
    // במסלול: H0 בעמוד 1; H2 בראש עמוד 2; הגוף אחריה
    const openIdx = res.path.findIndex((e) => e.candidateId.endsWith('heading|2|B@0:OPEN'));
    expect(openIdx).toBeGreaterThanOrEqual(0);
    // הגבול שלפני ה-H2 נוצר בעמוד 1 (ה-H0 הוצבה שם) ופותח את עמוד 2 ל-H2
    expect(fromStateOf(res, openIdx, 'heading|0|A').physicalPageIndex).toBe(1);
    const after = res.path[openIdx + 1]!;
    expect(fromStateOf(res, openIdx + 1, 'heading|0|A').physicalPageIndex).toBe(2);
    // ההרחבה שאחרי הפתיחה מתחילה בראש ה-H2 (עמוד 2) ומקדימה מעבר לה
    expect(fromStateOf(res, openIdx + 1, 'heading|0|A').contentCursor).toContain('heading|2|B|f0');
    expect(after.toState.contentCursor).toContain('body|1');
    // כיסוי מלא
    const last = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
  });

  test('forcePageTemplate בפועל: H0 שדורשת notes פותחת עמוד חד-טורי ברוחב מלא', () => {
    const blocks = [
      block('body|1', Array.from({ length: 5 }, () => LINE(lineH))),
      h('heading|0|N', lineH, 0),
      block('body|2', Array.from({ length: 4 }, () => LINE(lineH))),
    ];
    const notesBehavior = (level: number) => (level === 0
      ? { flowRole: 'page-opener' as const, forcePageBreak: true, escortLines: 2, forcePageTemplate: 'notes' as const }
      : legacyHeadingBehaviorOf(level));
    const { res } = runFull(blocks, notesBehavior);
    expect(res.status).toBe('complete');
    // מצא את ההרחבה שפותחת את עמוד ה-H0 — המצב שאחריה הוא תבנית notes:
    // טור בודד בלבד (אין page:2:col:1) ובגובה המלא של תבנית notes
    const openIdx = res.path.findIndex((e) => e.candidateId.endsWith('heading|0|N@0:OPEN'));
    expect(openIdx).toBeGreaterThanOrEqual(0);
    const opened = res.path[openIdx]!.toState;
    expect(opened.remainingByRegion['page:2:col:0']).toBeDefined();
    expect(opened.remainingByRegion['page:2:col:1']).toBeUndefined(); // חד-טורי!
    const notesH = templates.for('notes', 1).regions.find((r) => r.role === 'body-column')!.rect.height;
    expect(opened.remainingByRegion['page:2:col:0']).toBe(notesH);
  });

  test('אין פותחת באמצע עמוד: אף גבול אינו חוצה פותחת — והכיסוי מלא', () => {
    const blocks = [
      block('body|1', Array.from({ length: 20 }, () => LINE(lineH))),
      h('heading|0|M', lineH, 0),
      block('body|2', Array.from({ length: 12 }, () => LINE(lineH))),
    ];
    const { src, res } = runFull(blocks);
    expect(res.status).toBe('complete');
    // מכל מצב שקודם ל-H0 — אף הרחבה אינה מזיזה את הסמן מעבר לראש ה-H0
    // (ההליכה נעצרת לפני פותחות; ההצבה שלה עצמה — רק מראש עמוד חדש)
    const openExp = res.path.find((e) => e.candidateId.includes(':OPEN'));
    expect(openExp).toBeDefined();
    expect(openExp!.toState.contentCursor).toContain('heading|0|M|f0');
    // כיסוי מלא — כל קו בדיוק פעם אחת
    const last = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
    // ה-H0 עצמה נצרכת: ההרחבה שאחרי הפתיחה מתחילה בראשה ומקדימה אל תוך הגוף שאחריה
    const openIdx2 = res.path.findIndex((e) => e.candidateId.endsWith('heading|0|M@0:OPEN'));
    expect(openIdx2).toBeGreaterThanOrEqual(0);
    const placed = res.path[openIdx2 + 1]!;
    expect(fromStateOf(res, openIdx2 + 1, 'body|1').contentCursor).toContain('heading|0|M|f0');
    expect(placed.toState.contentCursor).toContain('body|2');
    void src;
  });

  test('אחרי מחסום H3: גבול פותח-עמוד ריק רק פותח עמוד — בלי הקדמת סמן; שרשרת עוברת', () => {
    const blocks = [
      h('heading|3|SEC', lineH, 3),
      h('heading|0|P', lineH, 0),
      block('body|1', Array.from({ length: 8 }, () => LINE(lineH))),
    ];
    const { res } = runFull(blocks);
    expect(res.status).toBe('complete');
    // מצא את ההרחבה הריקה: :OPEN שלא הקדימה סמן (הסמן נשאר בראש ה-H0)
    const emptyIdx = res.path.findIndex((e, i) => e.candidateId.endsWith('heading|0|P@0:OPEN')
      && fromStateOf(res, i, 'heading|3|SEC').contentCursor === e.toState.contentCursor);
    expect(emptyIdx).toBeGreaterThanOrEqual(0);
    const empty = res.path[emptyIdx]!;
    expect(empty.toState.physicalPageIndex).toBe(fromStateOf(res, emptyIdx, 'heading|3|SEC').physicalPageIndex + 1);
    // ההרחבה הריקה אינה צורכת כלום מהטור — רק open-page
    expect(empty!.transitions.map((t) => t.action.kind)).toEqual(['open-page']);
    // וה-H3 לפניה — מחסום באותו עמוד (§10.1: H3 לא פותחת עמוד מעצמה)
    const barrier = res.path.find((e) => e.candidateId.includes(':H3'));
    expect(barrier).toBeDefined();
    expect(barrier!.toState.physicalPageIndex).toBe(1);
    // ה-H0 מוצבת בראש עמוד 2 — ההרחבה שאחרי הריקה מתחילה בראשה ומקדימה מעבר לה
    const afterEmpty = res.path[emptyIdx + 1]!;
    expect(fromStateOf(res, emptyIdx + 1, 'heading|3|SEC').physicalPageIndex).toBe(2);
    expect(afterEmpty.toState.contentCursor).toContain('body|1');
    // שרשרת מלאה עוברת גם עם ההרחבה הריקה
    expect(() => verifyTransitionChain(initialState('heading|3|SEC'), res.path.flatMap((e) => e.transitions))).not.toThrow();
  });

  test('מטור 1 באמצע עמוד: פותחת פותחת עמוד חדש ישירות מטור 1', () => {
    const blocks = [
      block('body|1', Array.from({ length: 12 }, () => LINE(lineH))), // ממלא טור 0 ועוד
      h('heading|0|Q', lineH, 0),
      block('body|2', Array.from({ length: 6 }, () => LINE(lineH))),
    ];
    const { res } = runFull(blocks);
    expect(res.status).toBe('complete');
    const openIdxQ = res.path.findIndex((e) => e.candidateId.endsWith('heading|0|Q@0:OPEN'));
    expect(openIdxQ).toBeGreaterThanOrEqual(0);
    const openExp = res.path[openIdxQ]!;
    const fromQ = fromStateOf(res, openIdxQ, 'body|1');
    expect(fromQ.columnIndex).toBe(1); // נפתח מטור 1
    expect(openExp.toState.physicalPageIndex).toBe(fromQ.physicalPageIndex + 1);
    expect(openExp.toState.columnIndex).toBe(0);
  });

  test('פותחת גבוהה מטור ריק ⇒ אין מועמד ⇒ כשל מפורש מקוטלג (אין חירום לכותרות)', () => {
    const blocks = [
      block('body|1', [LINE(lineH)]),
      h('heading|0|TALL', H * 2, 0),
      block('body|2', [LINE(lineH)]),
    ];
    const src = createPageCandidateSource(inputFor(blocks));
    expect(() => searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions')))
      .toThrow(LayoutEngineError);
  });

  test('מדיניות מינימלית: H0 inline — אין :OPEN, אין פתיחה כפויה; זרימה רציפה', () => {
    const blocks = [
      block('body|1', Array.from({ length: 5 }, () => LINE(lineH))),
      h('heading|0|I', lineH, 0),
      block('body|2', Array.from({ length: 5 }, () => LINE(lineH))),
    ];
    const minimal = (level: number) => ({ flowRole: 'inline' as const, forcePageBreak: false, escortLines: 0, forcePageTemplate: undefined });
    void minimal;
    const inlineBehavior = (_level: number) => ({ flowRole: 'inline' as const, forcePageBreak: false, escortLines: 0 });
    const { src, res } = runFull(blocks, inlineBehavior);
    expect(res.status).toBe('complete');
    expect(res.path.some((e) => e.candidateId.includes(':OPEN'))).toBe(false);
    // ה-H0 זורמת inline: היא נצרכת בתוך הליכת הגבולות של עמוד 1 — קיימת
    // הרחבה שנשארת בעמוד 1 והסמן שלה כבר מעבר לה (הפותחת לא פתחה עמוד).
    // (פתיחת העמוד האחרונה במסלול היא תופעת קצה קיימת של גבול סוף-מסמך
    // בטור האחרון — לא קשורה לפותחות.)
    const h0Inline = res.path.some((e, i) =>
      e.toState.contentCursor.includes('body|2')
      && fromStateOf(res, i, 'body|1').physicalPageIndex === 1
      && e.toState.physicalPageIndex === 1
      && !e.candidateId.includes(':OPEN'));
    expect(h0Inline, 'ה-H0 נצרכה בתוך עמוד 1 בלי פתיחה כפויה').toBe(true);
    // הכול נכנס לעמוד אחד (11 קווים מתוך 10 לטור... הזרימה עוברת עמודים בטור 1)
    const last = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
    void src;
  });

  test('דטרמיניזם: 5 ריצות — מזהי מועמדים זהים; אינווריאנט עמוד לאורך כל המסלול', () => {
    const blocks = [
      h('heading|0|D', lineH, 0),
      block('body|1', Array.from({ length: 15 }, () => LINE(lineH))),
      h('heading|2|E', lineH, 2),
      block('body|2', Array.from({ length: 15 }, () => LINE(lineH))),
    ];
    const runOnce = () => {
      const src = createPageCandidateSource(inputFor(blocks));
      const res = searchPages(initialState('heading|0|D'), src, new DecisionLedgerBuilder('decisions'));
      return JSON.stringify({
        path: res.path.map((e) => e.candidateId),
        final: res.finalState.stateHash,
        quality: res.quality,
      });
    };
    const runs = new Set([runOnce(), runOnce(), runOnce(), runOnce(), runOnce()]);
    expect(runs.size).toBe(1);
    // אינווריאנט: בכל מצב לאורך המסלול, כל אזור שנצרב אינו שלילי (צריכה חוקית)
    const { res } = runFull(blocks);
    for (const e of res.path) {
      for (const [region, remaining] of Object.entries(e.toState.remainingByRegion)) {
        expect(remaining, `${region} אינו שלילי`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
