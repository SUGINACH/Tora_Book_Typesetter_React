/**
 * linked-navigation.test.ts — בדיקות הליבה הטהורה של העורך המקושר (שלב 81; אפיון §13.2, §14.2).
 *
 * מה מוכח כאן:
 *   1. פענוח AtomId ← פרוסת מקור: הלוך־וחזור מלא מול deriveAtomId של
 *      content-model (כולל נטרול ‎%‎/‎|‎) — הזהות הלוגית חיה במזהה,
 *      ולכן המיפוי נכון גם אחרי shaping ו־reorder (שעת השלב).
 *   2. חפיפת טווחים חצי־פתוחים: סמיכות אינה חפיפה; סמן מרוכז
 *      (קליק בעורך) נוגע בפרוסה שעליו בלבד.
 *   3. הליכה על ה־IR: כל הפריטים נושאי-המקור החופפים לטווח — קווים,
 *      סמני הערות ועוגנים — בסדר ה־IR; rule/ornament פטורים ומתועדים.
 *   4. שלמות provenance: קו/סמן/עוגן בלי מקור הם בעיה; המנוע האמיתי
 *      מניב רשימה ריקה תמיד (נעול גם ב־E2E על IR אמיתי).
 *   5. דטרמיניזם — אותם קלטים ⇐ אותה תוצאה בדיוק.
 */
import { describe, expect, test } from 'vitest';
import { deriveAtomId, makeSourceSpan } from '@tora/content-model';
import type { LayoutDocument } from '@tora/layout-api';
import {
  LINKED_ITEM_KINDS,
  atomSourceRangeOf,
  firstAtomIdOfItem,
  itemSourceRange,
  linkedItemsForRange,
  provenanceIssues,
  rangeOverlapsSpan,
  sourceRangeOfSpans,
} from '../../src/stores/linked-navigation.js';

// ─────────────────────────── עזרי בנייה מינימליים ───────────────────────────

const line = (id: string, start: number, end: number, atomIds: string[] = []): unknown => ({
  kind: 'line',
  id,
  blockId: 'b-1',
  regionId: 'r-1',
  runs: atomIds.length > 0 ? [{ id: `${id}-run`, atomIds }] : [],
  sourceSpans: [{ documentId: 'd', stream: 'body', startUtf16: start, endUtf16: end }],
});

const marker = (id: string, start: number, end: number): unknown => ({
  kind: 'note-marker',
  id,
  noteId: 'fn-1',
  source: { documentId: 'd', stream: 'body', startUtf16: start, endUtf16: end },
});

const anchor = (id: string, start: number, end: number): unknown => ({
  kind: 'anchor',
  id,
  anchorId: 'a-1',
  source: { documentId: 'd', stream: 'body', startUtf16: start, endUtf16: end },
});

const makeIr = (items: readonly unknown[]): LayoutDocument =>
  ({ pages: [{ id: 'p-1', items }], anchors: [] }) as unknown as LayoutDocument;

// ─────────────────────────── 1. פענוח AtomId ───────────────────────────

describe('atomSourceRangeOf — פענוח המזהה הקנוני (הלוך־וחזור מול content-model)', () => {
  test('הלוך־וחזור מלא: deriveAtomId ← atomSourceRangeOf מחזיר את ההיסטים', () => {
    const span = makeSourceSpan('doc-1', 'body', 12, 34);
    const id = deriveAtomId(span, 3);
    const range = atomSourceRangeOf(id);
    expect(range).toEqual({ startUtf16: 12, endUtf16: 34 });
  });

  test('נטרול מפרידים: documentId המכיל | ו-% מפוענח ואינו שובר את התבנית', () => {
    const span = makeSourceSpan('a|b%c', 'footnote', 0, 7);
    const id = deriveAtomId(span);
    expect(atomSourceRangeOf(id)).toEqual({ startUtf16: 0, endUtf16: 7 });
  });

  test('זרמי צד (footnote/endnote/sidenote) מפוענחים באותו מרחב היסטים', () => {
    for (const stream of ['footnote', 'endnote', 'sidenote'] as const) {
      const id = deriveAtomId(makeSourceSpan('d', stream, 100, 205));
      expect(atomSourceRangeOf(id)).toEqual({ startUtf16: 100, endUtf16: 205 });
    }
  });

  test('מזהה זר ⇐ null (לא זריקה): קידומת שגויה, שדות חסרים, היסטים שליליים', () => {
    expect(atomSourceRangeOf('node:v1|d|body|1+2|src|0')).toBeNull();
    expect(atomSourceRangeOf('atom:v1|d|body|1+2|src')).toBeNull();
    expect(atomSourceRangeOf('atom:v1|d|body|5+2|src|0')).toBeNull(); // end < start
    expect(atomSourceRangeOf('')).toBeNull();
  });
});

// ─────────────────────────── 2. טווחים וחפיפה ───────────────────────────

describe('rangeOverlapsSpan — חצי־פתוח; סמן מרוכז נוגע בפרוסה שעליו', () => {
  test('סמיכות אינה חפיפה: [0,5) ו-[5,10) נפרדים', () => {
    expect(rangeOverlapsSpan({ startUtf16: 0, endUtf16: 5 }, { startUtf16: 5, endUtf16: 10 })).toBe(false);
    expect(rangeOverlapsSpan({ startUtf16: 0, endUtf16: 6 }, { startUtf16: 5, endUtf16: 10 })).toBe(true);
  });

  test('הכלה מלאה וחפיפה חלקית — שניהם חפיפה', () => {
    const span = { startUtf16: 10, endUtf16: 20 };
    expect(rangeOverlapsSpan({ startUtf16: 10, endUtf16: 20 }, span)).toBe(true);
    expect(rangeOverlapsSpan({ startUtf16: 0, endUtf16: 100 }, span)).toBe(true);
    expect(rangeOverlapsSpan({ startUtf16: 15, endUtf16: 16 }, span)).toBe(true);
  });

  test('סמן מרוכז (קליק בעורך): בתוך הפרוסה כן; בדיוק בסוף — לא (חצי־פתוח)', () => {
    const span = { startUtf16: 10, endUtf16: 20 };
    expect(rangeOverlapsSpan({ startUtf16: 10, endUtf16: 10 }, span)).toBe(true);
    expect(rangeOverlapsSpan({ startUtf16: 19, endUtf16: 19 }, span)).toBe(true);
    expect(rangeOverlapsSpan({ startUtf16: 20, endUtf16: 20 }, span)).toBe(false);
    expect(rangeOverlapsSpan({ startUtf16: 9, endUtf16: 9 }, span)).toBe(false);
  });

  test('פרוסה ריקה בדיוק בסמן — נוגעת (טווח ריק חוקי במודל)', () => {
    expect(rangeOverlapsSpan({ startUtf16: 7, endUtf16: 7 }, { startUtf16: 7, endUtf16: 7 })).toBe(true);
    expect(rangeOverlapsSpan({ startUtf16: 8, endUtf16: 8 }, { startUtf16: 7, endUtf16: 7 })).toBe(false);
  });
});

describe('sourceRangeOfSpans — טווח מכסה', () => {
  test('מינימום/מקסימום על פרוסות מרובות; ריק ⇐ null', () => {
    expect(sourceRangeOfSpans([{ startUtf16: 8, endUtf16: 12 }, { startUtf16: 3, endUtf16: 5 }]))
      .toEqual({ startUtf16: 3, endUtf16: 12 });
    expect(sourceRangeOfSpans([])).toBeNull();
  });

  test('פרוסות מזרמים שונים מתכנסות למרחב אחד (מינימום/מקסימום על כולן)', () => {
    const spans = [
      { stream: 'body', startUtf16: 40, endUtf16: 60 },
      { stream: 'footnote', startUtf16: 42, endUtf16: 50 },
    ];
    expect(sourceRangeOfSpans(spans)).toEqual({ startUtf16: 40, endUtf16: 60 });
  });
});

// ─────────────────────────── 3. הליכה על ה־IR ───────────────────────────

describe('linkedItemsForRange — כל הפריטים החופפים, בסדר ה־IR, עם המקור שלהם', () => {
  const ir = makeIr([
    line('l-1', 0, 30),
    { kind: 'rule', id: 'r-1' }, // פטור — אינו טקסט
    marker('m-1', 12, 20),
    line('l-2', 30, 60),
    anchor('a-1', 55, 58),
    { kind: 'ornament', id: 'o-1' }, // פטור — אינו טקסט
  ]);

  test('טווח על גבול שני קווים מחזיר את שניהם + הסמן שביניהם, בסדר ה־IR', () => {
    const refs = linkedItemsForRange(ir, { startUtf16: 18, endUtf16: 32 });
    expect(refs.map((r) => r.itemId)).toEqual(['l-1', 'm-1', 'l-2']);
    expect(refs.every((r) => r.pageId === 'p-1')).toBe(true);
  });

  test('סמן מרוכז בתוך ההערה מחזיר את הסמן ואת הקו שעליו הוא מונח בלבד', () => {
    const refs = linkedItemsForRange(ir, { startUtf16: 15, endUtf16: 15 });
    expect(refs.map((r) => r.itemId)).toEqual(['l-1', 'm-1']);
  });

  test('עוגן נמצא כשהטווח חופף לו; rule/ornament לעולם אינם חוזרים', () => {
    const refs = linkedItemsForRange(ir, { startUtf16: 50, endUtf16: 70 });
    expect(refs.map((r) => r.itemId)).toEqual(['l-2', 'a-1']);
    expect(refs.some((r) => r.itemId === 'r-1' || r.itemId === 'o-1')).toBe(false);
  });

  test('סוגי הפריטים החוזרים סגורים: line / note-marker / anchor בלבד', () => {
    const refs = linkedItemsForRange(ir, { startUtf16: 0, endUtf16: 100 });
    for (const r of refs) expect(LINKED_ITEM_KINDS).toContain(r.kind);
  });

  test('דטרמיניזם — אותו קלט ⇐ אותה רשימה בדיוק (כולל sourceRange)', () => {
    const range = { startUtf16: 10, endUtf16: 35 };
    expect(linkedItemsForRange(ir, range)).toEqual(linkedItemsForRange(ir, range));
  });
});

describe('itemSourceRange / firstAtomIdOfItem — איתור פריט ואטומו הראשון', () => {
  const ir = makeIr([
    line('l-1', 5, 25, ['atom:v1|d|body|5+10|src|0', 'atom:v1|d|body|10+25|src|1']),
    marker('m-1', 12, 20),
  ]);

  test('קו לפי מזהה ← הטווח המכסה של פרוסותיו (גם בלי pageId)', () => {
    expect(itemSourceRange(ir, 'p-1', 'l-1')).toEqual({ startUtf16: 5, endUtf16: 25 });
    expect(itemSourceRange(ir, undefined, 'l-1')).toEqual({ startUtf16: 5, endUtf16: 25 });
  });

  test('pageId שגוי או מזהה לא קיים ⇐ null (אין ניחוש)', () => {
    expect(itemSourceRange(ir, 'p-other', 'l-1')).toBeNull();
    expect(itemSourceRange(ir, undefined, 'no-such')).toBeNull();
  });

  test('האטום הראשון של קו חוזר כמו שהוא; פריט בלי אטומים ⇐ null', () => {
    expect(firstAtomIdOfItem(ir, 'l-1')).toBe('atom:v1|d|body|5+10|src|0');
    expect(firstAtomIdOfItem(ir, 'm-1')).toBeNull();
    expect(firstAtomIdOfItem(ir, 'no-such')).toBeNull();
  });
});

// ─────────────────────────── 4. שלמות provenance ───────────────────────────

describe('provenanceIssues — כל פריט טקסט חייב מקור; rule/ornament פטורים', () => {
  test('IR תקין ⇐ רשימה ריקה', () => {
    const ir = makeIr([line('l-1', 0, 10), marker('m-1', 2, 4), anchor('a-1', 5, 6), { kind: 'rule', id: 'r-1' }]);
    expect(provenanceIssues(ir)).toEqual([]);
  });

  test('קו בלי פרוסות / סמן בלי source — מדווחים עם עמוד ומזהה; הפטורים אינם', () => {
    const ir = makeIr([
      { kind: 'line', id: 'l-bad', runs: [], sourceSpans: [] },
      { kind: 'note-marker', id: 'm-bad', noteId: 'fn-1' },
      { kind: 'ornament', id: 'o-1' },
    ]);
    const issues = provenanceIssues(ir);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('p-1/l-bad');
    expect(issues[1]).toContain('p-1/m-bad');
  });
});
