import { describe, it, expect } from 'vitest';
import { parseHeading } from '../../../src/parser/header-parser';
import { findMatchingCloseBracket } from '../../../src/parser/nested-bracket-matcher';
import { parseFootnotes } from '../../../src/parser/footnote-parser';
import { parseEndnotes } from '../../../src/parser/endnote-parser';
import { parseSidenotes } from '../../../src/parser/sidenote-parser';
import { parseEditorialNotes } from '../../../src/parser/editorial-note-parser';
import { parseMetadata } from '../../../src/parser/metadata-parser';

describe('header-parser', () => {
  it('מבנה 1: כותרת N - טקסט', () => {
    expect(parseHeading('כותרת 2 - הקדמה')).toEqual({
      level: 2, simanNumber: undefined, subNumber: undefined, text: 'הקדמה',
    });
  });

  it('מבנה 2: כותרת N מספר X - טקסט', () => {
    expect(parseHeading('כותרת 7 מספר 401 - שלושה נושאים')).toEqual({
      level: 7, simanNumber: 401, subNumber: undefined, text: 'שלושה נושאים',
    });
  });

  it('מבנה 3: כותרת N מספר X (Y) - טקסט', () => {
    expect(parseHeading('כותרת 1 מספר 1 (1) - הקדמות')).toEqual({
      level: 1, simanNumber: 1, subNumber: 1, text: 'הקדמות',
    });
  });

  it('תומך במקף רגיל, קו מתח, קו ארוך', () => {
    expect(parseHeading('כותרת 2 - test')?.level).toBe(2);
    expect(parseHeading('כותרת 2 – test')?.level).toBe(2);
    expect(parseHeading('כותרת 2 — test')?.level).toBe(2);
  });

  it('שורה בלי מקף אינה כותרת', () => {
    expect(parseHeading('כותרת 3 טקסט בלי מקף')).toBeNull();
  });

  it('שורה רגילה אינה כותרת', () => {
    expect(parseHeading('זוהי פסקה רגילה')).toBeNull();
  });

  it('רמה 0', () => {
    expect(parseHeading('כותרת 0 - הקדמה')?.level).toBe(0);
  });

  it('רמה 7', () => {
    expect(parseHeading('כותרת 7 - הערת צד')?.level).toBe(7);
  });

  it('רמה 8 אינה נחשבת', () => {
    expect(parseHeading('כותרת 8 - test')).toBeNull();
  });

  it('עם רווחים מקדימים', () => {
    expect(parseHeading('  כותרת 2 - test  ')?.level).toBe(2);
  });
});

describe('nested-bracket-matcher', () => {
  it('סוגר פשוט', () => {
    expect(findMatchingCloseBracket('[hello]', 0, '[', ']')).toBe(6);
  });

  it('מקונן', () => {
    expect(findMatchingCloseBracket('[outer [inner] still]', 0, '[', ']')).toBe(21);
  });

  it('מקונן עמוק', () => {
    expect(findMatchingCloseBracket('[a [b [c] d] e]', 0, '[', ']')).toBe(15);
  });

  it('אין סוגר סוגר', () => {
    expect(findMatchingCloseBracket('[hello', 0, '[', ']')).toBe(-1);
  });

  it('סוגרים שונים', () => {
    expect(findMatchingCloseBracket('(test)', 0, '(', ')')).toBe(5);
  });
});

describe('footnote-parser', () => {
  it('פירסור הערת שוליים פשוטה', () => {
    const { text, footnotes } = parseFootnotes('טקסט [הערה] עוד');
    expect(footnotes).toHaveLength(1);
    expect(footnotes[0]!.text).toBe('הערה');
    expect(text).toContain('\u0001FN:');
  });

  it('מקוננים', () => {
    const { text, footnotes } = parseFootnotes('[ראה [פנימי] חיצוני]');
    expect(footnotes).toHaveLength(1);
    expect(footnotes[0]!.text).toBe('ראה [פנימי] חיצוני');
  });

  it('מספר הערות', () => {
    const { footnotes } = parseFootnotes('[א] [ב] [ג]');
    expect(footnotes).toHaveLength(3);
    expect(footnotes[0]!.text).toBe('א');
    expect(footnotes[2]!.text).toBe('ג');
  });

  it('סוגר פתוח ללא סגירה', () => {
    const { text, footnotes } = parseFootnotes('טקסט [ללא סגירה');
    expect(footnotes).toHaveLength(0);
    expect(text).toBe('טקסט [ללא סגירה');
  });
});

describe('endnote-parser', () => {
  it('זיהוי הערת סיום', () => {
    const { lines, endnotes } = parseEndnotes(['טקסט', 'הערת סיום - זוהי הערה', 'עוד טקסט']);
    expect(endnotes).toHaveLength(1);
    expect(endnotes[0]!.text).toBe('זוהי הערה');
  });

  it('קידומת מותאמת', () => {
    const { endnotes } = parseEndnotes(['הערה מותאמת - טקסט'], 'הערה מותאמת -');
    expect(endnotes).toHaveLength(1);
    expect(endnotes[0]!.text).toBe('טקסט');
  });
});

describe('sidenote-parser', () => {
  it('זיהוי H7 כהערת צד', () => {
    const { lines, sidenotes } = parseSidenotes(['כותרת 7 - הערה', 'פסקה רגילה']);
    expect(sidenotes).toHaveLength(1);
    expect(sidenotes[0]!.text).toBe('הערה');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('פסקה רגילה');
  });

  it('H6 אינה הערת צד', () => {
    const { sidenotes } = parseSidenotes(['כותרת 6 - לא צד']);
    expect(sidenotes).toHaveLength(0);
  });
});

describe('editorial-note-parser', () => {
  it('מסיר ##text##', () => {
    const result = parseEditorialNotes(['טקסט ##לבדוק## רגיל']);
    expect(result).toEqual(['טקסט  רגיל']);
  });

  it('מסיר מספר הערות', () => {
    const result = parseEditorialNotes(['##אחד## טקסט ##שני##']);
    expect(result).toEqual(['  טקסט ']);
  });
});

describe('metadata-parser', () => {
  it('מזהה שם הספר', () => {
    const { metadata, lines } = parseMetadata(['שם הספר - מקום בינה', 'כותרת 1 - חלק']);
    expect(metadata.bookName).toBe('מקום בינה');
    expect(lines[0]).toBe('כותרת 1 - חלק');
  });

  it('מזהה מחבר', () => {
    const { metadata } = parseMetadata(['שם המחבר - נתנאל', 'כותרת 1 - x']);
    expect(metadata.authorName).toBe('נתנאל');
  });

  it('מזהה מספר שדות', () => {
    const lines = [
      'שם הספר - ספר', 'נושא - נושא', 'שם המחבר - מחבר',
      'מקום ושנת הוצאה - ירושלים', 'שמירת זכויות - הפקר',
      '', 'כותרת 1 - התחלה',
    ];
    const { metadata, lines: remaining } = parseMetadata(lines);
    expect(metadata.bookName).toBe('ספר');
    expect(metadata.subject).toBe('נושא');
    expect(metadata.authorName).toBe('מחבר');
    expect(metadata.placeAndYear).toBe('ירושלים');
    expect(metadata.copyright).toBe('הפקר');
    expect(remaining[0]).toBe('כותרת 1 - התחלה');
  });

  it('שדה לא מזוהה אינו נכנס', () => {
    const { metadata } = parseMetadata(['שדה לא מזוהה - ערך', 'כותרת 1 - x']);
    expect(Object.keys(metadata)).toHaveLength(0);
  });
});
