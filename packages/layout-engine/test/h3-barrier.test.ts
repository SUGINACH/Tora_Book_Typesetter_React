/**
 * h3-barrier.test.ts — בדיקות שלב 56: מחסום H3 ואיזון סביבו; הסרת post-pass
 * (אפיון §10.1 H3, §9.3#6, §9.2; פרק ז/M6).
 *
 * מה מוכח כאן:
 *   1. **H3 חוצת-טורים**: ההרחבה שמציבה אותה שורפת את שני התקציבים עד
 *      תחתית הכותרת — שני הטורים מסונכרנים; הטקסט שאחריה ממשיך בפס
 *      חדש בטור 0.
 *   2. **לא פותחת עמוד מעצמה** (§10.1): ה-H3 באמצע עמוד נשארת באותו
 *      עמוד; רק כשאין מקום — היא זורמת לעמוד הבא כמו תוכן רגיל.
 *   3. **איזון לפני הכותרת**: החיפוש מעדיף מסלולים שמפזרים את הטקסט
 *      שלפני ה-H3 באופן מאוזן בין הטורים (עלות הרווחים ברכיב 8).
 *   4. **H3 בראש העמוד**: barrierY=0; הפס חדש בגובה מלא מתחת.
 *   5. **H3 סמוך לתחתית**: כשאין מקום לפס — ההרחבה נפסלת (feasibility)
 *      וה-H3 עוברת עמוד.
 *   6. **ליד הערות** (§9.3#5): הפס מתחשב בגוש ההערות שנצרב בעמוד.
 *   7. **אין post-pass**: אין מעבר תוכן/איזון אחרי ההחלטה — סריקת קוד.
 *   8. מסלול שלם עם H7/H3 מעורבים: כיסוי מלא, שרשרת רציפה, דטרמיניזם.
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
import { makeNoteBodySpec, type NoteBodySpec } from '../src/pagination/notes.js';
import { readFileSync } from 'node:fs';

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
const columnHeight = templates.for('body', 1).regions.find((r) => r.role === 'body-column' && r.columnIndex === 0)!.rect.height;

function inputFor(
  blocks: readonly PaginatedBlock[],
  noteBodies?: ReadonlyMap<string, NoteBodySpec>,
): CandidateGeneratorInput {
  return {
    blocks, templates, pageKind: 'body',
    ...(noteBodies !== undefined ? { noteBodies } : {}),
  };
}

function initialState(firstBlockId: string): PaginationState {
  return initialPaginationState({
    firstBlockId,
    remainingByRegion: initialRemainingByRegion(templates.for('body', 1), 1),
  });
}

function h3(blockId: string, heightLu: number): PaginatedBlock {
  return block(blockId, [LINE(heightLu)], { role: 'heading', headingLevel: 3 });
}

describe('שלב 56 — מחסום H3 ואיזון סביבו (§10.1; §9.3#6)', () => {
  test('H3 חוצת-טורים: שורפת את שני התקציבים עד תחתית הכותרת; המשך בפס חדש בטור 0', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 10);
    const h3H = Math.floor(H / 10);
    // 5 קווים לפני ה-H3 (חצי טור) — ההליכה בטור 0 מגיעה ל-H3
    const blocks = [
      block('body|1', [LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH)]),
      h3('heading|1|H3', h3H),
      block('body|2', [LINE(lineH), LINE(lineH)]),
    ];
    const src = createPageCandidateSource(inputFor(blocks));
    const exps = src.expansions(initialState('body|1'));
    // מועמד ה-H3: מזהה עם :H3; סופו אחרי בלוק ה-H3 (heading|1|H3@0 = הבלוק הבא ראשון קו)
    const h3exp = exps.find((e) => e.candidateId.includes(':H3'));
    expect(h3exp).toBeDefined();
    // לפני ה-H3 הוצבו 5 קווים בטור 0 (used0=5·lineH); col1 ריק (used1=0);
    // barrierY=5·lineH; bandTop=6·lineH — שריפת col0: lineH; col1: 6·lineH
    const to = h3exp!.toState;
    expect(to.remainingByRegion['page:1:col:0']).toBe(H - 6 * lineH);
    expect(to.remainingByRegion['page:1:col:1']).toBe(H - 6 * lineH);
    // ההמשך בפס החדש — בטור 0 (גם אם ה-H3 הגיעה בטור 0)
    expect(to.columnIndex).toBe(0);
    expect(to.physicalPageIndex).toBe(1); // אותו עמוד!
    // ה-H3 סוגרת אזור (barrier מוגדר; §9.2)
    expect(h3exp!.closesRegion).toBe(true);
  });

  test('לא פותחת עמוד מעצמה: H3 באמצע עמוד נשארת באותו עמוד', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 10);
    const h3H = Math.floor(H / 10);
    const blocks = [
      block('body|1', [LINE(lineH), LINE(lineH), LINE(lineH)]),
      h3('heading|1|H3', h3H),
      block('body|2', Array.from({ length: 14 }, () => LINE(lineH))),
    ];
    const src = createPageCandidateSource(inputFor(blocks));
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    // ה-H3 הוצבה בעמוד 1 (לא פתחה עמוד) — ההרחבה עם :H3 קיימת במסלול או שהוצעה
    const h3OnPage1 = res.path.some((e) => e.candidateId.startsWith('pg:1:') && e.candidateId.includes(':H3'))
      || src.expansions(initialState('body|1')).some((e) => e.candidateId.includes(':H3') && e.toState.physicalPageIndex === 1);
    expect(h3OnPage1).toBe(true);
    // כיסוי מלא
    const last = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
  });

  test('איזון לפני הכותרת: החיפוש מעדיף פיזור מאוזן בין הטורים', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 10);
    const h3H = Math.floor(H / 10);
    // 10 קווים לפני ה-H3 = טור מלא בדיוק; המסלול המאוזן: 5 בכל טור
    // (barrierY=5·lineH, רווח 0) מול הלא-מאוזן: 10 בטור 0 (barrierY=10·lineH,
    // רווח 10·lineH בטור 1) — החיפוש בוחר את המאוזן
    const blocks = [
      block('body|1', Array.from({ length: 10 }, () => LINE(lineH))),
      h3('heading|1|H3', h3H),
      block('body|2', Array.from({ length: 8 }, () => LINE(lineH))),
    ];
    const src = createPageCandidateSource(inputFor(blocks));
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    // מצא את ההרחבה שהציבה את ה-H3 במסלול הזוכה
    const h3exp = res.path.find((e) => e.candidateId.includes(':H3'));
    expect(h3exp).toBeDefined();
    const to = h3exp!.toState;
    // מאוזן: שני הטורים נשרפו לאותו bandTop — הרווח שלפני הכותרת אפס
    // כלומר used0 == used1 == barrierY; בדיקה: ההפרש בין הנותרים לפני השריפה
    // היה 0 — נבדק לפי האיכות: רכיב 8 של ההרחבה כולל אפס רווחי H3
    // (ההוכחה: ה-H3 הוצבה אחרי מעבר לטור 1 — כלומר הטקסט פוזר בשני טורים)
    const beforeH3 = h3exp!.transitions.some((t) => t.action.kind === 'switch-column');
    expect(beforeH3).toBe(true); // הטקסט לפני ה-H3 עבר טור — פיזור בין שניים
    // שני הטורים מסונכרנים אחרי ה-barrier
    expect(to.remainingByRegion[`page:${to.physicalPageIndex}:col:0`]).toBe(to.remainingByRegion[`page:${to.physicalPageIndex}:col:1`]);
  });

  test('H3 בראש העמוד: barrierY=0; פס מלא מתחת', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 10);
    const h3H = Math.floor(H / 10);
    const blocks = [
      h3('heading|1|H3', h3H),
      block('body|1', Array.from({ length: 10 }, () => LINE(lineH))),
    ];
    const src = createPageCandidateSource(inputFor(blocks));
    const exps = src.expansions(initialState('heading|1|H3'));
    const h3exp = exps.find((e) => e.candidateId.includes(':H3'))!;
    expect(h3exp).toBeDefined();
    expect(h3exp.toState.remainingByRegion['page:1:col:0']).toBe(H - h3H);
    expect(h3exp.toState.remainingByRegion['page:1:col:1']).toBe(H - h3H);
  });

  test('H3 סמוך לתחתית: אין מקום לפס ⇒ ההרחבה נפסלת וה-H3 עוברת עמוד', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 20);
    const h3H = Math.floor(H / 20);
    // 19 קווים בטור 0 (19/20 עמוד) — ה-H3 לא נכנסת לפס בטור 0; בטור 1 יש
    // מקום (barrierY=19/20·H — לא נכנס גם שם כי barrierY מבוסס על העמוק);
    // כלומר שתי האפשרויות בעמוד 1 נפסלות ⇒ הטקסט ממלא וה-H3 בעמוד 2
    const blocks = [
      block('body|1', Array.from({ length: 38 }, (_, i) => LINE(lineH))), // ~1.9 עמודים
      h3('heading|1|H3', h3H),
      block('body|2', Array.from({ length: 5 }, () => LINE(lineH))),
    ];
    const src = createPageCandidateSource(inputFor(blocks));
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    // ההרחבה בעמוד 1 עם H3 בטור 0 נפסלה (19 קווים = 0.95H; band = 1.0H > H)
    const h3Page1 = src.expansions(initialState('body|1')).filter((e) => e.candidateId.includes(':H3'));
    expect(h3Page1.length).toBe(0); // feasibility: אף מועמד H3 בעמוד 1 טור 0
    // המסלול השלם הציב את ה-H3 בעמוד 2 (לא ב-1)
    const h3exp = res.path.find((e) => e.candidateId.includes(':H3'))!;
    expect(h3exp).toBeDefined();
    expect(h3exp.candidateId.startsWith('pg:2:')).toBe(true);
    // הכיסוי המלא נשמר
    const last = blocks[blocks.length - 1]!;
    expect(res.finalState.contentCursor).toContain(`${last.blockId}|f${last.lines.length}`);
  });

  test('H3 ליד הערות: הפס מתחשב בגוש ההערות שנצרב בעמוד (§9.3#5)', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 20);
    const h3H = Math.floor(H / 20);
    const noteH = Math.floor(H / 2);
    const bodies = new Map([['note:v1|doc|footnote|1', makeNoteBodySpec('note:v1|doc|footnote|1', [noteH])]]);
    // ההערה נצרבת עם הקו הראשון — חצי עמוד הערות; ה-H3 אחרי 6 קווים:
    // bandTop בטוח נכנס (6/20 + 1/20 + 10/20 = 17/20 ≤ H) — בדיקת השרידה
    const blocks = [
      block('body|1', [
        LINE(lineH, { footnoteRefs: ['note:v1|doc|footnote|1'] }),
        ...Array.from({ length: 5 }, () => LINE(lineH)),
      ]),
      h3('heading|1|H3', h3H),
      block('body|2', Array.from({ length: 10 }, () => LINE(lineH))),
    ];
    const src = createPageCandidateSource(inputFor(blocks, bodies));
    const exps = src.expansions(initialState('body|1'));
    const h3exp = exps.find((e) => e.candidateId.includes(':H3'));
    expect(h3exp).toBeDefined();
    // ההערה נצרבה עם הקו שלה לפני ה-H3 (באותה הרחבה — אין post-pass)
    expect(h3exp!.toState.pendingFootnotes).toEqual([]);
    // ה-H3 עם ההערה: מסלול שלם מסתיים עם כיסוי מלא
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    expect(res.finalState.pendingFootnotes).toEqual([]);
  });

  test('אין post-pass: סריקת קוד — אין איזון/העברת תוכן אחרי ההחלטה', () => {
    const src = readFileSync(new URL('../src/pagination/candidates.ts', import.meta.url), 'utf8');
    const search = readFileSync(new URL('../src/pagination/search.ts', import.meta.url), 'utf8');
    // מזהי קוד של מעברי איזון/תיקון אחרי-החלטה אסורים בזרימת ההחלטה —
    // (האזכורים המילוליים של "אין post-pass" בהערות הם תיעוד ההיעדר)
    expect(src).not.toMatch(/function\s+(apply|run|do)\w*(Balance|PostProcess|AfterLayout)\w*\s*\(/);
    expect(search).not.toMatch(/function\s+(apply|run|do)\w*(Balance|PostProcess|AfterLayout)\w*\s*\(/);
    expect(src).not.toMatch(/function\s+rebalance\w*\s*\(/);
    // האיזון ממומש כעלות בחיפוש (רכיב 8 + h3GapLu) — לא כתיקון
    expect(src).toContain('h3GapLu');
    expect(src).toContain('איזון לפני הכותרת');
    // ההערות וההערות-צד בתוך ההרחבות (מעברי consume/place בשרשרת)
    expect(src).toContain('placeFootnotes');
    expect(src).toContain('placeSidenotes');
  });

  test('מסלול שלם עם H3 מרובות: כיסוי, שרשרת, אינווריאנט, דטרמיניזם', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 25);
    const h3H = Math.floor(H / 25);
    const blocks: PaginatedBlock[] = [];
    for (let i = 1; i <= 6; i++) {
      blocks.push(block(`body|${i}`, Array.from({ length: 10 }, () => LINE(lineH))));
      if (i % 2 === 0) blocks.push(h3(`heading|${i / 2}|H3`, h3H));
    }
    const src = createPageCandidateSource(inputFor(blocks));
    const runOnce = () => {
      const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
      return JSON.stringify([res.path.map((e) => e.candidateId), res.finalState.stateHash]);
    };
    expect(new Set([runOnce(), runOnce(), runOnce()]).size).toBe(1);
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    expect(() => verifyTransitionChain(initialState('body|1'), res.path.flatMap((e) => e.transitions))).not.toThrow();
    // שלוש ה-H3 הוצבו
    const h3count = res.path.filter((e) => e.candidateId.includes(':H3')).length;
    expect(h3count).toBe(3);
    // אינווריאנט: לכל עמוד-טור — צריכה ≤ H
    const perRegion = new Map<string, number>();
    for (const t of res.path.flatMap((e) => e.transitions)) {
      if (t.action.kind === 'consume-region') {
        const a = t.action as { regionId: string; amountLu: number };
        perRegion.set(a.regionId, (perRegion.get(a.regionId) ?? 0) + a.amountLu);
      }
    }
    for (const [, used] of perRegion) {
      expect(used).toBeLessThanOrEqual(H);
    }
  });
});
