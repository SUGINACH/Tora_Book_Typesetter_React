/**
 * page-candidates.test.ts — בדיקות שלב 52: מועמדים בגבולות חוקיים בלבד
 * (אפיון §9.1, §9.3, §10.1, §10.3, §10.4, §6.6; פרק ז/M6).
 *
 * מה מוכח כאן:
 *   1. **גבולות חוקיים בלבד**: כל הרחבה מסתיימת בגבול חוקי — סוף בלוק
 *      או בין-קווי בפסקה רגילה; בלוק אטום (note-body/heading/box) לעולם
 *      אינו נחצה (שער השלב: "אין עמוד זול שאינו חוקי").
 *   2. **feasibility לפני cost**: קו שאינו נכנס לנותר אינו מוצב — הגבול
 *      אינו נוצר; מועמדים פסולים אינם מגיעים לחיפוש כלל.
 *   3. **אין אובדן תוכן**: לאורך מסלול הזוכה כל קו מוצב בדיוק פעם אחת
 *      — הסמן מגיע לקץ הזרימה; השרשרת עוברת אימות שלב 49.
 *   4. **חירום מתועד**: קו גוף גבוה מטור ריק ⇒ מועמד EMERGENCY_LINE יחיד
 *      עם רכיב 1 (HIGH) וקוד fallback בפנקס; בלוק אטום כזה ⇒ אין מועמד
 *      כלל (§10.3 — הכרעת ADR-005 בשלב 55).
 *   5. **הערות**: הפניות נאספות עם הקו שלהן ⇒ pend; הערה כפולה נדחית
 *      (feasibility) ואינה מגיעה לחיפוש.
 *   6. **סוגריים**: אירועי הפרסר מוזרמים למצב — חציית עמוד חוקית
 *      מעצם המודל (§10.4); המחסנית נישאת בין עמודים; סגירה שלא בראש
 *      המחסנית ⇒ feasibility דוחה.
 *   7. **ליווי כותרת** (מנגנון; ערכים ב-M7): headingEscortLines=2 ⇒
 *      גבול פחות מ-2 קווים אחרי כותרת אינו נוצר.
 *   8. **מדיניות**: allowIntraParagraphBreaks=false ⇒ רק סופי בלוקים;
 *      boundaryStride מרכז גבולות בלי לאבד כיסוי (סוף בלוק תמיד).
 *   9. המחולל כמקור לחיפוש השלבים הקודמים: מסלול שלם דרך searchPages
 *      מסתיים complete; שרשרת המעברים עוברת verifyTransitionChain.
 *  10. אימות קלט: בלוקים/קווים כפולים, גבהים לא-חוקיים ⇒ דחייה מקוטלגת.
 *  11. page opener (H0/H1) סוגר אזור עימוד — תשתית ל-M7.
 */
import { describe, expect, test } from 'vitest';
import { asLu, DecisionLedgerBuilder } from '@tora/layout-api';
import { LayoutEngineError } from '../src/errors.js';
import { initialPaginationState, verifyTransitionChain, type PaginationState } from '../src/pagination/state.js';
import { buildPageTemplateSet, initialRemainingByRegion, type TemplateSetInput } from '../src/pagination/templates.js';
import { searchPages } from '../src/pagination/search.js';
import {
  candidateInputIssues,
  createPageCandidateSource,
  DEFAULT_LEGAL_PAGE_BREAK_POLICY,
  type CandidateGeneratorInput,
  type PaginatedBlock,
  type PaginatedLine,
} from '../src/pagination/candidates.js';

const LINE = (heightLu: number, extra: Partial<PaginatedLine> = {}): PaginatedLine => Object.freeze({
  id: `line-${Math.random().toString(36).slice(2, 10)}`,
  heightLu: asLu(heightLu),
  footnoteRefs: [],
  sidenoteRefs: [],
  ...extra,
});

function block(blockId: string, lines: readonly PaginatedLine[], extra: Partial<PaginatedBlock> = {}): PaginatedBlock {
  return Object.freeze({ blockId, role: 'body', lines: Object.freeze([...lines]), ...extra });
}

function templateInput(overrides: Partial<TemplateSetInput> = {}): TemplateSetInput {
  return {
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
    ...overrides,
  };
}

const templates = buildPageTemplateSet(templateInput());

function inputFor(blocks: readonly PaginatedBlock[], policy?: CandidateGeneratorInput['policy']): CandidateGeneratorInput {
  return { blocks, templates, pageKind: 'body', ...(policy !== undefined ? { policy } : {}) };
}

function initialState(firstBlockId = 'body|1'): PaginationState {
  const t = templates.for('body', 1);
  return initialPaginationState({
    firstBlockId,
    remainingByRegion: initialRemainingByRegion(t, 1),
  });
}

// גובה הטור מהתבנית (contentBottom-contentTop ללא header/footer)
function columnHeight(): number {
  const t = templates.for('body', 1);
  return t.regions.find((r) => r.role === 'body-column' && r.columnIndex === 0)!.rect.height;
}

describe('שלב 52 — מועמדים בגבולות חוקיים בלבד (§9.1)', () => {
  test('ברירות המחדל של המדיניות נעולות ומתועדות', () => {
    expect(DEFAULT_LEGAL_PAGE_BREAK_POLICY).toEqual({
      allowIntraParagraphBreaks: true,
      headingEscortLines: 0,
      atomicNoteBodies: true,
      boundaryStride: 1,
    });
    expect(Object.isFrozen(DEFAULT_LEGAL_PAGE_BREAK_POLICY)).toBe(true);
  });

  test('גבולות חוקיים בלבד: סוף בלוק תמיד; בין-קווי בפסקה רגילה בלבד', () => {
    // פסקה של 5 קווים + עוד פסקה של 3 — הטור מכיל הכל
    const b1 = block('body|1', [LINE(1000), LINE(1000), LINE(1000), LINE(1000), LINE(1000)]);
    const b2 = block('body|2', [LINE(1000), LINE(1000), LINE(1000)]);
    const src = createPageCandidateSource(inputFor([b1, b2]));
    const exps = src.expansions(initialState('body|1'));
    // גבולות: אחרי כל קו של b1 (4 בין-קוויים + סוף בלוק) + קווי b2 (2 בין-קוויים + סוף)
    expect(exps.length).toBe(8);
    for (const e of exps) {
      expect(e.candidateId).toMatch(/^pg:1:0→body\|[12]@\d+$/);
      expect(e.transitions.length).toBeGreaterThan(0);
    }
  });

  test('בלוק אטום (note-body/heading/custom-box) לעולם אינו נחצה', () => {
    const H = columnHeight();
    const lineH = Math.floor(H / 8); // 8 קווים בטור — הכל נכנס במלואו
    const note = block('note:v1|doc|footnote|1', [LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH)], { role: 'note-body' });
    const body = block('body|1', [LINE(lineH), LINE(lineH)]);
    const src = createPageCandidateSource(inputFor([body, note]));
    const exps = src.expansions(initialState('body|1'));
    // אף הרחבה אינה מסתיימת בתוך ההערה: הסמן על ההערה רק ב-0 (לפני —
    // גבול סוף הבלוק הקודם) או 4 (אחרי כולה); 1–3 אסורים מעצם המודל
    for (const e of exps) {
      const m = /→(note:v1\|doc\|footnote\|1)@(\d+)$/.exec(e.candidateId);
      if (m !== null) {
        const frag = Number(m[2]);
        expect(frag === 0 || frag === 4).toBe(true);
      }
    }
    // קיימת הרחבה שמסתיימת אחרי ההערה כולה (הגבול בסופה חוקי)
    const endsAfterNote = exps.filter((e) => e.candidateId.includes('note:v1|doc|footnote|1@4'));
    expect(endsAfterNote.length).toBe(1);
  });

  test('בלוק אטום שאינו נכנס לטור ריק — אין מועמד כלל (§10.3; הכרעת ADR-005)', () => {
    const H = columnHeight();
    const hugeNote = block('note:v1|doc|footnote|9', [LINE(H + 100000)], { role: 'note-body' });
    const src = createPageCandidateSource(inputFor([hugeNote]));
    const exps = src.expansions(initialState('note:v1|doc|footnote|9'));
    expect(exps.length).toBe(0);
    // והחיפוש — כשל מפורש (אין מועמד חוקי; צומת תקוע)
    expect(() => searchPages(initialState('note:v1|doc|footnote|9'), src, new DecisionLedgerBuilder('decisions'))).toThrow(LayoutEngineError);
  });

  test('קו גוף גבוה מטור ריק ⇒ מועמד חירום יחיד עם EMERGENCY_LINE', () => {
    const H = columnHeight();
    const tall = block('body|1', [LINE(H + 50000)]);
    const src = createPageCandidateSource(inputFor([tall]));
    const exps = src.expansions(initialState('body|1'));
    expect(exps.length).toBe(1);
    expect(exps[0]!.fallbackCode).toBe('EMERGENCY_LINE');
    expect(exps[0]!.quality[0]).toBe(2); // fallbackSeverity HIGH (ADR-004 רכיב 1)
    // החירום מתועד בפנקס כשהוא נבחר
    const ledger = new DecisionLedgerBuilder('full');
    const res = searchPages(initialState('body|1'), src, ledger);
    expect(res.status).toBe('complete');
    const emergencyRecords = ledger.build()!.records.filter((r) => r.fallbackCode === 'EMERGENCY_LINE');
    expect(emergencyRecords.length).toBe(1);
  });

  test('feasibility לפני cost: קו שאינו נכנס לנותר אינו מוצב', () => {
    const H = columnHeight();
    // 3 קווים של 40% מהטור — השלישי לא נכנס; הגבול האחרון אחרי השני
    const q = Math.floor((H * 4) / 10);
    const b = block('body|1', [LINE(q), LINE(q), LINE(q)]);
    const src = createPageCandidateSource(inputFor([b]));
    const exps = src.expansions(initialState('body|1'));
    // גבולות: אחרי קו 1, אחרי קו 2 (סוף בלוק); קו 3 אינו נכנס — אין גבול אחריו
    expect(exps.length).toBe(2);
    const last = exps[exps.length - 1]!;
    expect(last.candidateId).toContain('@2');
  });

  test('אין אובדן תוכן: מסלול שלם מכסה כל קו בדיוק פעם אחת', () => {
    const H = columnHeight();
    const lineH = Math.floor(H / 60);
    const blocks: PaginatedBlock[] = [];
    for (let i = 1; i <= 12; i++) {
      blocks.push(block(`body|${i}`, Array.from({ length: 7 }, (_, j) => LINE(lineH, { id: `line-${i}-${j}` }))));
    }
    // הערה אטומה באמצע + כותרת
    blocks.splice(6, 0, block('note:v1|doc|footnote|1', [LINE(lineH), LINE(lineH)], { role: 'note-body' }));
    blocks.splice(9, 0, block('heading|3|H2', [LINE(lineH)], { role: 'heading', headingLevel: 2 }));
    const src = createPageCandidateSource(inputFor(blocks));
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    // כיסוי: הסמן בקץ — אחרי הקו האחרון של הבלוק האחרון
    const lastBlock = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${lastBlock.blockId}|f${lastBlock.lines.length}`);
    // שרשרת המעברים רציפה ועוברת אימות (שלב 49)
    const transitions = res.path.flatMap((e) => e.transitions);
    expect(() => verifyTransitionChain(initialState('body|1'), transitions)).not.toThrow();
    // כל הרחבה מקדמת את הסמן פעם אחת
    const lineConsumers = transitions.filter((t) => t.action.kind === 'advance-cursor');
    expect(lineConsumers.length).toBe(res.path.length);
    // העמודים שנפתחו: יותר מ-1 (84 קווים; טור = 60)
    expect(res.finalState.physicalPageIndex).toBeGreaterThan(1);
    expect(res.regionClosures.length).toBe(res.finalState.physicalPageIndex - 1);
  });

  test('הערות: הפניות נאספות עם הקו שלהן ⇒ pend; כפילות נדחית לפני החיפוש', () => {
    const H = columnHeight();
    const lineH = Math.floor(H / 10);
    const b = block('body|1', [
      LINE(lineH, { footnoteRefs: ['note:v1|doc|footnote|1'] }),
      LINE(lineH),
      LINE(lineH, { sidenoteRefs: ['note:v1|doc|sidenote|7'] }),
    ]);
    const src = createPageCandidateSource(inputFor([b]));
    // הרחבה שמסתיימת אחרי קו 1 — ההערה ממתינה במצב היעד
    const exps = src.expansions(initialState('body|1'));
    const afterLine1 = exps.find((e) => e.candidateId.endsWith('body|1@1'))!;
    expect(afterLine1).toBeDefined();
    expect(afterLine1.toState.pendingFootnotes).toEqual(['note:v1|doc|footnote|1']);
    const afterLine3 = exps.find((e) => e.candidateId.endsWith('body|1@3'))!;
    expect(afterLine3.toState.pendingFootnotes).toEqual(['note:v1|doc|footnote|1']);
    expect(afterLine3.toState.pendingSidenotes).toEqual(['note:v1|doc|sidenote|7']);
    // אותה הערה פעמיים בשני קווים — feasibility דוחה (pend כפול) ואין מועמד
    const dup = block('body|1', [
      LINE(lineH, { footnoteRefs: ['note:v1|doc|footnote|1'] }),
      LINE(lineH, { footnoteRefs: ['note:v1|doc|footnote|1'] }),
    ]);
    const srcDup = createPageCandidateSource(inputFor([dup]));
    const expsDup = srcDup.expansions(initialState('body|1'));
    // רק הגבול אחרי קו 1 חוקי; אחרי קו 2 — כפילות pend נדחית (feasibility)
    expect(expsDup.length).toBe(1);
    expect(srcDup.stats.feasibilityRejections).toBe(1);
  });

  test('סוגריים: אירועים מוזרמים למצב; חציית עמוד חוקית (§10.4)', () => {
    const H = columnHeight();
    const lineH = Math.floor(H / 10);
    const openId = 'bracket:v1|doc|body|round|1|2';
    const b = block('body|1', [
      LINE(lineH, { bracketOpens: [{ pairId: openId, kind: 'round' }] }),
      LINE(lineH),
      LINE(lineH, { bracketCloses: [openId] }),
    ]);
    const src = createPageCandidateSource(inputFor([b]));
    const exps = src.expansions(initialState('body|1'));
    const afterLine1 = exps.find((e) => e.candidateId.endsWith('body|1@1'))!;
    expect(afterLine1.toState.openBracketStack.map((x) => x.pairId)).toEqual([openId]);
    const afterLine3 = exps.find((e) => e.candidateId.endsWith('body|1@3'))!;
    expect(afterLine3.toState.openBracketStack).toEqual([]); // נסגר בקו 3
    // חציית עמוד חוקית: מסלול שלם עם סוגר פתוח חוצה עמודים בלי כשל
    const long = block('body|2', Array.from({ length: 80 }, (_, i) => LINE(lineH, i === 0 ? { bracketOpens: [{ pairId: openId, kind: 'round' }] } : i === 79 ? { bracketCloses: [openId] } : {})));
    const src2 = createPageCandidateSource(inputFor([b, long]));
    const res = searchPages(initialState('body|1'), src2, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    // הסוגר נסגר בסוף המסלול — המחסנית ריקה בקץ
    expect(res.finalState.openBracketStack).toEqual([]);
    // סגירה שלא בראש המחסנית — feasibility דוחה (LIFO)
    const bad = block('body|3', [
      LINE(lineH, { bracketOpens: [{ pairId: 'bracket:v1|doc|body|round|1|2', kind: 'round' }, { pairId: 'bracket:v1|doc|body|square|3|4', kind: 'square' }] }),
      LINE(lineH, { bracketCloses: ['bracket:v1|doc|body|round|1|2'] }), // לא העליון!
    ]);
    const srcBad = createPageCandidateSource(inputFor([bad]));
    expect(srcBad.expansions(initialState('body|3')).length).toBe(1); // רק אחרי קו 1
    expect(srcBad.stats.feasibilityRejections).toBe(1);
  });

  test('ליווי כותרת (מנגנון; ערכים ב-M7): escort=2 אוסר גבול מוקדם', () => {
    const H = columnHeight();
    const lineH = Math.floor(H / 10);
    const blocks: PaginatedBlock[] = [
      block('heading|1|H2', [LINE(lineH)], { role: 'heading', headingLevel: 2 }),
      block('body|1', [LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH)]),
    ];
    const srcOn = createPageCandidateSource(inputFor(blocks, { headingEscortLines: 2 }));
    const expsOn = srcOn.expansions(initialState('heading|1|H2'));
    // עם escort=2: אסור לסיים את הטור אחרי הכותרת (H2@1) או אחרי קו גוף
    // אחד בלבד (body|1@1) — פחות מ-2 קווי ליווי
    const early = expsOn.filter((e) => /heading\|1\|H2@1$|body\|1@1$/.test(e.candidateId));
    expect(early.length).toBe(0);
    // אבל אחרי 2 קווי גוף — חוקי
    expect(expsOn.some((e) => e.candidateId.endsWith('body|1@2'))).toBe(true);
    expect(expsOn.map((e) => /@(\d+)$/.exec(e.candidateId)![1])).toEqual(['2', '3', '4']);
  });

  test('מדיניות: בלי שבירה בתוך-פסקה ⇒ רק סופי בלוקים; stride מרכז בלי איבוד', () => {
    const H = columnHeight();
    const lineH = Math.floor(H / 10);
    const b = block('body|1', [LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH)]);
    const srcStrict = createPageCandidateSource(inputFor([b], { allowIntraParagraphBreaks: false }));
    const expsStrict = srcStrict.expansions(initialState('body|1'));
    expect(expsStrict.length).toBe(1); // רק סוף הבלוק
    expect(expsStrict[0]!.candidateId).toContain('body|1@6');
    const srcStride = createPageCandidateSource(inputFor([b], { boundaryStride: 2 }));
    const expsStride = srcStride.expansions(initialState('body|1'));
    // צעד 2: גבולות אחרי קו 2, 4, 6 (סוף בלוק תמיד נוצר — אין איבוד כיסוי)
    expect(expsStride.map((e) => Number(/@(\d+)$/.exec(e.candidateId)![1]))).toEqual([2, 4, 6]);
  });

  test('המחולל כמקור לחיפוש: מסלול שלם, שרשרת רציפה, דטרמיניזם', () => {
    const H = columnHeight();
    const lineH = Math.floor(H / 45);
    const blocks: PaginatedBlock[] = [];
    for (let i = 1; i <= 6; i++) {
      blocks.push(block(`body|${i}`, Array.from({ length: 10 }, (_, j) => LINE(lineH, { id: `l-${i}-${j}` }))));
    }
    const src = createPageCandidateSource(inputFor(blocks));
    const runOnce = () => {
      const ledger = new DecisionLedgerBuilder('decisions');
      const res = searchPages(initialState('body|1'), src, ledger);
      return JSON.stringify({ path: res.path.map((e) => e.candidateId), q: res.quality, final: res.finalState.stateHash });
    };
    expect(new Set([runOnce(), runOnce(), runOnce()]).size).toBe(1);
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    expect(() => verifyTransitionChain(initialState('body|1'), res.path.flatMap((e) => e.transitions))).not.toThrow();
    // מעברי עמוד נרשמים כסגירות אזור
    expect(res.regionClosures.length).toBe(res.finalState.physicalPageIndex - 1);
  });

  test('אימות קלט: בלוקים/קווים כפולים וגבהים פסולים ⇒ דחייה מקוטלגת', () => {
    const bad1 = inputFor([block('body|1', [LINE(1000)]), block('body|1', [LINE(1000)])]);
    expect(candidateInputIssues(bad1)).toContain('blocks[1].blockId:duplicate');
    const bad2 = inputFor([block('body|1', [LINE(1000, { id: 'x' }), LINE(1000, { id: 'x' })])]);
    expect(candidateInputIssues(bad2)).toContain('blocks[0].lines[1].id:duplicate');
    const bad3 = inputFor([block('body|1', [{ id: 'x', heightLu: asLu(0), footnoteRefs: [], sidenoteRefs: [] }])]);
    expect(candidateInputIssues(bad3)).toContain('blocks[0].lines[0].heightLu');
    const bad4 = inputFor([block('body|1', [])]);
    expect(candidateInputIssues(bad4)).toContain('blocks[0].lines:empty');
    expect(() => createPageCandidateSource(bad1)).toThrow(LayoutEngineError);
    expect(candidateInputIssues(inputFor([block('body|1', [LINE(1000)])]))).toEqual([]);
  });

  test('Page opener (H0/H1) סוגר אזור עימוד — תשתית ל-M7', () => {
    const H = columnHeight();
    const lineH = Math.floor(H / 10);
    const blocks: PaginatedBlock[] = [
      block('body|1', [LINE(lineH), LINE(lineH)]),
      block('heading|1|H1', [LINE(lineH)], { role: 'heading', headingLevel: 1 }),
      block('body|2', [LINE(lineH), LINE(lineH)]),
    ];
    const src = createPageCandidateSource(inputFor(blocks));
    const exps = src.expansions(initialState('body|1'));
    // הגבול בסוף body|1 מציב את הסמן בראש ה-H1 (heading|1|H1@0:OPEN — שלב 59)
    // — ופותח עמוד חדש מיד (forcePageTemplate; לא מעבר טור); §9.2: opener סוגר אזור
    const beforeH1 = exps.find((e) => e.candidateId.endsWith('heading|1|H1@0:OPEN'))!;
    expect(beforeH1).toBeDefined();
    expect(beforeH1.closesRegion).toBe(true);
    // שלב 59: ההרחבה פותחת עמוד חדש (לא מעבר לטור 1) — הפותחת תוצב בראשו
    expect(beforeH1.toState.physicalPageIndex).toBe(2);
    expect(beforeH1.toState.columnIndex).toBe(0);
    // הרחבה שמסתיימת בתוך body|1 (בין-קווי) — אינה סוגרת
    const midBody = exps.find((e) => e.candidateId.endsWith('body|1@1'))!;
    expect(midBody.closesRegion).toBe(false);
  });
});
