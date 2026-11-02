/**
 * endnotes.test.ts — בדיקות שלב 55: הערות סיום כזרם מדוד ומשוב לנקודת השבת
 * (אפיון §10.3 Endnotes, §11.1; פרק ז/M6).
 *
 * מה מוכח כאן:
 *   1. **זרם מדוד**: ההערות מוצבות על עמודי notes במילוי טור בודד,
 *      רציף ודטרמיניסטי; אטומיות — הערה עוברת בשלמותה לעמוד הבא.
 *   2. **קישורים הדדיים**: כל הצבה נושאת את עוגן הגוף (בלוק+קו);
 *      anchorReport ממפה noteId → עמוד פיזי ראשון.
 *   3. **endnote ארוך**: פיצול על פני עמודים עם המשך קנוני (‎#cont‎),
 *      רישום split=true (הצרכן מעביר LONG_NOTE_SPLIT לפנקס); העוגן
 *      נשמר גם בהמשכים; בלי פיצול — כשל מפורש כשארוכה מעמוד ריק.
 *   4. **משוב לנקודת השבת** (§11.1): שינוי במספר עמודי הגוף מזיז את
 *      כל המיפוי ומשנה mappingHash — אות האיטרציה; אותו קלט ⇐ אותו hash.
 *   5. **אין endnote יתום**: כל ערך מוקם (לפחות הצבה אחת לכל noteId);
 *      אין ערכים כפולים; קלט פסול ⇒ דחייה מקוטלגת.
 *   6. **מספור**: סודר 1..N לפי סדר המקור, נישא בכל הצבה.
 */
import { describe, expect, test } from 'vitest';
import { asLu } from '@tora/layout-api';
import { LayoutEngineError } from '../src/errors.js';
import { buildPageTemplateSet, type TemplateSetInput } from '../src/pagination/templates.js';
import { makeNoteBodySpec } from '../src/pagination/notes.js';
import { endnoteEntryIssues, layoutEndnoteFlow, type EndnoteEntry } from '../src/pagination/endnotes.js';

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
const pageBudget = templates.for('notes', 1).regions.find((r) => r.role === 'body-column')!.rect.height;

function entry(noteId: string, lineHeights: readonly number[], blockId = 'body|1', lineId = 'line-x'): EndnoteEntry {
  return {
    noteId,
    body: makeNoteBodySpec(noteId, lineHeights),
    anchor: { blockId, lineId },
  };
}

describe('שלב 55 — הערות סיום כזרם מדוד ומשוב לנקודת השבת (§10.3; §11.1)', () => {
  test('אימות ערך: שדות חובה; כפילות noteId ⇒ דחייה מקוטלגת', () => {
    expect(endnoteEntryIssues(entry('n1', [100]))).toEqual([]);
    expect(endnoteEntryIssues({ noteId: '', body: makeNoteBodySpec('x', [1]), anchor: { blockId: 'b', lineId: 'l' } })).toContain('noteId');
    expect(endnoteEntryIssues({ noteId: 'n', body: makeNoteBodySpec('x', [1]), anchor: { blockId: '', lineId: 'l' } })).toContain('anchor');
    const dup = [entry('n1', [100]), entry('n1', [100])];
    expect(() => layoutEndnoteFlow(dup, templates, { bodyPageCount: 5 })).toThrow(LayoutEngineError);
    expect(() => layoutEndnoteFlow([entry('n1', [100])], templates, { bodyPageCount: -1 })).toThrow(LayoutEngineError);
  });

  test('זרם מדוד: מילוי רציף; אטומיות — הערה עוברת בשלמותה לעמוד הבא', () => {
    const unit = Math.floor(pageBudget / 4);
    const entries = [
      entry('n1', [unit, unit]),
      entry('n2', [unit, unit]), // n1+n2 ממלאות עמוד בדיוק
      entry('n3', [unit, unit]), // נדחקת בשלמותה לעמוד הבא (אין יתומות/פיצול)
      entry('n4', [unit]),
    ];
    const res = layoutEndnoteFlow(entries, templates, { bodyPageCount: 10 });
    expect(res.pages).toBe(2);
    expect(res.firstPhysicalPage).toBe(11);
    // n1,n2 בעמוד הפיזי 11; n3,n4 ב-12
    expect(res.anchorReport['n1']).toBe(11);
    expect(res.anchorReport['n2']).toBe(11);
    expect(res.anchorReport['n3']).toBe(12);
    expect(res.anchorReport['n4']).toBe(12);
    // כל הצבה אטומית (לא נפרשה) ונושאת את מלוא הקווים
    expect(res.placements.every((p) => p.split === false)).toBe(true);
    expect(res.splits).toBe(0);
    // אין יתומות: לכל noteId הצבה אחת לפחות
    for (const e of entries) {
      expect(res.placements.some((p) => p.noteId === e.noteId || (p.continuationOf === e.noteId))).toBe(true);
    }
  });

  test('קישורים הדדיים: כל הצבה נושאת את עוגן הגוף; מיפוי noteId → עמוד', () => {
    const entries = [
      entry('n1', [1000], 'body|3', 'line-7'),
      entry('n2', [1000], 'body|8', 'line-2'),
    ];
    const res = layoutEndnoteFlow(entries, templates, { bodyPageCount: 4 });
    expect(res.placements[0]!.anchor).toEqual({ blockId: 'body|3', lineId: 'line-7' });
    expect(res.placements[1]!.anchor).toEqual({ blockId: 'body|8', lineId: 'line-2' });
    expect(res.anchorReport['n1']).toBe(5);
    expect(res.anchorReport['n2']).toBe(5);
    // מספור: סודר לפי סדר המקור
    expect(res.placements.map((p) => p.ordinal)).toEqual([1, 2]);
  });

  test('endnote ארוך: פיצול על פני עמודים עם המשך #cont; העוגן נשמר בהמשכים', () => {
    // הערה של 2.5 עמודים בקווים של 1/8 עמוד — נפרשת על 3 עמודים
    const unit = Math.floor(pageBudget / 8);
    const entries = [entry('n1', Array.from({ length: 20 }, () => unit), 'body|1', 'line-1')];
    const res = layoutEndnoteFlow(entries, templates, { bodyPageCount: 2, notePolicy: { allowLongNoteSplit: true } });
    expect(res.pages).toBe(3);
    expect(res.splits).toBe(2);
    // הראשונה בעמוד הפיזי 3; ההמשכים ב-4, 5 — כולם נושאים את אותו עוגן
    expect(res.placements.length).toBe(3);
    expect(res.placements[0]!.noteId).toBe('n1');
    expect(res.placements[0]!.split).toBe(true);
    expect(res.placements[1]!.noteId).toBe('n1#cont');
    expect(res.placements[1]!.continuationOf).toBe('n1');
    expect(res.placements[2]!.noteId).toBe('n1#cont#cont');
    for (const p of res.placements) {
      expect(p.anchor).toEqual({ blockId: 'body|1', lineId: 'line-1' });
      expect(p.ordinal).toBe(1);
    }
    // העוגן ממופה לעמוד הראשון של ההערה
    expect(res.anchorReport['n1']).toBe(3);
    // אין יתום: סכום הקווים שהוצבו = 20
    expect(res.placements.reduce((n, p) => n + p.linesPlaced, 0)).toBe(20);
  });

  test('ארוכה מעמוד ריק בלי פיצול ⇒ כשל מפורש (ADR-005 בהטלה)', () => {
    // שורה בודדת גבוהה מעמוד — בלתי-ניתנת לפיצול (פיצול בגבולות קווים
    // בלבד) ⇒ כשל מפורש גם עם דגל הפיצול — לולאת הדחייה נחסמה (§8.2)
    const singleLine = [entry('n1', [pageBudget + 10000])];
    expect(() => layoutEndnoteFlow(singleLine, templates, { bodyPageCount: 1 })).toThrow(LayoutEngineError);
    expect(() => layoutEndnoteFlow(singleLine, templates, { bodyPageCount: 1, notePolicy: { allowLongNoteSplit: true } })).toThrow(LayoutEngineError);
    // ריבוי שורות שסכומן עולה על עמוד — בלי פיצול כשל; עם פיצול נפרשת
    const unit = Math.floor(pageBudget / 3);
    const multi = [entry('n1', [unit, unit, unit, unit])]; // 4/3 עמוד
    expect(() => layoutEndnoteFlow(multi, templates, { bodyPageCount: 1 })).toThrow(LayoutEngineError);
    const res = layoutEndnoteFlow(multi, templates, { bodyPageCount: 1, notePolicy: { allowLongNoteSplit: true } });
    expect(res.splits).toBe(1);
    expect(res.placements.length).toBe(2);
    expect(res.placements[1]!.noteId).toBe('n1#cont');
  });

  test('משוב לנקודת השבת: שינוי עמודי גוף משנה mappingHash; קלט זהה ⇐ hash זהה', () => {
    const entries = [entry('n1', [1000, 1000]), entry('n2', [1000])];
    const r10 = layoutEndnoteFlow(entries, templates, { bodyPageCount: 10 });
    const r10again = layoutEndnoteFlow(entries, templates, { bodyPageCount: 10 });
    const r11 = layoutEndnoteFlow(entries, templates, { bodyPageCount: 11 });
    // דטרמיניזם: אותו קלט ⇐ אותו hash (אות היציבות של ה-fixed-point)
    expect(r10.mappingHash).toBe(r10again.mappingHash);
    // הזזת הגוף מזיזה את המיפוי ומשנה את החתימה — האות לאיטרציה נוספת (§11.1)
    expect(r11.mappingHash).not.toBe(r10.mappingHash);
    expect(r11.anchorReport['n1']).toBe(r10.anchorReport['n1']! + 1);
    // גם שינוי בפריסת הזרם (הערה נוספת) משנה את החתימה
    const rMore = layoutEndnoteFlow([...entries, entry('n3', [1000])], templates, { bodyPageCount: 10 });
    expect(rMore.mappingHash).not.toBe(r10.mappingHash);
  });

  test('זרם ריק ⇒ עמוד אחד ריק; דטרמיניזם מלא (5 ריצות)', () => {
    const empty = layoutEndnoteFlow([], templates, { bodyPageCount: 7 });
    expect(empty.pages).toBe(1);
    expect(empty.placements).toEqual([]);
    expect(empty.anchorReport).toEqual({});
    const entries = [
      entry('n1', [500, 700]),
      entry('n2', [300]),
      entry('n3', [900, 100, 200]),
    ];
    const once = () => JSON.stringify(layoutEndnoteFlow(entries, templates, { bodyPageCount: 3 }));
    expect(new Set(Array.from({ length: 5 }, once)).size).toBe(1);
  });
});
