/**
 * h3-policy.test.ts — בדיקות שלב 62: [ADR-006] H3 — כותרת רוחבית ברמת המדיניות
 * (אפיון §10.1 H3, §11.2, §22.6; ADR-006; פרק ח/M7).
 *
 * מבחני החובה: H3 באמצע טור, סמוך לתחתית, בין פסקאות, עם הערות — הכל
 * בהזרקת המדיניות התורנית המלאה (לא ברירות המחדל של המנוע).
 *
 * מה מוכח כאן:
 *   1. **ארבעת המקרים** דרך headingBehaviorOf של createTorahPolicy.
 *   2. **עיטור צד נמדד** (dim-h3-side-h × h3-ornament-l/r): גובה הפס =
 *      מקסימום(קווים, עיטור) — העיטור תופס בדיוק את המקום שנמדד לו.
 *   3. **אין פתיחת עמוד שלא לפי מדיניות**: ה-barrier נשאר בעמוד; ליד
 *      תחתית — זורם עמוד דרך מעבר הטור הרגיל (לא פתיחה עצמאית).
 */
import { describe, expect, test } from 'vitest';
import { asLu, DecisionLedgerBuilder, type EffectiveSettings } from '@tora/layout-api';
import { initialPaginationState, verifyTransitionChain, type PaginationState } from '../src/pagination/state.js';
import { buildPageTemplateSet, initialRemainingByRegion, type TemplateSetInput } from '../src/pagination/templates.js';
import { searchPages } from '../src/pagination/search.js';
import {
  createPageCandidateSource,
  type CandidateGeneratorInput,
  type PaginatedBlock,
  type PaginatedLine,
} from '../src/pagination/candidates.js';
import { makeNoteBodySpec, type NoteBodySpec } from '../src/pagination/notes.js';
import { createTorahPolicy, torahRegistrySignature } from '@tora/policy-torah';

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
const h3 = (blockId: string, heightLu: number): PaginatedBlock =>
  block(blockId, [LINE(heightLu)], { role: 'heading', headingLevel: 3 });

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

const mkSettings = (values: Record<string, unknown> = {}): EffectiveSettings =>
  ({ schemaVersion: 1, enginePolicyId: 'torah-v1', values, configHash: 'test' });
const policy = createTorahPolicy(mkSettings());

function inputFor(blocks: readonly PaginatedBlock[], noteBodies?: ReadonlyMap<string, NoteBodySpec>, behaviorOf?: (level: number) => unknown): CandidateGeneratorInput {
  return {
    blocks, templates, pageKind: 'body',
    ...(noteBodies !== undefined ? { noteBodies } : {}),
    ...(behaviorOf !== undefined ? { headingBehaviorOf: behaviorOf as CandidateGeneratorInput['headingBehaviorOf'] } : {}),
  };
}
const initialState = (firstBlockId: string): PaginationState =>
  initialPaginationState({ firstBlockId, remainingByRegion: initialRemainingByRegion(templates.for('body', 1), 1) });
const runFull = (blocks: readonly PaginatedBlock[], noteBodies?: ReadonlyMap<string, ReturnType<typeof makeNoteBodySpec>>, behaviorOf?: (level: number) => unknown) => {
  const src = createPageCandidateSource(inputFor(blocks, noteBodies, behaviorOf));
  return { src, res: searchPages(initialState(blocks[0]!.blockId), src, new DecisionLedgerBuilder('decisions')) };
};

describe('שלב 62 — H3 ברמת המדיניות (ADR-006; §10.1)', () => {
  const lineH = Math.floor(H / 10);

  test('(א) אמצע טור: מועמד barrier מסונכרן — דרך המדיניות המלאה', () => {
    const blocks = [
      block('body|1', [LINE(lineH), LINE(lineH), LINE(lineH)]),
      h3('heading|1|H3', lineH),
      block('body|2', [LINE(lineH), LINE(lineH)]),
    ];
    const { src, res } = runFull(blocks, undefined, policy.headingBehaviorOf);
    const exps = src.expansions(initialState('body|1'));
    const barrier = exps.find((e) => e.candidateId.includes(':H3'));
    expect(barrier).toBeDefined();
    expect(barrier!.toState.remainingByRegion['page:1:col:0']).toBe(H - 4 * lineH);
    expect(barrier!.toState.remainingByRegion['page:1:col:1']).toBe(H - 4 * lineH);
    expect(barrier!.toState.physicalPageIndex).toBe(1); // נשארת בעמוד
    expect(res.status).toBe('complete');
    expect(() => verifyTransitionChain(initialState('body|1'), res.path.flatMap((e) => e.transitions))).not.toThrow();
  });

  test('(ב) סמוך לתחתית: אין מקום לפס ⇒ זורמת עמוד דרך מעבר רגיל — לא פותחת מעצמה', () => {
    // 19 קווים בשני טורים: גם בחלוקה מאוזנת (9.5/9.5) אין מקום לפס — שום
    // סידור של הטקסט שלפני הכותרת אינו מכניס את ה-barrier לעמוד 1 (החיפוש
    // מנסה לאזן — ADR-006 §3 — ואין דרך); ה-H3 זורמת לעמוד 2 כמו תוכן
    const blocks = [
      block('body|1', Array.from({ length: 19 }, () => LINE(lineH))),
      h3('heading|1|H3', lineH),
      block('body|2', Array.from({ length: 5 }, () => LINE(lineH))),
    ];
    const { res } = runFull(blocks, undefined, policy.headingBehaviorOf);
    expect(res.status).toBe('complete');
    // ה-H3 מוצבת בעמוד הבא — אבל המעבר אליו הוא מעבר טור/עמוד רגיל (מילוי),
    // לא מועמד :H3 שפותח עמוד (§10.1: "לא פותחת עמוד מעצמה"): שום הרחבת
    // barrier אינה מתחילה בעמוד 1; ה-barrier עצמו — בראש עמוד 2
    const fromStateOf = (i: number): PaginationState => (i === 0 ? initialState('body|1') : res.path[i - 1]!.toState);
    const barrierExps = res.path.map((e, i) => ({ e, i })).filter(({ e }) => e.candidateId.includes(':H3'));
    expect(barrierExps.length).toBe(1);
    expect(fromStateOf(barrierExps[0]!.i).physicalPageIndex).toBe(2); // ה-barrier רק בעמוד 2
    // המעבר לעמוד 2 (לפני ה-barrier) — הרחבת מילוי רגילה בלי סמן barrier
    const intoPage2 = res.path[barrierExps[0]!.i - 1]!;
    expect(intoPage2.candidateId.includes(':H3')).toBe(false);
    expect(intoPage2.toState.physicalPageIndex).toBe(2);
    // הכיסוי מלא והכותרת נצרכה (הסמן עבר אותה)
    const last = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
  });

  test('(ג) בין פסקאות: ה-barrier עובד גם כשהגבול לפניו הוא סוף פסקה', () => {
    const blocks = [
      block('body|1', Array.from({ length: 4 }, () => LINE(lineH))),
      h3('heading|2|SEC', lineH),
      block('body|2', Array.from({ length: 4 }, () => LINE(lineH))),
      h3('heading|3|SEC2', lineH),
      block('body|3', Array.from({ length: 4 }, () => LINE(lineH))),
    ];
    const { res } = runFull(blocks, undefined, policy.headingBehaviorOf);
    expect(res.status).toBe('complete');
    const barriers = res.path.filter((e) => e.candidateId.includes(':H3'));
    expect(barriers.length).toBe(2);
    const last = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
    expect(() => verifyTransitionChain(initialState('body|1'), res.path.flatMap((e) => e.transitions))).not.toThrow();
  });

  test('(ד) עם הערות: הפס מתחשב בגוש ההערות שנצרב בעמוד (המרחב המשותף; ADR-005)', () => {
    const noteH = lineH * 2;
    const bodies = new Map([['note:v1|doc|footnote|1', makeNoteBodySpec('note:v1|doc|footnote|1', [noteH])]]);
    const blocks = [
      block('body|1', [
        LINE(lineH, { footnoteRefs: ['note:v1|doc|footnote|1'] }),
        LINE(lineH), LINE(lineH),
      ]),
      h3('heading|1|H3', lineH),
      block('body|2', Array.from({ length: 4 }, () => LINE(lineH))),
    ];
    const { res } = runFull(blocks, bodies, policy.headingBehaviorOf);
    expect(res.status).toBe('complete');
    // אינווריאנט: קווי הטור + גוש ההערות ≤ גובה העמוד לאורך כל המסלול
    for (const e of res.path) {
      const colRemaining = e.toState.remainingByRegion[`page:${e.toState.physicalPageIndex}:col:${e.toState.columnIndex}`];
      const notesRemaining = e.toState.remainingByRegion[`page:${e.toState.physicalPageIndex}:notes`];
      if (colRemaining !== undefined && notesRemaining !== undefined) {
        const colUsed = H - colRemaining;
        const notesUsed = (templates.for('body', 1).footnoteAnchor?.rect.height ?? 0) - notesRemaining;
        expect(colUsed + Math.max(0, notesUsed)).toBeLessThanOrEqual(H + 1);
      }
    }
    const last = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
    expect(res.finalState.pendingFootnotes.length).toBe(0); // אין יתומות
  });

  test('עיטור צד נמדד: גובה הפס = מקסימום(קווים, em × קו ראשון) — בדיוק', () => {
    const blocks = [
      block('body|1', [LINE(lineH), LINE(lineH)]),
      h3('heading|1|H3O', lineH),
      block('body|2', [LINE(lineH), LINE(lineH)]),
    ];
    // ברירת המחדל: אין עיטור (h3-ornament-l/r='none') — גובה הטקסט בלבד
    expect(policy.headingBehaviorOf(3).barrierOrnamentEm).toBe(0);
    const expsDefault = createPageCandidateSource(inputFor(blocks, undefined, policy.headingBehaviorOf)).expansions(initialState('body|1'));
    const barrierDefault = expsDefault.find((e) => e.candidateId.includes(':H3'))!;
    // שני הטורים נשרפו עד 3 קווים + כותרת (2+1) — גובה טקסט בלבד
    expect(barrierDefault.toState.remainingByRegion['page:1:col:0']).toBe(H - 3 * lineH);
    // עם עיטור צד 2em (פעיל): גובה הפס = max(lineH, 2×lineH) = 2×lineH
    const ornPolicy = createTorahPolicy(mkSettings({ 'h3-ornament-l': 'diamonds', 'dim-h3-side-h': '2em' }));
    expect(ornPolicy.headingBehaviorOf(3).barrierOrnamentEm).toBe(2);
    const expsOrn = createPageCandidateSource(inputFor(blocks, undefined, ornPolicy.headingBehaviorOf)).expansions(initialState('body|1'));
    const barrierOrn = expsOrn.find((e) => e.candidateId.includes(':H3'))!;
    // הפס: 2 קווים לפני + פס בגובה 2×lineH ⇒ 4×lineH נשרף
    expect(barrierOrn.toState.remainingByRegion['page:1:col:0']).toBe(H - 4 * lineH);
    expect(barrierOrn.toState.remainingByRegion['page:1:col:1']).toBe(H - 4 * lineH);
  });

  test('אין פתיחת עמוד שלא לפי מדיניות: ל-H3 אין forcePageBreak; ה-barrier סוגר אזור באותו עמוד', () => {
    const b = policy.headingBehaviorOf(3);
    expect(b.flowRole).toBe('full-width-barrier');
    expect(b.forcePageBreak).toBe(false);
    expect(b.forcePageTemplate).toBeUndefined();
    expect(b.startOnRecto).toBeUndefined();
    const blocks = [
      block('body|1', [LINE(lineH), LINE(lineH)]),
      h3('heading|1|H3X', lineH),
      block('body|2', [LINE(lineH), LINE(lineH)]),
    ];
    const { res } = runFull(blocks, undefined, policy.headingBehaviorOf);
    const barrier = res.path.find((e) => e.candidateId.includes(':H3'))!;
    expect(barrier.toState.physicalPageIndex).toBe(1); // אותו עמוד
    expect(barrier.closesRegion).toBe(true); // סוגר אזור (§9.2)
  });

  test('דטרמיניזם בהזרקת המדיניות; המרשם בגרסה 2 (rollback = v1)', () => {
    const blocks = [
      block('body|1', Array.from({ length: 6 }, () => LINE(lineH))),
      h3('heading|1|D', lineH),
      block('body|2', Array.from({ length: 6 }, () => LINE(lineH))),
    ];
    const first = initialState('body|1');
    const runOnce = () => {
      const src = createPageCandidateSource(inputFor(blocks, undefined, policy.headingBehaviorOf));
      const res = searchPages(first, src, new DecisionLedgerBuilder('decisions'));
      return JSON.stringify({ p: res.path.map((e) => e.candidateId), h: res.finalState.stateHash });
    };
    expect(new Set([runOnce(), runOnce(), runOnce()]).size).toBe(1);
    expect(torahRegistrySignature()).toContain('heading.h3.barrier@2');
  });
});
