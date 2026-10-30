/**
 * spans.test.ts — בדיקות גבולות ל־SourceSpan ולמזהים הממותגים (שלב 14).
 *
 * אסמכתא: אפיון §6.2 · תכנית שלב 14: "טסטים לגבולות טווחים (ריק,
 * תו בודד, חצי־פתוח)".
 */
import { describe, expect, it } from 'vitest';
import {
  CONTENT_STREAMS,
  compareSpans,
  contentStreamRank,
  isEmptySpan,
  isContentStream,
  isSourceSpan,
  makeAnchorId,
  makeAtomId,
  makeNodeId,
  makeSourceSpan,
  sameStream,
  sliceSpan,
  spanCovers,
  spanLength,
  spansOverlap,
} from '../src/spans.js';
import { ContentModelError, isRegisteredContentModelErrorKey } from '../src/errors.js';

const DOC = 'tora-canonical';

describe('SourceSpan — בנייה וגבולות', () => {
  it('פרוסה על תו בודד: חצי־פתוח [i, i+1) באורך 1', () => {
    const s = makeSourceSpan(DOC, 'body', 10, 11);
    expect(s.startUtf16).toBe(10);
    expect(s.endUtf16).toBe(11);
    expect(spanLength(s)).toBe(1);
    expect(isEmptySpan(s)).toBe(false);
  });

  it('פרוסה ריקה חוקית: [i, i) באורך 0 (עוגן נקודתי)', () => {
    const s = makeSourceSpan(DOC, 'body', 7, 7);
    expect(spanLength(s)).toBe(0);
    expect(isEmptySpan(s)).toBe(true);
  });

  it('פרוסה על סדרה: [0, 5) מכסה חמישה תווים, לא כולל את התו השישי', () => {
    const s = makeSourceSpan(DOC, 'footnote', 0, 5);
    expect(spanLength(s)).toBe(5);
    const sixth = makeSourceSpan(DOC, 'footnote', 5, 6);
    expect(spansOverlap(s, sixth)).toBe(false);
    const fifth = makeSourceSpan(DOC, 'footnote', 4, 5);
    expect(spansOverlap(s, fifth)).toBe(true);
  });

  it('כל חמשת הזרמים חוקיים וניתנים לבנייה', () => {
    for (const stream of CONTENT_STREAMS) {
      expect(isContentStream(stream)).toBe(true);
      const s = makeSourceSpan(DOC, stream, 0, 1);
      expect(s.stream).toBe(stream);
    }
  });

  it('importerPath אופציונלי; כשניתן — נשמר', () => {
    const withPath = makeSourceSpan(DOC, 'body', 0, 3, 'word/document.xml#run/2');
    expect(withPath.importerPath).toBe('word/document.xml#run/2');
    const withoutPath = makeSourceSpan(DOC, 'body', 0, 3);
    expect(withoutPath.importerPath).toBeUndefined();
  });

  it('האובייקט קפוא — אין שינוי מקור בטעות', () => {
    const s = makeSourceSpan(DOC, 'body', 0, 1) as { startUtf16: number };
    expect(() => {
      s.startUtf16 = 99;
    }).toThrow();
  });
});

describe('SourceSpan — דחיות בזמן יצירה (אכיפת קטלוג)', () => {
  it('documentId ריק נדחה עם מפתח קטלוגי', () => {
    expect(() => makeSourceSpan('', 'body', 0, 1)).toThrowError(ContentModelError);
    try {
      makeSourceSpan('', 'body', 0, 1);
      expect.unreachable();
    } catch (e) {
      const err = e as ContentModelError;
      expect(err.catalogKey).toBe('errors.span.INVALID_DOCUMENT_ID');
      expect(isRegisteredContentModelErrorKey(err.catalogKey)).toBe(true);
    }
  });

  it('stream לא חוקי נדחה', () => {
    try {
      makeSourceSpan(DOC, 'margin' as never, 0, 1);
      expect.unreachable();
    } catch (e) {
      expect((e as ContentModelError).catalogKey).toBe('errors.span.INVALID_STREAM');
    }
  });

  it('end לפני start נדחה (טווח חצי־פתוח מחייב start ≤ end)', () => {
    try {
      makeSourceSpan(DOC, 'body', 5, 4);
      expect.unreachable();
    } catch (e) {
      expect((e as ContentModelError).catalogKey).toBe('errors.span.INVALID_RANGE');
    }
  });

  it('גבול שלילי נדחה', () => {
    try {
      makeSourceSpan(DOC, 'body', -1, 0);
      expect.unreachable();
    } catch (e) {
      expect((e as ContentModelError).catalogKey).toBe('errors.span.INVALID_RANGE');
    }
  });

  it('גבול לא־שלם נדחה (1.5, NaN, Infinity)', () => {
    for (const bad of [1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      try {
        makeSourceSpan(DOC, 'body', bad, 1);
        expect.unreachable();
      } catch (e) {
        expect((e as ContentModelError).catalogKey).toBe('errors.span.NON_INTEGER_OFFSET');
      }
    }
  });

  it('importerPath ריק נדחה', () => {
    try {
      makeSourceSpan(DOC, 'body', 0, 1, '');
      expect.unreachable();
    } catch (e) {
      expect((e as ContentModelError).catalogKey).toBe('errors.span.INVALID_IMPORTER_PATH');
    }
  });
});

describe('isSourceSpan — בדיקה מבנית בלי זריקה', () => {
  it('מקבל פרוסה תקינה', () => {
    expect(isSourceSpan(makeSourceSpan(DOC, 'sidenote', 2, 9))).toBe(true);
  });

  it('דוחה ערכים פגומים', () => {
    const good = makeSourceSpan(DOC, 'body', 0, 5);
    expect(isSourceSpan(null)).toBe(false);
    expect(isSourceSpan('span')).toBe(false);
    expect(isSourceSpan({ ...good, stream: 'nope' })).toBe(false);
    expect(isSourceSpan({ ...good, endUtf16: -1 })).toBe(false);
    expect(isSourceSpan({ ...good, startUtf16: 6 })).toBe(false); // end < start
    expect(isSourceSpan({ ...good, documentId: '' })).toBe(false);
    expect(isSourceSpan({ ...good, importerPath: '' })).toBe(false);
  });
});

describe('יחסים בין פרוסות — אותו מסמך וזרם בלבד', () => {
  it('sameStream: מסמך או זרם שונה מנתקים', () => {
    const a = makeSourceSpan(DOC, 'body', 0, 10);
    expect(sameStream(a, makeSourceSpan(DOC, 'body', 5, 6))).toBe(true);
    expect(sameStream(a, makeSourceSpan(DOC, 'footnote', 5, 6))).toBe(false);
    expect(sameStream(a, makeSourceSpan('other-doc', 'body', 5, 6))).toBe(false);
  });

  it('spanCovers: הכלה חצי־פתוחה, כולל פרוסה ריקה בגבול', () => {
    const big = makeSourceSpan(DOC, 'body', 10, 20);
    expect(spanCovers(big, makeSourceSpan(DOC, 'body', 10, 20))).toBe(true); // שווה
    expect(spanCovers(big, makeSourceSpan(DOC, 'body', 12, 18))).toBe(true); // פנימי
    expect(spanCovers(big, makeSourceSpan(DOC, 'body', 10, 21))).toBe(false); // חורג בסוף
    expect(spanCovers(big, makeSourceSpan(DOC, 'body', 9, 11))).toBe(false); // חורג בהתחלה
    expect(spanCovers(big, makeSourceSpan(DOC, 'body', 20, 20))).toBe(true); // ריקה בגבול
    expect(spanCovers(big, makeSourceSpan(DOC, 'footnote', 12, 18))).toBe(false); // זרם אחר
  });

  it('spansOverlap: ריקה אינה חופפת כלום, גם לא את עצמה', () => {
    const empty = makeSourceSpan(DOC, 'body', 5, 5);
    expect(spansOverlap(empty, empty)).toBe(false);
    expect(spansOverlap(empty, makeSourceSpan(DOC, 'body', 5, 6))).toBe(false);
    expect(spansOverlap(makeSourceSpan(DOC, 'body', 4, 5), makeSourceSpan(DOC, 'body', 5, 6))).toBe(false); // נוגעים, לא חופפים
    expect(spansOverlap(makeSourceSpan(DOC, 'body', 4, 6), makeSourceSpan(DOC, 'body', 5, 7))).toBe(true);
  });
});

describe('compareSpans — סדר קנוני דטרמיניסטי', () => {
  it('מסמך ← זרם ← התחלה ← סוף', () => {
    const body = makeSourceSpan(DOC, 'body', 5, 8);
    const footnote = makeSourceSpan(DOC, 'footnote', 0, 3);
    const otherDoc = makeSourceSpan('aaa-doc', 'metadata', 0, 1);
    const earlier = makeSourceSpan(DOC, 'body', 1, 2);
    expect(compareSpans(body, footnote)).toBeLessThan(0);
    expect(compareSpans(footnote, otherDoc)).toBeGreaterThan(0);
    expect(compareSpans(body, earlier)).toBeGreaterThan(0);
    expect(compareSpans(body, body)).toBe(0);
    expect(contentStreamRank('body')).toBeLessThan(contentStreamRank('footnote'));
  });
});

describe('sliceSpan — תת־פרוסות לפרסר', () => {
  it('פרוסה מוחלפת בהיסט יחסי; המקור נשמר', () => {
    const parent = makeSourceSpan(DOC, 'endnote', 100, 110, 'src.xml#p/3');
    const child = sliceSpan(parent, 2, 5);
    expect(child.startUtf16).toBe(102);
    expect(child.endUtf16).toBe(105);
    expect(child.stream).toBe('endnote');
    expect(child.documentId).toBe(DOC);
    expect(child.importerPath).toBe('src.xml#p/3');
    expect(spanCovers(parent, child)).toBe(true);
  });

  it('תת־פרוסה ריקה חוקית', () => {
    const parent = makeSourceSpan(DOC, 'body', 4, 8);
    expect(isEmptySpan(sliceSpan(parent, 3, 3))).toBe(true);
  });

  it('חריגה מגבולות האב נדחית', () => {
    const parent = makeSourceSpan(DOC, 'body', 4, 8); // אורך 4
    for (const [from, to] of [
      [-1, 2],
      [0, 5],
      [3, 2],
      [1.5, 2],
    ] as const) {
      try {
        sliceSpan(parent, from, to);
        expect.unreachable();
      } catch (e) {
        expect((e as ContentModelError).catalogKey).toBe('errors.span.SLICE_OUT_OF_RANGE');
      }
    }
  });
});

describe('מזהים ממותגים', () => {
  it('הבנאים מחזירים את הערך; המיתוג נאכף בזמן קימפול בלבד', () => {
    expect(makeNodeId('blk-1')).toBe('blk-1');
    expect(makeAtomId('atom-9')).toBe('atom-9');
    expect(makeAnchorId('anc-2')).toBe('anc-2');
  });

  it('ערכים פסולים נדחים עם מפתח קטלוגי', () => {
    for (const bad of ['', '   ', ' x', 'x ', 'a\u0001b']) {
      try {
        makeNodeId(bad);
        expect.unreachable();
      } catch (e) {
        expect((e as ContentModelError).catalogKey).toBe('errors.span.INVALID_ID');
      }
    }
  });

  it('מזהה בן 512 תווים חוקי; 513 נדחה', () => {
    expect(makeAtomId('a'.repeat(512))).toBe('a'.repeat(512));
    expect(() => makeAtomId('a'.repeat(513))).toThrowError(ContentModelError);
  });
});
