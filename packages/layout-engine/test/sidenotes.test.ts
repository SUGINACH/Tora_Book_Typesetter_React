/**
 * sidenotes.test.ts — בדיקות שלב 54: הערות צד (H7) מעוגנות לשורה
 * (אפיון §10.3 Sidenotes, §9.3#3; פרק ז/M6).
 *
 * מה מוכח כאן:
 *   1. **עיגון לשורה**: הפניית H7 רוכבת על הקו שלה (pend עם הקו) וההצבה
 *      באזור החיצוני של **אותו עמוד** — לא לפי מספר עמוד גולמי
 *      (§10.3: "לא doc.sidenotes[pageNumber-1]").
 *   2. **אין גזילה מהטור**: הערת צד נצרבת באזור החיצוני בלבד — מספר
 *      הגבולות בטור זהה עם ובלי הערות צד (השוליים לצד הטקסט).
 *   3. **עקירה FIFO** (§10.3: "אם אין מקום, תור FIFO לפי מקור ועלות
 *      displacement"): הערה שאינה נכנסת לשארית האזור נשארת ממתינה
 *      ומוצבת ראשונה בעמוד הבא; עלות displacement ברכיב 3.
 *   4. **אין דריסה** (§10.3: "אין דריסה של הערה קודמת"): התקציב
 *      המצטבר מבטיח שסכום ההערות המוצבות בעמוד ≤ תקציב האזור.
 *   5. **H7 מרובים** בעמוד: כולן נצרבות בסדר המקור; קו ליד גבול טור.
 *   6. **הערת צד ארוכה מהאזור כולו** ⇒ דחיית עוגן נצחית ⇒ החיפוש
 *      נכשל במפורש (אין פיצול להערות צד; אין גלישה שקטה).
 *   7. **שני טורים**: האזור החיצוני משותף לעמוד — הערות משני הטורים
 *      נצרבות באותו תקציד.
 *   8. תבנית בלי אזור חיצוני + הפניות H7 ⇒ דחיית קלט מקוטלגת.
 *   9. דטרמיניזם מלא; אין הערת צד מנותקת בסוף מסלול (הכל מוצב).
 */
import { describe, expect, test } from 'vitest';
import { asLu, DecisionLedgerBuilder } from '@tora/layout-api';
import { LayoutEngineError } from '../src/errors.js';
import { initialPaginationState, pendSidenote, verifyTransitionChain, type PaginationState } from '../src/pagination/state.js';
import { buildPageTemplateSet, initialRemainingByRegion, type TemplateSetInput } from '../src/pagination/templates.js';
import { searchPages } from '../src/pagination/search.js';
import {
  createPageCandidateSource,
  type CandidateGeneratorInput,
  type PaginatedBlock,
  type PaginatedLine,
} from '../src/pagination/candidates.js';
import { makeNoteBodySpec, type NoteBodySpec } from '../src/pagination/notes.js';

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

function templateInput(sidenoteWidthLu: number | null, overrides: Partial<TemplateSetInput> = {}): TemplateSetInput {
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
    sidenoteWidthLu: sidenoteWidthLu === null ? null : asLu(sidenoteWidthLu),
    ...overrides,
  };
}

const templatesWithSide = buildPageTemplateSet(templateInput(300000));
const templatesNoSide = buildPageTemplateSet(templateInput(null));
const columnHeight = templatesWithSide.for('body', 1).regions.find((r) => r.role === 'body-column' && r.columnIndex === 0)!.rect.height;

function inputFor(
  blocks: readonly PaginatedBlock[],
  noteBodies: ReadonlyMap<string, NoteBodySpec>,
  templates = templatesWithSide,
): CandidateGeneratorInput {
  return { blocks, templates, pageKind: 'body', noteBodies };
}

function initialState(firstBlockId: string, templates = templatesWithSide): PaginationState {
  return initialPaginationState({
    firstBlockId,
    remainingByRegion: initialRemainingByRegion(templates.for('body', 1), 1),
  });
}

/** עזר: מצב עם הערת צד ממתינה (כאילו עקורה מהעמוד הקודם). */
function pendSidenoteTransition(s: PaginationState, noteId: string): PaginationState {
  return pendSidenote(s, noteId).state;
}

const S1 = 'note:v1|doc|sidenote|1';
const S2 = 'note:v1|doc|sidenote|2';
const S3 = 'note:v1|doc|sidenote|3';

describe('שלב 54 — הערות צד (H7) מעוגנות לשורה (§10.3)', () => {
  test('תבנית בלי אזור חיצוני + הפניות H7 ⇒ דחיית קלט מקוטלגת', () => {
    const bodies = new Map([[S1, makeNoteBodySpec(S1, [1000])]]);
    const b = block('body|1', [LINE(1000, { sidenoteRefs: [S1] })]);
    expect(() => createPageCandidateSource(inputFor([b], bodies, templatesNoSide))).toThrow(LayoutEngineError);
  });

  test('עיגון לשורה + אין גזילה מהטור: ההצבה באזור החיצוני של אותו עמוד', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 10);
    const sideH = Math.floor(H / 10);
    const bodies = new Map([[S1, makeNoteBodySpec(S1, [sideH])]]);
    const b = block('body|1', [LINE(lineH, { sidenoteRefs: [S1] }), LINE(lineH), LINE(lineH)]);
    const src = createPageCandidateSource(inputFor([b], bodies));
    const exps = src.expansions(initialState('body|1'));
    // אותו מספר גבולות כמו בלי הערת צד — השוליים אינם גוזלים מהטור
    expect(exps.length).toBe(3);
    const after1 = exps.find((e) => e.candidateId.endsWith('body|1@1'))!;
    // ההערה הוצבה באזור החיצוני: תקציד האזור נצרב; הממתינים נוקו
    expect(after1.toState.pendingSidenotes).toEqual([]);
    expect(after1.toState.remainingByRegion['page:1:outer']).toBe(H - sideH);
    // הטור עצמו לא נפגע: צריכת הטור = גובה הקווים בלבד
    const colConsume = after1.transitions.find((t) => t.action.kind === 'consume-region' && (t.action as { regionId: string }).regionId === 'page:1:col:0')!;
    expect((colConsume.action as { amountLu: number }).amountLu).toBe(lineH);
    // העיגון לשורה: pend + place באותה שרשרת של הגבול שכולל את הקו
    expect(after1.transitions.some((t) => t.action.kind === 'pend-sidenote')).toBe(true);
    expect(after1.transitions.some((t) => t.action.kind === 'place-sidenotes')).toBe(true);
  });

  test('H7 מרובים בעמוד: כולן נצרבות בסדר המקור; אין דריסה (תקציד מצטבר)', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 10);
    const sideH = Math.floor(H / 10);
    const bodies = new Map([
      [S1, makeNoteBodySpec(S1, [sideH])],
      [S2, makeNoteBodySpec(S2, [sideH])],
      [S3, makeNoteBodySpec(S3, [sideH])],
    ]);
    const b = block('body|1', [
      LINE(lineH, { sidenoteRefs: [S1] }),
      LINE(lineH, { sidenoteRefs: [S2] }),
      LINE(lineH, { sidenoteRefs: [S3] }),
      LINE(lineH),
    ]);
    const src = createPageCandidateSource(inputFor([b], bodies));
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    // כל שלוש ההערות הוצבו — אין ממתינות בסוף (אין הערה מנותקת)
    expect(res.finalState.pendingSidenotes).toEqual([]);
    // אין דריסה: סכום הצריבה באזור החיצוני של כל עמוד ≤ תקציד (H)
    const perRegion = new Map<string, number>();
    for (const t of res.path.flatMap((e) => e.transitions)) {
      if (t.action.kind === 'consume-region') {
        const a = t.action as { regionId: string; amountLu: number };
        perRegion.set(a.regionId, (perRegion.get(a.regionId) ?? 0) + a.amountLu);
      }
    }
    for (const [regionId, used] of perRegion) {
      if (regionId.endsWith(':outer')) {
        expect(used).toBeLessThanOrEqual(H);
      }
    }
    expect((perRegion.get('page:1:outer') ?? 0)).toBe(sideH * 3);
  });

  test('עקירה FIFO — המנגנון: מועמדים עם עקירה נוצרים; החיפוש מעדיף העברת עוגן+הערה יחד (§10.3 "ליד העוגן")', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 20);
    const sideH = Math.floor(H / 3); // 3 הערות ממלאות את האזור; ה-4 נעקרת
    const bodies = new Map<string, NoteBodySpec>();
    const blocks: PaginatedBlock[] = [];
    for (let i = 1; i <= 8; i++) {
      const id = `note:v1|doc|sidenote|${i}`;
      bodies.set(id, makeNoteBodySpec(id, [sideH]));
      blocks.push(block(`body|${i}`, [LINE(lineH, { sidenoteRefs: [id] }), LINE(lineH), LINE(lineH)]));
    }
    const src = createPageCandidateSource(inputFor(blocks, bodies));
    // המנגנון: מועמדים עם עקירה אכן נוצרים (הצריבה חורגת ⇒ displacement
    // ברכיב 3) — ההערה ה-4 ואילך נעקרות במועמדים שמציבים את קוויהן
    const exps = src.expansions(initialState('body|1'));
    const withDisplacement = exps.filter((e) => e.quality[2] > 0);
    expect(withDisplacement.length).toBeGreaterThan(0);
    const dis4 = withDisplacement.find((e) => e.candidateId.includes('body|4@1'))!;
    expect(dis4.quality[2]).toBe(1); // בדיוק הערה אחת עקורה בגבול זה
    // ההערה העקורה נשארת ממתינה במצב היעד של המועמד (FIFO — מחכה לעמוד הבא)
    expect(dis4.toState.pendingSidenotes).toEqual(['note:v1|doc|sidenote|4']);
    // החיפוש: מסלול שלם — הכל מוצב, אין מנותקות; החיפוש רשאי להעדיף
    // מסלול שמעביר עוגן+הערה יחד (0 עקירות) — זו ההעדפה של §10.3
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    expect(res.finalState.pendingSidenotes).toEqual([]);
    expect(res.path.every((e) => e.quality[2] >= 0)).toBe(true);
  });

  test('FIFO בפועל: ממתינה מהעמוד הקודם נצרבת ראשונה באזור של העמוד הבא', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 10);
    const sideH = Math.floor(H / 4);
    const bodies = new Map([
      [S1, makeNoteBodySpec(S1, [sideH])],
      [S2, makeNoteBodySpec(S2, [sideH])],
    ]);
    const b = block('body|1', [LINE(lineH, { sidenoteRefs: [S2] }), LINE(lineH), LINE(lineH)]);
    const src = createPageCandidateSource(inputFor([b], bodies));
    // מצב התחלתי עם S1 ממתינה (עקורה מהעמוד הקודם) — ההרחבה הראשונה חייבת
    // לצרוב אותה ראשונה באזור לפני ההערות החדשות (FIFO לפי מקור; §10.3)
    let s = initialState('body|1');
    const pendStep = pendSidenoteTransition(s, S1);
    s = pendStep;
    const exps = src.expansions(s);
    const first = exps.find((e) => e.candidateId.endsWith('body|1@1'))!;
    // S1 (הממתינה) נצרבה לפני S2 (החדשה): שתיהן הוצבו; הצריבה כוללת את שתיהן
    expect(first.toState.pendingSidenotes).toEqual([]);
    const outerConsume = first.transitions.find((t) => t.action.kind === 'consume-region' && (t.action as { regionId: string }).regionId === 'page:1:outer')!;
    expect((outerConsume.action as { amountLu: number }).amountLu).toBe(sideH * 2);
    // סדר ההצבה: S1 לפני S2 (FIFO) — נבדק ב-place-sidenotes שמכיל את שתיהן
    const place = first.transitions.find((t) => t.action.kind === 'place-sidenotes')!;
    expect((place.action as { noteIds: string[] }).noteIds[0]).toBe(S1);
    expect((place.action as { noteIds: string[] }).noteIds[1]).toBe(S2);
  });

  test('הערת צד גדולה מהאזור כולו ⇒ דחיית עוגן נצחית ⇒ כשל מפורש', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 10);
    const bodies = new Map([[S1, makeNoteBodySpec(S1, [H + 50000])]]);
    const b = block('body|1', [LINE(lineH), LINE(lineH, { sidenoteRefs: [S1] }), LINE(lineH)]);
    const src = createPageCandidateSource(inputFor([b], bodies));
    let threw = false;
    try { searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions')); } catch { threw = true; }
    expect(threw).toBe(true);
  });

  test('שני טורים: האזור החיצוני משותף לעמוד — הערות משני הטורים באותו תקציד', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 10);
    const sideH = Math.floor(H / 5);
    const bodies = new Map([
      [S1, makeNoteBodySpec(S1, [sideH])],
      [S2, makeNoteBodySpec(S2, [sideH])],
    ]);
    // 9 קווים בפסקה אחת — עוברים טורים; ההערה השנייה נמצאת בטור 1
    const b = block('body|1', [
      LINE(lineH, { sidenoteRefs: [S1] }),
      ...Array.from({ length: 7 }, () => LINE(lineH)),
      LINE(lineH, { sidenoteRefs: [S2] }),
    ]);
    const src = createPageCandidateSource(inputFor([b], bodies));
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    expect(res.finalState.pendingSidenotes).toEqual([]);
    // שתי ההערות נצרבו בעמוד 1 (האזור משותף לשני הטורים): סכום בתקציד
    const outerUsed = new Map<string, number>();
    for (const t of res.path.flatMap((e) => e.transitions)) {
      if (t.action.kind === 'consume-region') {
        const a = t.action as { regionId: string; amountLu: number };
        if (a.regionId.endsWith(':outer')) {
          outerUsed.set(a.regionId, (outerUsed.get(a.regionId) ?? 0) + a.amountLu);
        }
      }
    }
    const page1Outer = outerUsed.get('page:1:outer') ?? 0;
    expect(page1Outer).toBe(sideH * 2); // שתיהן בעמוד 1 — משני הטורים
    expect(page1Outer).toBeLessThanOrEqual(H);
  });

  test('קו הערה ליד גבול טור: המועמדים מכסים גם עקירה וגם העברת עוגן; המסלול נקי', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 6);
    const sideH = Math.floor(H / 2); // שתי הערות ממלאות אזור; השלישית מועמדת לעקירה
    const bodies = new Map([
      [S1, makeNoteBodySpec(S1, [sideH])],
      [S2, makeNoteBodySpec(S2, [sideH])],
      [S3, makeNoteBodySpec(S3, [sideH])],
    ]);
    const b = block('body|1', [
      LINE(lineH, { sidenoteRefs: [S1] }),
      LINE(lineH, { sidenoteRefs: [S2] }),
      LINE(lineH),
      LINE(lineH, { sidenoteRefs: [S3] }), // ליד סוף הטור — האזור כבר מלא
      LINE(lineH),
    ]);
    const src = createPageCandidateSource(inputFor([b], bodies));
    const exps = src.expansions(initialState('body|1'));
    // מועמד שמציב את קו S3 כאן — S3 עקורה (עלות 1) או הגבול נעצר לפניו
    const withS3 = exps.filter((e) => /body\|1@[45]$/.test(e.candidateId));
    expect(withS3.length).toBeGreaterThan(0);
    const s3Placed = withS3.find((e) => e.candidateId.endsWith('body|1@4'));
    if (s3Placed !== undefined) {
      expect(s3Placed.quality[2]).toBe(1); // עקירה מתועדת בעלות
    }
    // מסלול שלם: כל ההערות מוצבות בסוף — אין מנותקות
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    expect(res.finalState.pendingSidenotes).toEqual([]);
  });

  test('דטרמיניזם מלא: 5 ריצות זהות; שרשרת רציפה', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 15);
    const sideH = Math.floor(H / 4);
    const blocks: PaginatedBlock[] = [];
    const bodies = new Map<string, NoteBodySpec>();
    for (let i = 1; i <= 10; i++) {
      const id = `note:v1|doc|sidenote|${i}`;
      bodies.set(id, makeNoteBodySpec(id, [sideH]));
      blocks.push(block(`body|${i}`, Array.from({ length: 6 }, (_, j) => LINE(lineH, j === 2 ? { sidenoteRefs: [id] } : {}))));
    }
    const src = createPageCandidateSource(inputFor(blocks, bodies));
    const runOnce = () => {
      const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
      return JSON.stringify([res.path.map((e) => e.candidateId), res.quality, res.finalState.stateHash]);
    };
    expect(new Set(Array.from({ length: 5 }, runOnce)).size).toBe(1);
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(() => verifyTransitionChain(initialState('body|1'), res.path.flatMap((e) => e.transitions))).not.toThrow();
    expect(res.finalState.pendingSidenotes).toEqual([]);
  });
});
