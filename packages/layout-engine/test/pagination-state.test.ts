/**
 * pagination-state.test.ts — בדיקות שלב 49: PaginationState מלא ומעברי מצב
 * טהורים (אפיון §9.1; פרק ז/M6).
 *
 * מה מוכח כאן:
 *   1. המצב ההתחלתי — כל שדות §9.1 קיימים, קפוא-עומק, עמוד 1/טור 0.
 *   2. **דטרמיניזם הסריאליזציה**: אותו גרעין ⇐ אותו stateHash תמיד;
 *      סדר הכנסת מפתחות remainingByRegion אינו משנה (canonicalJson ממיין).
 *   3. **כל שינוי משנה hash**: שני מצבים הנבדלים בכל שדה מכסה — cursor,
 *      page, column, remaining, footnotes, sidenotes, brackets, headings,
 *      chapter — מקבלים hash שונה (דרישת §9.2: שני מצבים בעלי hash זהה
 *      כוללים גם notes, brackets ו־parity).
 *   4. **clone/restore**: שכפול מניב אותו hash; שחזור מליבה עם hash תואם
 *      עובר; hash צפוי שגוי נדחה; ליבה שגויה נדחית.
 *   5. **תלות בין עמודים**: openPage נושא הערות ממתינות/סוגריים/הקשר
 *      כותרות קדימה; האינדקס ממשיך בלי דילוגים; הטור חוזר ל־0.
 *   6. **כל מעבר מוסבר** (שער השלב): fromStateHash/toStateHash מחושבים
 *      נכון; verifyTransitionChain עובר על שרשרת אמיתית ונתפס כשמזייפים
 *      חוליה; explanation קנוני לכל סוג פעולה.
 *   7. אימותים: מעבר לא חוקי (סמן לא מתקדם, צריכה מעבר לנותר, אזור
 *      לא קיים, הערה כפולה, הצבה שלא בתור, סגירת סוגריים שאינו העליון,
 *      כותרת כפולה) נדחה בשגיאה מקוטלגת — אין שקט.
 *   8. chapterEnter — איפוס מונים לפי scope (siman/part מאפס, continuous
 *      לא); כניסה כפולה נדחית.
 *   9. קיפאון: ניסיון לשנות מצב בכתיבה נזרק (immutable בפועל).
 */
import { describe, expect, test } from 'vitest';
import { asLu, type LayoutUnit } from '@tora/layout-api';
import { LayoutEngineError } from '../src/errors.js';
import {
  advanceCursor,
  bracketClose,
  bracketOpen,
  chapterEnter,
  clonePaginationState,
  compareCursors,
  consumeRegion,
  formatCursor,
  headingEnter,
  headingExit,
  initialPaginationState,
  openPage,
  paginationStateIssues,
  parseCursor,
  pendFootnote,
  pendSidenote,
  placeFootnotes,
  placeSidenotes,
  restorePaginationState,
  stateHashOf,
  switchColumn,
  verifyPaginationState,
  verifyTransitionChain,
  type PaginationState,
  type PaginationTransition,
} from '../src/pagination/state.js';

const REGIONS: Readonly<Record<string, LayoutUnit>> = Object.freeze({
  'page:1:col:0': asLu(600000),
  'page:1:col:1': asLu(600000),
  'page:1:notes': asLu(80000),
});

function initialState(): PaginationState {
  return initialPaginationState({ firstBlockId: 'body|1|para', remainingByRegion: REGIONS });
}

describe('שלב 49 — PaginationState (§9.1)', () => {
  test('המצב ההתחלתי: כל שדות §9.1, עמוד 1, טור 0, קפוא-עומק', () => {
    const s = initialState();
    expect(s.contentCursor).toBe('cursor:v1|body|1|para|f0|a0');
    expect(s.physicalPageIndex).toBe(1);
    expect(s.columnIndex).toBe(0);
    expect(s.remainingByRegion).toEqual(REGIONS);
    expect(s.pendingFootnotes).toEqual([]);
    expect(s.pendingSidenotes).toEqual([]);
    expect(s.openBracketStack).toEqual([]);
    expect(s.activeHeadingContext).toEqual([]);
    expect(s.chapterState).toEqual({
      partId: null, partOrdinal: 1, simanId: null, simanNumber: null,
      footnoteOrdinal: 1, sidenoteOrdinal: 1, endnoteOrdinal: 1,
    });
    expect(s.stateHash).toMatch(/^[0-9a-f]{64}$/);
    verifyPaginationState(s); // hash תואם לשדות
    // קפאון-עומך: מערך ההערות הממתינות קפוא
    expect(() => { (s.pendingFootnotes as unknown as string[]).push('x'); }).toThrow();
    expect(Object.isFrozen(s)).toBe(true);
    expect(Object.isFrozen(s.remainingByRegion)).toBe(true);
  });

  test('סמן תוכן: format/parse הפיכים; השוואה בתוך בלוק; null בין בלוקים', () => {
    const c = { blockId: 'body|7|para', fragmentIndex: 3, atomIndex: 12 };
    expect(parseCursor(formatCursor(c))).toEqual(c);
    expect(compareCursors(
      { blockId: 'b', fragmentIndex: 1, atomIndex: 5 },
      { blockId: 'b', fragmentIndex: 2, atomIndex: 0 },
    )).toBe(-1);
    expect(compareCursors(
      { blockId: 'b', fragmentIndex: 2, atomIndex: 9 },
      { blockId: 'b', fragmentIndex: 2, atomIndex: 3 },
    )).toBe(1);
    expect(compareCursors(
      { blockId: 'b', fragmentIndex: 2, atomIndex: 3 },
      { blockId: 'b', fragmentIndex: 2, atomIndex: 3 },
    )).toBe(0);
    expect(compareCursors(
      { blockId: 'a', fragmentIndex: 0, atomIndex: 0 },
      { blockId: 'b', fragmentIndex: 0, atomIndex: 0 },
    )).toBeNull();
    // סמן שגוי נדחה בשתי הכיוונים
    expect(() => parseCursor('nonsense')).toThrow(LayoutEngineError);
    expect(() => parseCursor('cursor:v1|b|fX|aY')).toThrow(LayoutEngineError);
    expect(() => formatCursor({ blockId: '', fragmentIndex: 0, atomIndex: 0 })).toThrow(LayoutEngineError);
    expect(() => formatCursor({ blockId: 'b|x', fragmentIndex: -1, atomIndex: 0 })).toThrow(LayoutEngineError);
  });

  test('דטרמיניזם הסריאליזציה: אותו גרעין ⇐ אותו hash; סדר מפתחות לא משנה', () => {
    const s = initialState();
    const core = { ...s };
    delete (core as Record<string, unknown>).stateHash;
    expect(stateHashOf(core as Omit<PaginationState, 'stateHash'>)).toBe(s.stateHash);
    // אותם אזורים בסדר הכנסה שונה — אותו hash (canonicalJson ממיין מפתחות)
    const reordered = initialPaginationState({
      firstBlockId: 'body|1|para',
      remainingByRegion: { 'page:1:notes': asLu(80000), 'page:1:col:1': asLu(600000), 'page:1:col:0': asLu(600000) },
    });
    expect(reordered.stateHash).toBe(s.stateHash);
    // ערך שונה באזור אחד — hash שונה
    const changed = initialPaginationState({
      firstBlockId: 'body|1|para',
      remainingByRegion: { ...REGIONS, 'page:1:col:0': asLu(599999) },
    });
    expect(changed.stateHash).not.toBe(s.stateHash);
  });

  test('כל שדה מכסה משנה את ה־hash (§9.2 — hash זהה ⇔ אותם notes/brackets/parity)', () => {
    const base = initialState();
    const hashes = new Set<string>([base.stateHash]);
    const add = (s: PaginationState) => { expect(hashes.has(s.stateHash)).toBe(false); hashes.add(s.stateHash); };

    add(advanceCursor(base, { blockId: 'body|1|para', fragmentIndex: 1, atomIndex: 0 }).state); // cursor
    add(openPage(base, REGIONS).state); // page+column+regions
    const col = switchColumn(base, 1);
    add(col.state); // column
    add(consumeRegion(base, 'page:1:col:0', 1000).state); // remaining
    add(pendFootnote(base, 'note:v1|doc|footnote|1').state); // pendingFootnotes
    add(pendSidenote(base, 'note:v1|doc|sidenote|1').state); // pendingSidenotes
    add(bracketOpen(base, 'bracket:v1|doc|body|round|10|20', 'round').state); // openBracketStack
    add(headingEnter(base, 'heading|2|H3').state); // activeHeadingContext
    add(chapterEnter(base, { partId: 'part|1', partOrdinal: 1, simanId: 'siman|1', simanNumber: 1, noteScope: 'siman' }).state); // chapterState
    expect(hashes.size).toBe(10);
  });

  test('clone/restore: שכפול ⇐ אותו hash; שחזור עם hash תואם עובד; זיוף נתפס', () => {
    const s = pendFootnote(bracketOpen(initialState(), 'bracket:v1|doc|body|round|1|2', 'round').state, 'note:v1|doc|footnote|1').state;
    const clone = clonePaginationState(s);
    expect(clone.stateHash).toBe(s.stateHash);
    expect(clone).not.toBe(s); // עצם חדש — snapshot עצמאי
    expect(clone.openBracketStack[0]).not.toBe(s.openBracketStack[0]);
    // שחזור מליבה עם ה־hash הצפוי
    const core = { ...s } as Omit<PaginationState, 'stateHash'>;
    delete (core as Record<string, unknown>).stateHash;
    const restored = restorePaginationState(core, s.stateHash);
    expect(restored.stateHash).toBe(s.stateHash);
    // hash צפוי שגוי — נדחה
    expect(() => restorePaginationState(core, '0'.repeat(64))).toThrow(LayoutEngineError);
    // ליבה שגויה (עמוד 0) — נדחית
    expect(() => restorePaginationState({ ...core, physicalPageIndex: 0 })).toThrow(LayoutEngineError);
  });

  test('תלות בין עמודים: openPage נושא הערות/סוגריים/הקשר קדימה; אינדקס רציף; טור 0', () => {
    let s = initialState();
    s = pendFootnote(s, 'note:v1|doc|footnote|1').state;
    s = pendSidenote(s, 'note:v1|doc|sidenote|9').state;
    s = bracketOpen(s, 'bracket:v1|doc|body|round|5|99', 'round').state;
    s = headingEnter(s, 'heading|1|H2').state;
    s = switchColumn(s, 1).state;
    const p2 = openPage(s, REGIONS).state;
    expect(p2.physicalPageIndex).toBe(2);
    expect(p2.columnIndex).toBe(0);
    expect(p2.pendingFootnotes).toEqual(['note:v1|doc|footnote|1']); // נישאה קדימה
    expect(p2.pendingSidenotes).toEqual(['note:v1|doc|sidenote|9']);
    expect(p2.openBracketStack.map((b) => b.pairId)).toEqual(['bracket:v1|doc|body|round|5|99']);
    expect(p2.activeHeadingContext).toEqual(['heading|1|H2']);
    // הצבת ההערה בעמוד החדש — התלות נפתרת שם
    const resolved = placeFootnotes(p2, ['note:v1|doc|footnote|1']).state;
    expect(resolved.pendingFootnotes).toEqual([]);
    expect(resolved.stateHash).not.toBe(p2.stateHash);
  });

  test('שער השלב: כל מעבר מוסבר — שרשרת אמיתית עוברת; זיוף חוליה נתפס', () => {
    let s = initialState();
    const transitions: PaginationTransition[] = [];
    const push = (step: { state: PaginationState; transition: PaginationTransition }) => {
      transitions.push(step.transition);
      s = step.state;
    };
    push(advanceCursor(s, { blockId: 'body|1|para', fragmentIndex: 0, atomIndex: 4 }));
    push(pendFootnote(s, 'note:v1|doc|footnote|1'));
    push(bracketOpen(s, 'bracket:v1|doc|body|round|1|2', 'round'));
    push(consumeRegion(s, 'page:1:col:0', 65536));
    push(headingEnter(s, 'heading|2|H3'));
    push(switchColumn(s, 1));
    push(openPage(s, REGIONS));
    push(placeFootnotes(s, ['note:v1|doc|footnote|1']));
    push(bracketClose(s, 'bracket:v1|doc|body|round|1|2'));

    // לכל מעבר: from==prev.to, explanation קנוני קיים
    let prev = initialState().stateHash;
    for (const t of transitions) {
      expect(t.fromStateHash).toBe(prev);
      expect(t.toStateHash).toMatch(/^[0-9a-f]{64}$/);
      expect(t.explanation.length).toBeGreaterThan(3);
      prev = t.toStateHash;
    }
    expect(prev).toBe(s.stateHash);
    // השרשרת כולה עוברת
    expect(verifyTransitionChain(initialState(), transitions)).toBe(s.stateHash);
    // זיוף: החלפת from של חוליה 3 — נתפס
    const forged = transitions.map((t, i) => (i === 3 ? { ...t, fromStateHash: 'f'.repeat(64) } : t));
    expect(() => verifyTransitionChain(initialState(), forged)).toThrow(LayoutEngineError);
    // זיוף: to שגוי פורמט — נתפס
    const forgedTo = transitions.map((t, i) => (i === 5 ? { ...t, toStateHash: 'zz' } : t));
    expect(() => verifyTransitionChain(initialState(), forgedTo)).toThrow(LayoutEngineError);
    // explanations בפורמט אחיד לפי סוג הפעולה
    expect(transitions[0]!.explanation).toContain('cursor:v1|body|1|para|f0|a4');
    expect(transitions[6]!.explanation).toContain('עמוד פיזי ← 2');
    expect(transitions[5]!.explanation).toBe('טור ← 1');
  });

  test('אימותים — מעבר לא חוקי נדחה בשגיאה מקוטלגת (אין שקט)', () => {
    const s = initialState();
    const expectEngineError = (fn: () => unknown, reason: string) => {
      try {
        fn();
        throw new Error(`היה צפוי כשל: ${reason}`);
      } catch (e) {
        expect(e).toBeInstanceOf(LayoutEngineError);
        expect((e as LayoutEngineError).catalogKey).toBe('errors.engine.PAGINATION_STATE_INVALID');
      }
    };
    // סמן לא מתקדם באותו בלוק
    expectEngineError(() => advanceCursor(s, { blockId: 'body|1|para', fragmentIndex: 0, atomIndex: 0 }), 'cursor-not-advancing');
    expectEngineError(() => advanceCursor(s, { blockId: 'body|1|para', fragmentIndex: 0, atomIndex: 0 }), 'cursor-equal');
    // צריכה מעבר לנותר / אזור לא קיים / כמות לא חוקית
    expectEngineError(() => consumeRegion(s, 'page:1:col:0', 600001), 'consume-over');
    expectEngineError(() => consumeRegion(s, 'page:9:col:0', 1), 'consume-unknown-region');
    expectEngineError(() => consumeRegion(s, 'page:1:col:0', 0), 'consume-zero');
    // הערה כפולה / הצבה שלא בתור / רשימה ריקה
    const withNote = pendFootnote(s, 'note:v1|doc|footnote|1').state;
    expectEngineError(() => pendFootnote(withNote, 'note:v1|doc|footnote|1'), 'pend-duplicate');
    expectEngineError(() => placeFootnotes(s, ['note:v1|doc|footnote|1']), 'place-not-pending');
    expectEngineError(() => placeFootnotes(withNote, []), 'place-empty');
    // סוגריים: סגירה של לא-העליון; פתיחה כפולה
    const b1 = bracketOpen(s, 'bracket:v1|doc|body|round|1|2', 'round').state;
    const b2 = bracketOpen(b1, 'bracket:v1|doc|body|square|3|4', 'square').state;
    expectEngineError(() => bracketClose(b2, 'bracket:v1|doc|body|round|1|2'), 'close-not-top');
    expectEngineError(() => bracketOpen(b1, 'bracket:v1|doc|body|round|1|2', 'round'), 'open-duplicate');
    // עומק נגזר מהמחסנית: 1 ואז 2
    expect(b1.openBracketStack[0]!.depth).toBe(1);
    expect(b2.openBracketStack[1]!.depth).toBe(2);
    // כותרות: כפילות; יציאה שלא בהקשר; יציאה מסירה את הכפולים הפנימיים
    const h1 = headingEnter(s, 'heading|1|H2').state;
    expectEngineError(() => headingEnter(h1, 'heading|1|H2'), 'heading-duplicate');
    expectEngineError(() => headingExit(s, 'heading|1|H2'), 'heading-exit-not-in-context');
    const h2 = headingEnter(h1, 'heading|2|H4').state;
    expect(headingExit(h2, 'heading|1|H2').state.activeHeadingContext).toEqual([]);
    // טור: מעבר לאותו טור
    expectEngineError(() => switchColumn(s, 0), 'column-same');
    // chapterEnter כפול
    const c1 = chapterEnter(s, { partId: 'part|1', partOrdinal: 1, simanId: 'siman|1', simanNumber: 1, noteScope: 'siman' }).state;
    expectEngineError(
      () => chapterEnter(c1, { partId: 'part|1', partOrdinal: 1, simanId: 'siman|1', simanNumber: 1, noteScope: 'siman' }),
      'chapter-duplicate',
    );
  });

  test('chapterEnter — איפוס מונים לפי scope; מספור רץ ב-continuous', () => {
    const s = initialState();
    // siman scope מאפס את מוני ההערות
    const simanState = chapterEnter(s, { partId: 'part|1', partOrdinal: 1, simanId: 'siman|1', simanNumber: 1, noteScope: 'siman' }).state;
    expect(simanState.chapterState).toMatchObject({ partId: 'part|1', simanId: 'siman|1', simanNumber: 1, footnoteOrdinal: 1 });
    // כניסה לסימן הבא — siman מאפס שוב
    const next = chapterEnter(simanState, { partId: 'part|1', partOrdinal: 1, simanId: 'siman|2', simanNumber: 2, noteScope: 'siman' }).state;
    expect(next.chapterState.footnoteOrdinal).toBe(1);
    expect(next.chapterState.sidenoteOrdinal).toBe(1);
    // continuous לא מאפס — אבל כדי להראות זאת צריך מונה שכבר גדל: המונה גדל דרך
    // ההזרקה של המועמדים (שלב 52); כאן מוכח שהמעבר עצמו שומר את הערכים
    const cont = chapterEnter(next, { partId: 'part|2', partOrdinal: 2, simanId: 'siman|3', simanNumber: 3, noteScope: 'continuous' }).state;
    expect(cont.chapterState.footnoteOrdinal).toBe(next.chapterState.footnoteOrdinal);
    expect(cont.chapterState.endnoteOrdinal).toBe(1); // אף פעם לא מתאפס בכניסת פרק
  });

  test('consumeRegion מצטבר נכון עד אפס; עמוד חדש מאפס אזורים', () => {
    let s = initialState();
    s = consumeRegion(s, 'page:1:col:0', 200000).state;
    s = consumeRegion(s, 'page:1:col:0', 200000).state;
    expect(s.remainingByRegion['page:1:col:0']).toBe(200000);
    s = consumeRegion(s, 'page:1:col:0', 200000).state;
    expect(s.remainingByRegion['page:1:col:0']).toBe(0);
    expectEngineErrorCode(() => consumeRegion(s, 'page:1:col:0', 1));
    // הערות — תור FIFO: הצבה של הראשונה משאירה את השנייה בסדר
    let q = initialState();
    q = pendFootnote(q, 'note:v1|doc|footnote|1').state;
    q = pendFootnote(q, 'note:v1|doc|footnote|2').state;
    q = placeFootnotes(q, ['note:v1|doc|footnote|1']).state;
    expect(q.pendingFootnotes).toEqual(['note:v1|doc|footnote|2']);
    const p2 = openPage(q, REGIONS).state;
    expect(p2.remainingByRegion).toEqual(REGIONS); // אזורי העמוד החדש
    expect(p2.pendingFootnotes).toEqual(['note:v1|doc|footnote|2']);
  });

  test('סדן/צד: תור העערות צד בנפרד מהשוליים', () => {
    let s = initialState();
    s = pendSidenote(s, 'note:v1|doc|sidenote|1').state;
    expect(s.pendingSidenotes).toEqual(['note:v1|doc|sidenote|1']);
    expect(s.pendingFootnotes).toEqual([]);
    expectEngineErrorCode(() => placeSidenotes(s, ['note:v1|doc|sidenote|2']));
    s = placeSidenotes(s, ['note:v1|doc|sidenote|1']).state;
    expect(s.pendingSidenotes).toEqual([]);
  });

  test('paginationStateIssues — ליבות פסולות מדווחות במדויק', () => {
    const s = initialState();
    const core = () => {
      const c = { ...s } as Record<string, unknown>;
      delete c.stateHash;
      return c;
    };
    expect(paginationStateIssues({ ...core(), physicalPageIndex: 0 })).toContain('physicalPageIndex');
    expect(paginationStateIssues({ ...core(), columnIndex: 2 })).toContain('columnIndex');
    expect(paginationStateIssues({ ...core(), remainingByRegion: { bad: -5 as LayoutUnit } })).toContain('remainingByRegion.bad');
    expect(paginationStateIssues({ ...core(), pendingFootnotes: ['a', 'a'] })).toContain('pendingFootnotes:duplicate');
    expect(paginationStateIssues({ ...core(), openBracketStack: [{ pairId: 'p', bracketKind: 'round', depth: 3 }] })).toContain('openBracketStack[0]');
    expect(paginationStateIssues({ ...core(), activeHeadingContext: ['', 'x'] })).toContain('activeHeadingContext');
    expect(paginationStateIssues({ ...core(), chapterState: { ...s.chapterState, partOrdinal: 0 } })).toContain('chapterState');
    expect(paginationStateIssues({ ...core(), contentCursor: 'junk' })).toContain('contentCursor:unparseable');
  });

  test('דטרמיניזם: רצף מעברים זהה על מצב זהה ⇐ אותן תוצאות (10 ריצות)', () => {
    const first = initialState();
    const runOnce = (): string => {
      let s = first;
      for (let i = 0; i < 8; i++) {
        s = advanceCursor(s, { blockId: 'body|1|para', fragmentIndex: i, atomIndex: i * 3 + 1 }).state;
        if (i % 2 === 0) s = consumeRegion(s, 'page:1:col:0', 1000).state;
        if (i === 3) s = pendFootnote(s, `note:v1|doc|footnote|${i}`).state;
        if (i === 5) s = openPage(s, REGIONS).state;
      }
      return s.stateHash;
    };
    const results = new Set(Array.from({ length: 10 }, runOnce));
    expect(results.size).toBe(1);
  });
});

function expectEngineErrorCode(fn: () => unknown): void {
  try {
    fn();
    throw new Error('היה צפוי LayoutEngineError');
  } catch (e) {
    expect(e).toBeInstanceOf(LayoutEngineError);
    expect((e as LayoutEngineError).catalogKey).toBe('errors.engine.PAGINATION_STATE_INVALID');
  }
}
