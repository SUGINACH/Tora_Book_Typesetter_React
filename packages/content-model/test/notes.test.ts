/**
 * notes.test.ts — בדיקות זרמי הערות ומספורן טרם העימוד (שלב 20).
 *
 * אסמכתא: אפיון §10.3 ("numbering/reset נקבע לפני הרינדור ונשמר כ־resolved
 * label") · תכנית שלב 20: "הערות מקוננות/מרובות לאותו עוגן, סדר מסמך,
 * התחלה מחדש לפי scope" · "אין מספור בתוך renderer; אין הערה יתומה בשקט".
 *
 * וקטורי הגימטריא מועברים מבדיקות הישן (tests/unit/lib/gematria.test.ts)
 * ומורחבים; parity מלא מול הקוד הישן (1..3000) — במאמת השלב.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NOTE_NUMBERING_POLICY,
  NOTE_LABEL_FORMATS,
  NOTE_NUMBERING_SCOPES,
  collectNoteReferences,
  formatNoteLabel,
  numberNotes,
  toGematriaLabel,
} from '../src/notes.js';
import { parseSourceText } from '../src/parser/parse.js';
import { isRegisteredContentModelErrorKey } from '../src/errors.js';
import type { TorahDocument } from '../src/document.js';

const DOC = 'notes-test';

/** מסמך לבדיקות היקף: שני חלקים, שלושה סימנים, ארבע הערות שוליים. */
const SCOPE_RAW = [
  'כותרת 1 - חלק ראשון',
  'כותרת 2 - סימן א',
  'טקסט ראשון עם [הערה אחת] בפנים',
  'כותרת 2 - סימן ב',
  'טקסט שני עם [הערה שנייה] וגם [הערה שלישית]',
  'כותרת 1 - חלק שני',
  'כותרת 2 - סימן ג',
  'טקסם שלישי עם [הערה רביעית]',
].join('\n');

function parseScopeDoc(): TorahDocument {
  return parseSourceText(SCOPE_RAW, { documentId: DOC }).doc;
}

describe('toGematriaLabel — פורט נאמן של הישן', () => {
  it('וקטורי הבדיקה של הישן (tests/unit/lib/gematria.test.ts) — מועברים כמו שהם', () => {
    expect(toGematriaLabel(1)).toBe('א');
    expect(toGematriaLabel(9)).toBe('ט');
    expect(toGematriaLabel(10)).toBe('י');
    expect(toGematriaLabel(15)).toBe('ט״ו');
    expect(toGematriaLabel(16)).toBe('ט״ז');
    expect(toGematriaLabel(100)).toBe('ק');
    expect(toGematriaLabel(400)).toBe('ת');
    expect(toGematriaLabel(11)).toBe('י״א');
    expect(toGematriaLabel(123)).toBe('קכ״ג');
  });

  it('התנהגות הישן מעל 400 ומעל 1000 — כולל 1000 = תת״ר (הקוד, לא ההערה)', () => {
    expect(toGematriaLabel(0)).toBe('');
    expect(toGematriaLabel(401)).toBe('ת״א');
    expect(toGematriaLabel(1000)).toBe('תת״ר'); // הקוד הישן אינו נכנס למסלול האלפים ב־1000 בדיוק
    expect(toGematriaLabel(1001)).toBe('א׳א');
    expect(toGematriaLabel(2000)).toBe('ב׳');
    expect(toGematriaLabel(2744)).toBe('ב׳תשמ״ד');
  });

  it('formatNoteLabel — numeric ו־gematria; דחיית סידורי לא-חוקיים', () => {
    expect(formatNoteLabel(7, 'numeric')).toBe('7');
    expect(formatNoteLabel(7, 'gematria')).toBe('ז');
    expect(() => formatNoteLabel(0, 'numeric')).toThrowError(
      expect.objectContaining({ catalogKey: 'errors.notes.INVALID_ORDINAL' }),
    );
    expect(isRegisteredContentModelErrorKey('errors.notes.INVALID_ORDINAL')).toBe(true);
  });
});

describe('numberNotes — סדר מסמך והיקפים', () => {
  it('continuous — סדר לפי מיקום ההפניה, תוויות גימטריא רציפות', () => {
    const doc = parseScopeDoc();
    const result = numberNotes(doc, { scope: 'continuous', labelFormat: 'gematria', streams: ['footnote'] });
    expect(result.assignments.size).toBe(4);
    const labels = [...result.assignments.values()].map((a) => a.label);
    expect(labels).toEqual(['א', 'ב', 'ג', 'ד']);
    expect(result.scopeCounts).toEqual([{ scopeKey: 'doc', count: 4 }]);
    expect(result.orphanNoteIds).toEqual([]);
    // סדר המסמך — לפי מיקום עוגן עולה
    const starts = [...result.assignments.values()].map((a) => a.anchorStart);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
    // העוגן ההדדי: מיקום ההפניה הראשונה שמור בכל הצבה
    for (const a of result.assignments.values()) {
      expect(a.referenceCount).toBe(1);
      expect(typeof a.anchorStart).toBe('number');
    }
  });

  it('part — איפוס בכל חלק', () => {
    const doc = parseScopeDoc();
    const result = numberNotes(doc, { scope: 'part', labelFormat: 'numeric', streams: ['footnote'] });
    const byId = new Map(result.assignments);
    expect(byId.get('fn-1')?.ordinal).toBe(1);
    expect(byId.get('fn-2')?.ordinal).toBe(2);
    expect(byId.get('fn-3')?.ordinal).toBe(3);
    expect(byId.get('fn-4')?.ordinal).toBe(1); // חלק שני — איפוס
    expect(byId.get('fn-4')?.scopeKey).toBe('part:1');
    expect(result.scopeCounts.map((s) => s.count)).toEqual([3, 1]);
  });

  it('siman — איפוס בכל סימן', () => {
    const doc = parseScopeDoc();
    const result = numberNotes(doc, { scope: 'siman', labelFormat: 'numeric', streams: ['footnote'] });
    const byId = new Map(result.assignments);
    expect(byId.get('fn-1')?.scopeKey).toBe('siman:0:0');
    expect(byId.get('fn-2')?.scopeKey).toBe('siman:0:1');
    expect(byId.get('fn-3')?.scopeKey).toBe('siman:0:1');
    expect(byId.get('fn-3')?.ordinal).toBe(2);
    expect(byId.get('fn-4')?.scopeKey).toBe('siman:1:0');
    expect(byId.get('fn-4')?.ordinal).toBe(1);
    expect(result.scopeCounts.length).toBe(3);
  });

  it('page — נפתר רק עם הקשר עמודים מפורש; בלי הקשר — שגיאה מקוטלגת, לא ניחוש', () => {
    const doc = parseScopeDoc();
    expect(() => numberNotes(doc, { scope: 'page', labelFormat: 'numeric', streams: ['footnote'] })).toThrowError(
      expect.objectContaining({ catalogKey: 'errors.notes.PAGE_SCOPE_REQUIRES_CONTEXT' }),
    );
    expect(isRegisteredContentModelErrorKey('errors.notes.PAGE_SCOPE_REQUIRES_CONTEXT')).toBe(true);
    // הקשר סינתטי: עמוד = פרוסה של 60 תווים — איפוס בכל מעבר עמוד
    const ctx = { pageOfAnchor: (pos: number) => Math.floor(pos / 60) };
    const result = numberNotes(doc, { scope: 'page', labelFormat: 'numeric', streams: ['footnote'] }, ctx);
    expect(result.assignments.size).toBe(4);
    expect(result.scopeCounts.length).toBeGreaterThan(1); // כמה עמודים — כמה איפוסים
    // מספר עולה בתוך עמוד, מתאפס בין עמודים
    let prevPage = '';
    let prevOrdinal = 0;
    for (const a of result.assignments.values()) {
      if (a.scopeKey !== prevPage) { prevPage = a.scopeKey; prevOrdinal = 0; }
      expect(a.ordinal).toBe(prevOrdinal + 1);
      prevOrdinal = a.ordinal;
    }
  });

  it('ברירת המחדל — page+גימטריא+שוליים/סיום, כמו הישן (אך לפני הרינדור)', () => {
    expect(DEFAULT_NOTE_NUMBERING_POLICY.scope).toBe('page');
    expect(DEFAULT_NOTE_NUMBERING_POLICY.labelFormat).toBe('gematria');
    expect([...DEFAULT_NOTE_NUMBERING_POLICY.streams]).toEqual(['footnote', 'endnote']);
    expect([...NOTE_NUMBERING_SCOPES]).toEqual(['page', 'siman', 'part', 'continuous']);
    expect([...NOTE_LABEL_FORMATS]).toEqual(['numeric', 'gematria']);
  });
});

describe('numberNotes — עוגן, יתומות והפניות מרובות', () => {
  it('הערה יתומה (בלי הפניה) — מדווחת, לא ממוספרת בשקט', () => {
    const raw = 'כותרת 2 x\n\nטקסט עם [הערה רגילה] וממשיך';
    const result = parseSourceText(raw, { documentId: DOC });
    expect(result.doc.notes.footnotes.length).toBe(1);
    // זיוף: הסרת ההפניה מהגוף — יוצר יתומה (כמו ייבוא עתידי פגום)
    const doc = structuredClone(result.doc) as TorahDocument;
    for (const part of doc.parts) {
      for (const siman of part.simanim) {
        for (const block of siman.blocks) {
          (block as { inline: unknown[] }).inline = block.inline.filter((i) => i.kind !== 'note-reference');
        }
      }
    }
    const numbered = numberNotes(doc, { scope: 'continuous', labelFormat: 'numeric', streams: ['footnote'] });
    expect(numbered.orphanNoteIds).toEqual(['fn-1']);
    expect(numbered.assignments.size).toBe(0); // לא ממוספרת בשקט
  });

  it('הערה עם שתי הפניות — ממוספרת לפי הראשונה ומדווחת', () => {
    const raw = 'כותרת 2 x\n\nראשון [א] שני [ב] שלישי';
    const result = parseSourceText(raw, { documentId: DOC });
    const doc = structuredClone(result.doc) as TorahDocument;
    // שכפול ההפניה הראשונה — שתי הפניות לאותה הערה
    outer: for (const part of doc.parts) {
      for (const siman of part.simanim) {
        for (const block of siman.blocks) {
          const items = block.inline as unknown[];
          for (let i = 0; i < items.length; i = i + 1) {
            const item = items[i] as { kind: string; noteId: string };
            if (item.kind === 'note-reference' && item.noteId === 'fn-1') {
              items.splice(i + 1, 0, structuredClone(item));
              break outer;
            }
          }
        }
      }
    }
    const numbered = numberNotes(doc, { scope: 'continuous', labelFormat: 'numeric', streams: ['footnote'] });
    expect(numbered.multiReferencedNoteIds).toEqual(['fn-1']);
    const a = numbered.assignments.get('fn-1');
    expect(a?.referenceCount).toBe(2);
    expect(a?.ordinal).toBe(1); // לפי ההפניה הראשונה
    expect(numbered.assignments.get('fn-2')?.ordinal).toBe(2);
  });

  it('הערות צד (H7) — לא ממוספרות כברירת מחדל אך בסדר המסמך עם עוגן', () => {
    const raw = [
      'כותרת 1 - חלק',
      'כותרת 7 - הערת צד',
      'פסקה עם [הערת שוליים] מוצמדת',
    ].join('\n');
    const result = parseSourceText(raw, { documentId: DOC });
    expect(result.doc.notes.sidenotes.length).toBe(1);
    const numbered = numberNotes(result.doc, { scope: 'continuous', labelFormat: 'numeric', streams: ['footnote'] });
    expect(numbered.assignments.has('sn-1')).toBe(false); // לא בזרמים הממוספרים
    expect(numbered.documentOrder).toContain('sn-1'); // אבל בסדר המסמך — עוגן ל־FIFO (§10.3)
    expect(numbered.orphanNoteIds).toEqual([]); // יש לה הפניה (בלוק הסמן)
    // כשממספרים גם צד — היא מקבלת מספר לפי מיקומה
    const withSide = numberNotes(result.doc, { scope: 'continuous', labelFormat: 'numeric', streams: ['footnote', 'sidenote'] });
    expect(withSide.assignments.has('sn-1')).toBe(true);
  });

  it('הערות עורך — אינן מודפסות ואינן נספרות כיתומות (ההסרה נרשמת בספר)', () => {
    const raw = 'כותרת 2 x\n\nלפני ## הערת עורך להסרה ## אחרי';
    const result = parseSourceText(raw, { documentId: DOC });
    expect(result.doc.notes.editorial.length).toBe(1);
    const numbered = numberNotes(result.doc, { scope: 'continuous', labelFormat: 'numeric', streams: ['footnote', 'endnote'] });
    expect(numbered.orphanNoteIds).toEqual([]); // editorial אינה נספרת כיתומה
    expect(numbered.assignments.size).toBe(0);
  });

  it('מדיניות שגויה — שגיאות מקוטלגות', () => {
    const doc = parseScopeDoc();
    expect(() => numberNotes(doc, { scope: 'chapter' as never, labelFormat: 'numeric', streams: ['footnote'] })).toThrowError(
      expect.objectContaining({ catalogKey: 'errors.notes.INVALID_POLICY' }),
    );
    expect(() => numberNotes(doc, { scope: 'continuous', labelFormat: 'roman' as never, streams: ['footnote'] })).toThrowError(
      expect.objectContaining({ catalogKey: 'errors.notes.INVALID_POLICY' }),
    );
    expect(() => numberNotes(doc, { scope: 'continuous', labelFormat: 'numeric', streams: [] as never })).toThrowError();
    expect(() => numberNotes(doc, { scope: 'continuous', labelFormat: 'numeric', streams: ['footnote', 'footnote'] as never })).toThrowError();
    expect(isRegisteredContentModelErrorKey('errors.notes.INVALID_POLICY')).toBe(true);
  });

  it('דטרמיניזם — אותו מסמך ומדיניות ← אותו פתרון; collectNoteReferences עקבי', () => {
    const doc = parseScopeDoc();
    const r1 = numberNotes(doc, { scope: 'siman', labelFormat: 'gematria', streams: ['footnote', 'endnote'] });
    const r2 = numberNotes(doc, { scope: 'siman', labelFormat: 'gematria', streams: ['footnote', 'endnote'] });
    expect(r1).toEqual(r2);
    const refs = collectNoteReferences(doc);
    expect(refs.size).toBe(4);
    for (const info of refs.values()) {
      expect(info.count).toBe(1);
      expect(info.firstStart).toBeGreaterThanOrEqual(0);
    }
  });
});
