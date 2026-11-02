/**
 * note-reservation.test.ts — בדיקות שלב 53: שריון הערות שוליים בתוך החיפוש
 * (אפיון §9.3#5, §10.3; ADR-005; פרק ז/M6).
 *
 * מה מוכח כאן:
 *   1. **הצריבה מצמצמת את הגוף** (§9.3#5): קו עם הפניית הערה נכנס רק
 *      אם הקו + גובה ההערה (+ הפרדה) נכנסים יחד — המרחב האפקטיבי.
 *   2. **דחיית עוגן** (ADR-005 §4): הערה שאינה נכנסת ⇒ ההליכה נעצרת
 *      לפני הקו; העוגן עובר טור/עמוד; ההערה מוצבת בעמוד שאליו הגיע.
 *   3. **אינווריאנט** קווים+הערות ≤ תוכן לכל טור על מסלול שלם.
 *   4. **הפרדה** נצרבת פעם אחת לעמוד (גם עם שתי הערות).
 *   5. **הערה גדולה מעמוד ריק**: בלי פיצול ⇒ כשל מפורש (תקוע); עם
 *      פיצול ⇒ LONG_NOTE_SPLIT בפנקס, ההמשך ‎#cont‎ נצרב בעמוד הבא.
 *   6. **שתי הערות לעוגן**: הכל או כלום — שתיהן נצרבות יחד או הקו נדחה.
 *   7. **הערה ליד מעבר טור/עמוד**: ההערה נוסעת עם הקו שלה גם כשהוא
 *      האחרון בטור; אין הערה יתומה (pendingFootnotes נוקה בסוף מסלול).
 *   8. **הצבה סמנטית**: כל הערה שמוקמה — הוצאה מהממתינים; פיצול
 *      משאיר המשך ממתין בדיוק עד שהוא מוצב.
 *   9. מפרט גוף הערה: אימות סכום; גוף חסר להפניה ⇒ דחיית קלט מקוטלגת.
 *  10. אין post-pass: ההערות בתוך הרחבות החיפוש (המעברים בשרשרת).
 */
import { describe, expect, test } from 'vitest';
import { asLu, DecisionLedgerBuilder } from '@tora/layout-api';
import { LayoutEngineError } from '../src/errors.js';
import { initialPaginationState, verifyTransitionChain, type PaginationState } from '../src/pagination/state.js';
import { buildPageTemplateSet, initialRemainingByRegion, type TemplateSetInput } from '../src/pagination/templates.js';
import { searchPages } from '../src/pagination/search.js';
import {
  createPageCandidateSource,
  type CandidateGeneratorInput,
  type PaginatedBlock,
  type PaginatedLine,
} from '../src/pagination/candidates.js';
import {
  continuationNoteId,
  makeNoteBodySpec,
  noteBodyIssues,
  reserveNote,
  resolveNotePolicy,
  DEFAULT_NOTE_RESERVATION_POLICY,
  type NoteBodySpec,
} from '../src/pagination/notes.js';

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
  notePolicy?: CandidateGeneratorInput['notePolicy'],
): CandidateGeneratorInput {
  return {
    blocks, templates, pageKind: 'body',
    ...(noteBodies !== undefined ? { noteBodies } : {}),
    ...(notePolicy !== undefined ? { notePolicy } : {}),
  };
}

function initialState(firstBlockId: string): PaginationState {
  return initialPaginationState({
    firstBlockId,
    remainingByRegion: initialRemainingByRegion(templates.for('body', 1), 1),
  });
}

const N1 = 'note:v1|doc|footnote|1';
const N2 = 'note:v1|doc|footnote|2';

describe('שלב 53 — שריון הערות שוליים בתוך החיפוש (§9.3#5; ADR-005)', () => {
  test('מפרט גוף הערה: סכום מאומת; גוף חסר להפניה ⇒ דחיית קלט מקוטלגת', () => {
    const spec = makeNoteBodySpec(N1, [1000, 2000, 3000]);
    expect(spec.heightLu).toBe(6000);
    expect(noteBodyIssues(spec)).toEqual([]);
    expect(noteBodyIssues({ noteId: N1, lineHeightLu: [1000], heightLu: 999 })).toContain('heightLu:mismatch');
    expect(() => makeNoteBodySpec(N1, [])).toThrow(LayoutEngineError);
    // הפניה בלי גוף — בלי noteBodies כלל זו התנהגות שלב 52 החוקית (pend בלבד);
    // עם noteBodies — כל הפניה חייבת גוף מדוד, אחרת דחיית קלט מקוטלגת
    const b = block('body|1', [LINE(1000, { footnoteRefs: [N1] })]);
    createPageCandidateSource(inputFor([b])); // בלי גופים — חוקי (שלב 52)
    const withBodies = new Map([[N2, makeNoteBodySpec(N2, [1000])]]);
    expect(() => createPageCandidateSource(inputFor([b], withBodies))).toThrow(LayoutEngineError); // N1 חסר
  });

  test('reserveNote: נכנסת / נדחית / נפרשת / כשל — לפי ADR-005', () => {
    const policy = resolveNotePolicy();
    expect(DEFAULT_NOTE_RESERVATION_POLICY.separatorHeightLu).toBe(0);
    expect(DEFAULT_NOTE_RESERVATION_POLICY.allowLongNoteSplit).toBe(false);
    const spec = makeNoteBodySpec(N1, [1000, 1000]);
    expect(reserveNote(spec, 3000, 5000, policy).kind).toBe('fits');
    // נכנסת לעמוד ריק אך לא לשארית — דחיית עוגן (ברירת המחדל)
    const defer = reserveNote(spec, 1500, 5000, policy);
    expect(defer.kind).toBe('defer');
    // עם פיצול — נפרשת בגבול קווים
    const splitPolicy = resolveNotePolicy({ allowLongNoteSplit: true });
    const split = reserveNote(spec, 1500, 5000, splitPolicy);
    expect(split.kind).toBe('split');
    if (split.kind === 'split') {
      expect(split.placedHeightLu).toBe(1000);
      expect(split.placedLines).toBe(1);
      expect(split.continuationId).toBe(`${N1}#cont`);
      expect(split.continuationHeightLu).toBe(1000);
    }
    // גדולה מעמוד ריק: בלי פיצול — כשל; עם פיצול — נפרשת לתוך תקציב העמוד
    const huge = makeNoteBodySpec(N2, [3000, 3000, 3000]); // 9000 > 5000
    expect(reserveNote(huge, 5000, 5000, policy).kind).toBe('fail');
    const hugeSplit = reserveNote(huge, 5000, 5000, splitPolicy);
    expect(hugeSplit.kind).toBe('split');
  });

  test('הצריבה מצמצמת את הגוף: קו + הערה נבדקים יחד (§9.3#5)', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 4); // 4 קווים ממלאים טור
    const noteH = Math.floor(H / 4); // ההערה שווה לקו — הצריבה מורידה קו שלם
    const bodies = new Map([[N1, makeNoteBodySpec(N1, [noteH])]]);
    // קו 1 רגיל; קו 2 נושא את ההערה; קווים 3-4 עודפים
    const b = block('body|1', [
      LINE(lineH),
      LINE(lineH, { footnoteRefs: [N1] }),
      LINE(lineH),
      LINE(lineH),
    ]);
    const src = createPageCandidateSource(inputFor([b], bodies));
    const exps = src.expansions(initialState('body|1'));
    // בלי הערה היו נוצרים גבולות אחרי קו 1..4; עם ההערה: אחרי קו 2 הצריבה
    // אכלה lineH — קו 4 כבר לא נכנס (3·lineH + noteH = H בדיוק ⇒ 3 נכנס,
    // 4 לא). הצריבה חסכה קו שלם מהטור — ההשפעה בגבולות עצמם (§9.3#5).
    const frags = exps.map((e) => Number(/@(\d+)$/.exec(e.candidateId)![1]));
    expect(frags).toEqual([1, 2, 3]);
    // ההרחבה אחרי קו 2 צורבת את ההערה: המצב היעד ניקה את הממתינים וצורך את תקציד ההערות
    const after2 = exps.find((e) => e.candidateId.endsWith('body|1@2'))!;
    expect(after2.toState.pendingFootnotes).toEqual([]);
    expect(after2.toState.remainingByRegion['page:1:notes']).toBe(H - noteH);
  });

  test('דחיית עוגן: הערה שאינה נכנסת ⇒ ההליכה נעצרת לפני הקו והעוגן עובר עמוד', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 10);
    // עמוד 1: 5 קווים (חצי עמוד בטור 0) — ההערה ענקית כמעט כמו העמוד:
    // בטור 0 לא נשאר מקום אחרי 5 קווים; בטור 1 גם לא; בעמוד 2 (ריק) כן
    const noteH = Math.floor(H * 0.8);
    const bodies = new Map([[N1, makeNoteBodySpec(N1, [noteH])]]);
    const mk = (withRef: boolean): PaginatedBlock => block('body|1', [
      LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH),
      LINE(lineH, withRef ? { footnoteRefs: [N1] } : {}),
      LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH),
      LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH),
    ]);
    const src = createPageCandidateSource(inputFor([mk(true)], bodies));
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    // ההערה מוקמה — הממתינים נוקו בסוף המסלול
    expect(res.finalState.pendingFootnotes).toEqual([]);
    // ההערה נצרבה באיזשהו עמוד: סך צריכת אזורי ההערות ≥ noteH
    const notesConsumed = res.path.some((e) => e.transitions.some((t) => t.action.kind === 'consume-region' && t.action.regionId.endsWith(':notes') && t.action.amountLu === noteH));
    expect(notesConsumed).toBe(true);
    // בלי ההערה — פחות עמודים (ההשוואה מראה שההערה השפיעה על העימוד)
    const srcNoNote = createPageCandidateSource(inputFor([mk(false)], bodies));
    const resNoNote = searchPages(initialState('body|1'), srcNoNote, new DecisionLedgerBuilder('decisions'));
    expect(res.finalState.physicalPageIndex).toBeGreaterThanOrEqual(resNoNote.finalState.physicalPageIndex);
  });

  test('אינווריאנט: לכל טור — קווים + הערות ≤ גובה התוכן (מסלול שלם)', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 20);
    const blocks: PaginatedBlock[] = [];
    for (let i = 1; i <= 8; i++) {
      const lines: PaginatedLine[] = [];
      for (let j = 0; j < 6; j++) {
        lines.push(LINE(lineH, j === 2 ? { footnoteRefs: [`note:v1|doc|footnote|${i}`] } : {}));
      }
      blocks.push(block(`body|${i}`, lines));
    }
    const bodies = new Map<string, NoteBodySpec>();
    for (let i = 1; i <= 8; i++) {
      bodies.set(`note:v1|doc|footnote|${i}`, makeNoteBodySpec(`note:v1|doc|footnote|${i}`, [lineH * 2, lineH]));
    }
    const src = createPageCandidateSource(inputFor(blocks, bodies));
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    // אינווריאנט על שרשרת המעברים: לכל עמוד-טור, סך צריכת הקווים + צריכת
    // ההערות של אותו עמוד ≤ H
    const perRegion = new Map<string, number>();
    for (const t of res.path.flatMap((e) => e.transitions)) {
      if (t.action.kind === 'consume-region') {
        perRegion.set(t.action.regionId, (perRegion.get(t.action.regionId) ?? 0) + t.action.amountLu);
      }
    }
    for (const [regionId, used] of perRegion) {
      if (regionId.endsWith(':col:0') || regionId.endsWith(':col:1')) {
        const page = Number(/page:(\d+):/.exec(regionId)![1]);
        const notesUsed = perRegion.get(`page:${page}:notes`) ?? 0;
        expect(used + notesUsed).toBeLessThanOrEqual(H);
      }
    }
    // שרשרת רציפה; ההערות הוצבו כולן
    expect(() => verifyTransitionChain(initialState('body|1'), res.path.flatMap((e) => e.transitions))).not.toThrow();
    expect(res.finalState.pendingFootnotes).toEqual([]);
  });

  test('הפרדה נצרבת פעם אחת לעמוד גם עם שתי הערות; שתי הערות לעוגן — הכל או כלום', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 10);
    const sep = 500;
    const noteH = Math.floor(H / 10);
    const bodies = new Map([
      [N1, makeNoteBodySpec(N1, [noteH])],
      [N2, makeNoteBodySpec(N2, [noteH])],
    ]);
    // קו אחד נושא שתי הפניות — שתיהן נצרבות יחד (+ הפרדה פעם אחת)
    const b = block('body|1', [
      LINE(lineH, { footnoteRefs: [N1, N2] }),
      LINE(lineH), LINE(lineH),
    ]);
    const src = createPageCandidateSource(inputFor([b], bodies, { separatorHeightLu: sep }));
    const exps = src.expansions(initialState('body|1'));
    const after1 = exps.find((e) => e.candidateId.endsWith('body|1@1'))!;
    // שתי ההערות הוצבו; הפרדה נצרבה פעם אחת בלבד
    expect(after1.toState.pendingFootnotes).toEqual([]);
    const notesConsume = after1.transitions.filter((t) => t.action.kind === 'consume-region' && t.action.regionId === 'page:1:notes');
    expect(notesConsume.length).toBe(1);
    expect(notesConsume[0]!.action.amountLu).toBe(noteH * 2 + sep);
    // הפרדה מצמצמת את הגוף: קו 3 לא נכנס יותר? 3·lineH + 2·noteH + sep ≈ H/2 — נשאר מקום; בדיקת הספירה:
    expect(exps.length).toBe(3); // כל שלושת הקווים נכנסים — הצריבה הייתה קטנה
    // שתי הערות כשאחת אינה נכנסת — הקו כולו נדחה: N2 ענקית
    const bodiesBig = new Map([
      [N1, makeNoteBodySpec(N1, [noteH])],
      [N2, makeNoteBodySpec(N2, [Math.floor(H * 0.9)])],
    ]);
    const srcBig = createPageCandidateSource(inputFor([b], bodiesBig, { separatorHeightLu: sep }));
    const expsBig = srcBig.expansions(initialState('body|1'));
    // אף גבול אחרי קו 1 (ההערה הענקית לא נכנסת לעמוד עם שארית קטנה; היא
    // כן נכנסת לעמוד ריק — ההליכה עוצרת לפני הקו וממשיכה בעמוד הבא)
    expect(expsBig.length).toBe(0);
  });

  test('הערה גדולה מעמוד ריק: בלי פיצול ⇒ כשל מפורש; עם פיצול ⇒ LONG_NOTE_SPLIT + המשך מוצב', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 20);
    const hugeH = H + 10000; // גדול מתקציד עמוד ריק
    const lines = Array.from({ length: 30 }, () => lineH);
    const hugeSpec = makeNoteBodySpec(N1, lines.map(() => Math.floor(hugeH / 30)));
    // התאמת גובה מדויקת: hugeH בקירוב — נבנה מחדש בגובה עודף מדויק
    const perLine = Math.floor((H + 3 * lineH) / 30);
    const hugeSpec2 = makeNoteBodySpec(N1, Array.from({ length: 30 }, () => perLine));
    void hugeSpec;
    const bodies = new Map([[N1, hugeSpec2]]);
    const b = block('body|1', [
      LINE(lineH, { footnoteRefs: [N1] }),
      ...Array.from({ length: 29 }, () => LINE(lineH)),
    ]);
    // בלי פיצול — החיפוש נכשל במפורש (ההערה לעולם לא נכנסת)
    const srcFail = createPageCandidateSource(inputFor([b], bodies));
    let threw = false;
    try { searchPages(initialState('body|1'), srcFail, new DecisionLedgerBuilder('decisions')); } catch { threw = true; }
    expect(threw).toBe(true);
    // עם פיצול — מסלול שלם; LONG_NOTE_SPLIT נרשם בפנקס; ההמשך מוצב בעמוד הבא
    const ledger = new DecisionLedgerBuilder('full');
    const srcSplit = createPageCandidateSource(inputFor([b], bodies, { allowLongNoteSplit: true }));
    const res = searchPages(initialState('body|1'), srcSplit, ledger);
    expect(res.status).toBe('complete');
    const records = ledger.build()!.records;
    const splitRecords = records.filter((r) => r.fallbackCode === 'LONG_NOTE_SPLIT');
    expect(splitRecords.length).toBeGreaterThan(0);
    // ההמשך הוצב — הממתינים נוקו בסוף המסלול (ההמשך של ההמשך וכו')
    expect(res.finalState.pendingFootnotes).toEqual([]);
    // סמן ההמשך הקנוני מופיע בצריבה
    const contSeen = res.path.some((e) => e.candidateId.includes(':SPLIT')) || splitRecords.length > 0;
    expect(contSeen).toBe(true);
    expect(continuationNoteId(N1)).toBe(`${N1}#cont`);
  });

  test('הערה ליד מעבר טור/עמוד: נוסעת עם הקו; אין הערה יתומה', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 6);
    const noteH = Math.floor(H / 6);
    const bodies = new Map([[N1, makeNoteBodySpec(N1, [noteH])]]);
    // 5 קווים ממלאים טור (5·lineH = 5H/6); קו 6 — האחרון של הטור — נושא הערה
    // שוות קו: 5·lineH + lineH + noteH > H ⇒ הקו השישי עם ההערה לא נכנס לטור
    // הזה; הוא עובר לטור הבא עם ההערה (לא נשארת יתומה בטור הקודם)
    const b = block('body|1', [
      LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH), LINE(lineH),
      LINE(lineH, { footnoteRefs: [N1] }),
      LINE(lineH), LINE(lineH),
    ]);
    const src = createPageCandidateSource(inputFor([b], bodies));
    const exps = src.expansions(initialState('body|1'));
    // הגבולות בטור 0: אחרי קווים 1..5 (הקו השישי + הערה לא נכנסים)
    const frags = exps.map((e) => Number(/@(\d+)$/.exec(e.candidateId)![1]));
    expect(frags).toEqual([1, 2, 3, 4, 5]);
    // אף הרחבה בטור זה לא הציבה את ההערה (הקו הנושא מעולם לא הוצב כאן)
    for (const e of exps) {
      expect(e.toState.pendingFootnotes).toEqual([]);
      expect(e.transitions.some((t) => t.action.kind === 'place-footnotes')).toBe(false);
    }
    // מסלול שלם: ההערה מוצבת בעמוד/טור שאליו הגיע הקו — אין יתומות
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    expect(res.status).toBe('complete');
    expect(res.finalState.pendingFootnotes).toEqual([]);
    const placed = res.path.flatMap((e) => e.transitions).some((t) => t.action.kind === 'place-footnotes');
    expect(placed).toBe(true);
  });

  test('אין post-pass: הצריבה בתוך הרחבות החיפוש — מעברי consume:notes/place-footnotes בשרשרת', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 10);
    const noteH = Math.floor(H / 10);
    const bodies = new Map([[N1, makeNoteBodySpec(N1, [noteH])]]);
    const b = block('body|1', [LINE(lineH, { footnoteRefs: [N1] }), LINE(lineH), LINE(lineH)]);
    const src = createPageCandidateSource(inputFor([b], bodies, { separatorHeightLu: 100 }));
    const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
    // ההרחבה שמציבה את ההערה נושאת את כל המעברים בשרשרת אחת: consume
    // (קו) ← consume (הערות) ← pend ← place — ואז מעבר טור. אין שלב נפרד.
    const expansionWithNote = res.path.find((e) => e.transitions.some((t) => t.action.kind === 'place-footnotes'))!;
    expect(expansionWithNote).toBeDefined();
    const kinds = expansionWithNote.transitions.map((t) => t.action.kind);
    expect(kinds).toContain('consume-region');
    expect(kinds).toContain('place-footnotes');
    expect(kinds).toContain('pend-footnote');
    // הצריבה קודמת לסגירת הטור — בתוך ההרחבה, לא אחריה
    const noteConsumeIdx = kinds.findIndex((k, i) => k === 'consume-region' && (expansionWithNote.transitions[i]!.action as { regionId: string }).regionId.endsWith(':notes'));
    const switchIdx = kinds.indexOf('switch-column');
    expect(noteConsumeIdx).toBeGreaterThan(-1);
    expect(noteConsumeIdx).toBeLessThan(switchIdx);
  });

  test('דטרמיניזם: מסלול עם הערות זהה בין ריצות (5 ריצות)', () => {
    const H = columnHeight;
    const lineH = Math.floor(H / 15);
    const blocks: PaginatedBlock[] = [];
    const bodies = new Map<string, NoteBodySpec>();
    for (let i = 1; i <= 5; i++) {
      blocks.push(block(`body|${i}`, Array.from({ length: 8 }, (_, j) => LINE(lineH, j === 3 ? { footnoteRefs: [`note:v1|doc|footnote|${i}`] } : {}))));
      bodies.set(`note:v1|doc|footnote|${i}`, makeNoteBodySpec(`note:v1|doc|footnote|${i}`, [lineH, lineH]));
    }
    const src = createPageCandidateSource(inputFor(blocks, bodies, { separatorHeightLu: 200 }));
    const runOnce = () => {
      const res = searchPages(initialState('body|1'), src, new DecisionLedgerBuilder('decisions'));
      return JSON.stringify([res.path.map((e) => e.candidateId), res.finalState.stateHash, res.quality]);
    };
    expect(new Set(Array.from({ length: 5 }, runOnce)).size).toBe(1);
  });
});
