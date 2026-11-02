/**
 * parser.test.ts — בדיקות יחידה לפרסר של שלב 17 (פורט הפרסר הישן).
 *
 * אסמכתא: אפיון §3.3, §6.2, §7 · תכנית שלב 17 · מרשם המזהים
 * (docs/migration/identifiers.json). בדיקות דיפרנציאליות מלאות מול
 * הפרסר הישן המוחזק — במאמת scripts/migration/verify-parser.mjs.
 */
import { describe, expect, it } from 'vitest';
import { parseSourceText } from '../src/parser/parse.js';
import { IDENTIFIER_RECORDS, PIPELINE_STAGES } from '../src/parser/registry-data.js';
import type { ParseResult } from '../src/parser/parse.js';
import type { TorahDocument, ContentBlock } from '../src/document.js';
import { findOrphanNotes } from '../src/document.js';
import { ContentModelError } from '../src/errors.js';

const textOf = (b: ContentBlock): string =>
  b.inline
    .map((it) =>
      it.kind === 'text'
        ? it.atoms.map((a) => a.text).join('')
        : it.kind === 'note-reference'
          ? `\u0001REF:${it.noteId}\u0002`
          : `\u0001${it.kind}:${'boxId' in it ? it.boxId : ''}\u0002`,
    )
    .join('');

const blocksOf = (doc: TorahDocument): ContentBlock[] => {
  const out: ContentBlock[] = [];
  const walk = (b: ContentBlock): void => {
    out.push(b);
    (b.children ?? []).forEach(walk);
  };
  for (const p of doc.parts) for (const s of p.simanim) s.blocks.forEach(walk);
  return out;
};

const parse = (raw: string, options: Record<string, unknown> = {}): ParseResult =>
  parseSourceText(raw, { documentId: 'test', ...options });

describe('מרשם המזהים — הפרסר צורך את התחביר ממנו', () => {
  it('38 רשומות עם מזהים ייחודיים, תחביר ומיפוי (שלמות המקורות נבדקת במאמת מול ה־JSON)', () => {
    expect(IDENTIFIER_RECORDS.length).toBe(38);
    const ids = IDENTIFIER_RECORDS.map((r) => r.recordId);
    expect(new Set(ids).size).toBe(38);
    for (const r of IDENTIFIER_RECORDS) {
      expect(r.fixtureId.length).toBeGreaterThan(0);
      expect(r.mapping.target.length).toBeGreaterThan(0);
      expect(r.syntax.kind.length).toBeGreaterThan(0);
      expect(typeof r.precedence).toBe('number');
    }
  });
  it('עשרת מפתחות ה-metadata רשומים', () => {
    const keys = IDENTIFIER_RECORDS.filter((r) => r.recordId.startsWith('metadata-key:')).map((r) => r.recordId.slice('metadata-key:'.length));
    expect(keys).toEqual([
      'שם הספר', 'נושא', 'נושא מפורט', 'פרטי מהדורא', 'שם המחבר',
      'מקום ושנת הוצאה', 'שמירת זכויות', 'פרטי הוצאה לאור', 'פרטי קשר', 'פרטים נוספים',
    ]);
  });
  it('סדר הצינור הישן נשמר (8 שלבים)', () => {
    expect(PIPELINE_STAGES.length).toBe(8);
    expect(PIPELINE_STAGES[0]).toContain('metadata');
    expect(PIPELINE_STAGES[7]).toContain('AST');
  });
});

describe('חשבונאות מלאה — אין אטום אבוד', () => {
  it('כל תו מסווג: metadata, כותרות, הערות מכל הסוגים, סגנונות, רווחים', () => {
    const raw = [
      'שם הספר - מקום בינה',
      'נושא/כותרת משנה - הוצאה ורשויות',
      '',
      'כותרת 1 - חלק',
      'כותרת 2 מספר 3 - סימן',
      'טקסט עם [הערה [מקוננת] פנימית] ועוד [שנייה].',
      'ועוד ##עורך## בשורה.   ',
      'הערת סיום - טקסט הערה',
      'כותרת 7 - הערת צד',
      'פסקה אחרונה.',
    ].join('\n');
    const res = parse(raw);
    expect(res.coverage.ok).toBe(true);
    expect(res.coverage.gaps).toHaveLength(0);
    expect(res.coverage.overlaps).toHaveLength(0);
    expect(res.coverage.atomChars + res.coverage.syntaxChars + res.coverage.metadataChars + res.coverage.breakChars).toBe(raw.length);
  });
  it('קלט ריק — מסמך תקין עם מבנה מינימלי', () => {
    const res = parse('');
    expect(res.coverage.ok).toBe(true);
    expect(res.doc.parts).toHaveLength(1);
    expect(res.doc.parts[0]?.simanim).toHaveLength(1);
    expect(blocksOf(res.doc)).toHaveLength(0);
  });
  it('רווחית בלבד — כיסוי מלא בלי בלוקים', () => {
    const res = parse('  \n\n   \n');
    expect(res.coverage.ok).toBe(true);
    expect(blocksOf(res.doc)).toHaveLength(0);
  });
  it('שורה עם רווחים בקצוות ו־\\r\\n — הקיצוץ נחשב ולא נעלם', () => {
    const res = parse('כותרת 1 - חלק\r\n   פסקה עם רווחים   \r\n');
    expect(res.coverage.ok).toBe(true);
    const body = blocksOf(res.doc).find((b) => b.role === 'body');
    expect(textOf(body as ContentBlock).startsWith('פסקה')).toBe(true);
  });
});

describe('metadata — לפני הכותרת הראשונה בלבד', () => {
  it('עשרת המפתחות עם תוחמי -, :, –, — וסיומות / ו־\\', () => {
    const raw = [
      'שם הספר - מקום בינה',
      'נושא/כותרת משנה - הוצאה',
      'נושא מפורט\\תיאור - הקדמות',
      'פרטי מהדורא: מהדורת ניסיון',
      'שם המחבר – נתנאל',
      'מקום ושנת הוצאה — ירושלים',
      'שמירת זכויות - הפקר',
      'פרטי הוצאה לאור - זוכמיר',
      'פרטי קשר - 052',
      'פרטים נוספים - אין',
      'כותרת 1 - חלק',
      'טקסט.',
    ].join('\n');
    const res = parse(raw);
    expect(res.doc.metadata.map((m) => m.key)).toEqual([
      'שם הספר', 'נושא', 'נושא מפורט', 'פרטי מהדורא', 'שם המחבר',
      'מקום ושנת הוצאה', 'שמירת זכויות', 'פרטי הוצאה לאור', 'פרטי קשר', 'פרטים נוספים',
    ]);
    expect(res.doc.metadata[0]?.value).toBe('מקום בינה');
    expect(res.doc.metadata[4]?.value).toBe('נתנאל');
    expect(res.coverage.ok).toBe(true);
  });
  it('מפתח כפול — נדחה (לא דריסה שקטה כמו בישן)', () => {
    expect(() => parse('שם הספר - א\nשם הספר - ב\nכותרת 1 - ח\n')).toThrow(ContentModelError);
  });
  it('שורה לא מזוהה לפני הכותרת — נשמרת כתוכן + אזהרה (הישן זרק בשקט)', () => {
    const res = parse('שורה תמוהה\nכותרת 1 - ח\n');
    expect(res.diagnostics.some((d) => d.code === 'errors.parser.WARN_PRE_HEADING_CONTENT')).toBe(true);
    expect(blocksOf(res.doc).some((b) => b.role === 'body')).toBe(true);
  });
  it('שורת metadata אחרי הכותרת הראשונה — לא מזוהה (כמו בישן)', () => {
    const res = parse('כותרת 1 - ח\nשם הספר - לא metadata\n');
    expect(res.doc.metadata).toHaveLength(0);
  });
});

describe('כותרות — התבנית המובנית והגמישה', () => {
  it('שלושת המבנים + גרסאות המקף (כמו מבחני הישן)', () => {
    const res = parse('כותרת 2 - הקדמה\nכותרת 7 מספר 401 - שלושה\nכותרת 1 מספר 1 (1) - הקדמות\nכותרת 3 – קו מתח\nכותרת 4 — קו ארוך\n');
    const headings = blocksOf(res.doc).filter((b) => b.role === 'heading' && b.headingLevel !== 7);
    expect(headings.map((h) => h.headingLevel)).toEqual([2, 1, 3, 4]);
  });
  it('התבנית הגמישה של Orange — (מקור: …) — הבייסליין בפועל', () => {
    const res = parse('כותרת 1 - חלק\nכותרת 7 (מקור: הוצאה, 7, 367) - חובת שמירה\nפסקה.\n');
    expect(res.doc.notes.sidenotes).toHaveLength(1);
    expect(textOf(res.doc.notes.sidenotes[0]?.block as ContentBlock)).toBe('חובת שמירה');
  });
  it('רמה 8 / בלי מקף / בלי רווח — פסקה + אזהרה (כמו בישן, בתוספת דיווח)', () => {
    const res = parse('כותרת 8 - רמה גבוהה\nכותרת 3 טקסט בלי מקף\nכותרת2 - בלי רווח\n');
    const headings = blocksOf(res.doc).filter((b) => b.role === 'heading');
    expect(headings).toHaveLength(0);
    expect(res.diagnostics.filter((d) => d.code === 'errors.parser.WARN_NEAR_MISS_HEADING')).toHaveLength(3);
  });
  it('מספר על כותרת שאינה H2 — פותח סימן עם המספר (שימור הנתון הישן)', () => {
    const res = parse('כותרת 1 - חלק\nכותרת 0 מספר 1 - הקדמה\nטקסט.\n');
    const part = res.doc.parts[0];
    // H1 בלי מספר ממתין; H0 מספר 1 פותח סימן שכולל גם את ה־H1 (רטרואקטיבי)
    expect(part?.simanim.map((s) => s.simanNumber)).toEqual([1]);
    expect(part?.simanim[0]?.blocks[0]?.headingLevel).toBe(1);
    expect(part?.simanim[0]?.blocks[1]?.headingLevel).toBe(0);
  });
  it('H2 בלי מספר — מספור אוטומטי עוקב בתוך החלק (H1 ממתין לסימן הראשון)', () => {
    const res = parse('כותרת 1 - חלק\nכותרת 2 - ראשון\nכותרת 2 - שני\n');
    expect(res.doc.parts[0]?.simanim.map((s) => s.simanNumber)).toEqual([1, 2]);
    // הסימן הראשון כולל את בלוק ה־H1 הממתין
    expect(res.doc.parts[0]?.simanim[0]?.blocks[0]?.headingLevel).toBe(1);
  });
});

describe('הערות — ארבעת הזרמים', () => {
  it('הערות שוליים: פשוטות, מקוננות, מרובות, פתוחות (מילולי)', () => {
    const raw = 'כותרת 1 - ח\nא [ראשונה] ב [שנייה [פנימית] חוץ] ג.\nושורה עם [ללא סגירה.\n';
    const res = parse(raw);
    expect(res.doc.notes.footnotes).toHaveLength(2);
    expect(textOf(res.doc.notes.footnotes[1]?.block as ContentBlock)).toBe('שנייה [פנימית] חוץ');
    expect(res.diagnostics.some((d) => d.code === 'errors.parser.WARN_UNMATCHED_FOOTNOTE')).toBe(true);
    // התוכן שאחרי התוחם הפתוח מילולי כולו — כמו בישן (break בסריקה); השורות הרצופות התאחדו לפסקה אחת
    const body = blocksOf(res.doc).find((b) => b.role === 'body') as ContentBlock;
    expect(textOf(body)).toContain('[ללא סגירה');
    expect(textOf(body)).toContain('שורה עם');
  });
  it('הערה חוצת שורות — explicit-break בגוף ההערה', () => {
    const res = parse('כותרת 1 - ח\nהתחלה [תוכן\nממשיך] סוף.\n');
    expect(res.doc.notes.footnotes).toHaveLength(1);
    const fn = res.doc.notes.footnotes[0];
    expect(fn?.block.inline.some((i) => i.kind === 'explicit-break')).toBe(true);
    expect(textOf(fn?.block as ContentBlock).startsWith('תוכן')).toBe(true);
  });
  it('הערות סיום — ההפניה בזרימת הפסקה (כמו ה-placeholder הישן)', () => {
    const raw = 'כותרת 1 - ח\nשורה ראשונה\nהערת סיום - הערה\nוממשיך.\n';
    const res = parse(raw);
    expect(res.doc.notes.endnotes).toHaveLength(1);
    expect(textOf(res.doc.notes.endnotes[0]?.block as ContentBlock)).toBe('הערה');
    const body = blocksOf(res.doc).find((b) => b.role === 'body') as ContentBlock;
    expect(textOf(body)).toBe('שורה ראשונה \u0001REF:en-1\u0002 וממשיך.');
  });
  it('הערות צד H7 — טקסט בזרם, סמן heading-7 בגוף, מספר נזנח כמו בישן', () => {
    const raw = 'כותרת 1 - ח\nכותרת 7 מספר 395 - הערה\nפסקה.\n';
    const res = parse(raw);
    expect(res.doc.notes.sidenotes).toHaveLength(1);
    expect(textOf(res.doc.notes.sidenotes[0]?.block as ContentBlock)).toBe('הערה');
    const marker = blocksOf(res.doc).find((b) => b.headingLevel === 7);
    expect(marker?.inline[0]?.kind).toBe('note-reference');
    expect(res.diagnostics.some((d) => d.code === 'errors.parser.WARN_H7_SIMAN_DISCARDED')).toBe(true);
    // H7 לא שוברת פסקה — השורות סביבה מתאחדות כמו בישן (השורה הוסרה מהזרימה)
    const body = blocksOf(res.doc).filter((b) => b.role === 'body');
    expect(body).toHaveLength(1);
  });
  it('הערות עורך — נשמרות בזרם editorial + רישום suppress; ## בודד מילולי', () => {
    const raw = 'כותרת 1 - ח\nטקסט ##לבדוק## רגיל.\n##אחד## שתיים ##שניים##\nוגם ## בודד.\n';
    const res = parse(raw);
    expect(res.doc.notes.editorial).toHaveLength(3);
    expect(res.transforms.filter((t) => t.kind === 'suppress' && t.reason === 'editorial-note-removal')).toHaveLength(3);
    expect(res.doc.notes.editorial.map((n) => textOf(n.block))).toEqual(['לבדוק', 'אחד', 'שניים']);
    expect(res.diagnostics.some((d) => d.code === 'errors.parser.WARN_UNMATCHED_EDITORIAL')).toBe(true);
    // ההערות יתומות מטבען (מדווחות, לא נבלעות)
    expect(res.coverage.ok).toBe(true);
  });
  it('הערות יתומות — מדווחות ולא נבלעות', () => {
    const res = parse('כותרת 1 - ח\nטקסט ##עורך## רגיל.\n');
    expect(findOrphanNotes(res.doc)).toContain('ed-1');
  });
});

describe('סגנונות מותאמים', () => {
  it('linePrefix — ההגדרה המופעלת הראשונה זוכה; הקידומת גוברת על זיהוי כותרת', () => {
    const raw = 'כותרת 1 - ח\n» ציטוט\nכותרת 2 - נראית כותרת אבל בקידומת\nסוף.\n';
    const res = parse(raw, {
      customStyles: [
        { id: 'quote', enabled: true, matcher: { type: 'linePrefix', prefix: '»' } },
        { id: 'second', enabled: true, matcher: { type: 'linePrefix', prefix: 'כותרת 2' } },
      ],
    });
    const customs = blocksOf(res.doc).filter((b) => b.role === 'custom');
    expect(customs).toHaveLength(2);
    expect(customs.map((c) => c.styleId)).toEqual(['quote', 'second']);
    expect(res.doc.customStyleIds).toEqual(['quote', 'second']);
    // 'כותרת 2' בקידומת — כבר לא כותרת (כמו בישן: הסגנון רץ לפני ה־AST)
    expect(blocksOf(res.doc).some((b) => b.role === 'heading' && b.headingLevel === 2)).toBe(false);
  });
  it('inlineMarker — תוחמים נצרכים, התוכן נשמר, inline-box מסמן את הטווח', () => {
    const raw = 'כותרת 1 - ח\nפסקה עם «מסומן» בפנים וגם «לא נסגר.\n';
    const res = parse(raw, {
      customStyles: [{ id: 'em', enabled: true, matcher: { type: 'inlineMarker', open: '«', close: '»' } }],
    });
    const body = blocksOf(res.doc).find((b) => b.role === 'body') as ContentBlock;
    expect(body.inline.some((i) => i.kind === 'inline-box' && i.boxId === 'em')).toBe(true);
    expect(textOf(body)).toContain('מסומן');
    // הזוג התואם נצרך; הפתיחה שלא נסגרה נשארת מילולית (כמו בישן)
    expect(textOf(body)).not.toContain('«מסומן');
    expect(textOf(body)).toContain('«לא נסגר');
    expect(res.diagnostics.some((d) => d.code === 'errors.parser.WARN_UNMATCHED_INLINE_MARKER')).toBe(true);
    expect(res.coverage.ok).toBe(true);
  });
  it('הגדרות לא חוקיות — נדחות בזמן יצירה', () => {
    expect(() => parse('x', { customStyles: [{ id: 'a', enabled: true, matcher: { type: 'linePrefix', prefix: '  ' } }] })).toThrow(ContentModelError);
    expect(() => parse('x', { customStyles: [{ id: 'a', enabled: true, matcher: { type: 'inlineMarker', open: '', close: 'x' } }] })).toThrow(ContentModelError);
    expect(() => parse('x', { endnotePrefix: '' })).toThrow(ContentModelError);
  });
});

describe('חלקים וסימנים', () => {
  it('H1 פותח חלק; תוכן לפני H1 — חלק לא ממוספר', () => {
    const raw = 'פתיח לפני חלק.\n\nכותרת 1 - חלק א\nכותרת 2 - סימן\nטקסט.\n\nכותרת 1 - חלק ב\nכותרת 2 - סימן\n';
    const res = parse(raw);
    expect(res.doc.parts.map((p) => p.title)).toEqual([undefined, 'חלק א', 'חלק ב']);
    expect(res.doc.parts[1]?.simanim[0]?.simanNumber).toBe(1);
  });
  it('H1 עם מספר — המספר נשמר על סימן נפרד בתוך החלק', () => {
    const res = parse('כותרת 1 מספר 4 - חלק\nטקסט.\n');
    expect(res.doc.parts[0]?.title).toBe('חלק');
    expect(res.doc.parts[0]?.simanim[0]?.simanNumber).toBe(4);
  });
  it('קינון: כותרת פותחת בלוק וילדיו עד הכותרת הבאה (כמו ast-builder הישן)', () => {
    const raw = 'כותרת 1 - ח\nכותרת 2 - ס\nפסקה א.\n\nפסקה ב.\n\nכותרת 3 - תת\nפסקה ג.\n\nפסקה ד שממשיכה\nבשתי שורות רצופות.\n';
    const res = parse(raw);
    const h2 = blocksOf(res.doc).find((b) => b.headingLevel === 2);
    expect((h2?.children ?? []).map((c) => textOf(c))).toEqual(['פסקה א.', 'פסקה ב.']);
    const h3 = blocksOf(res.doc).find((b) => b.headingLevel === 3);
    expect((h3?.children ?? []).map((c) => textOf(c))).toEqual(['פסקה ג.', 'פסקה ד שממשיכה בשתי שורות רצופות.']);
  });
});

describe('איסורים — sentinel ו־HTML', () => {
  it('קלט עם sentinel — נדחה מראש', () => {
    expect(() => parse('טקסט \u0001FN:x\u0002 נגוע')).toThrow(ContentModelError);
  });
  it('הפלט נקי מ־sentinel לחלוטין', () => {
    const raw = 'כותרת 1 - ח\nטקסט [הערה] ##עורך## וסוף.\nהערת סיום - ב\nכותרת 7 - צד\n';
    const res = parse(raw);
    expect(JSON.stringify(res.doc)).not.toMatch(/[\u0001\u0002]/);
  });
  it('HTML בקלט — מילולי + אזהרה, אין פרשנות', () => {
    const res = parse('כותרת 1 - ח\nפסקה עם <b>מודגש</b> מילולי.\n');
    const body = blocksOf(res.doc).find((b) => b.role === 'body') as ContentBlock;
    expect(textOf(body)).toContain('<b>מודגש</b>');
    expect(res.diagnostics.some((d) => d.code === 'errors.parser.WARN_HTML_IN_TEXT')).toBe(true);
  });
  it('תו בקרה בתוך שורה — נדחה (טאב באמצע)', () => {
    expect(() => parse('כותרת 1 - ח\nטקסט\tטאב באמצע.\n')).toThrow(ContentModelError);
  });
});

describe('דטרמיניזם וזהות', () => {
  it('אותו קלט ← אותו פלט ביט-ביט (כולל מזהים)', () => {
    const raw = 'שם הספר - א\n\nכותרת 1 - ח\nכותרת 2 מספר 2 - ס\nטקסט [הערה] וגם ##עורך##.\nהערת סיום - ב\nכותרת 7 - צד\n';
    const a = parse(raw, { sourceHash: 'a'.repeat(64) });
    const b = parse(raw, { sourceHash: 'a'.repeat(64) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('sourceHash מוזרק ומאומת (ADR-002)', () => {
    const res = parse('טקסט.', { sourceHash: 'ab'.repeat(32) });
    expect(res.doc.sourceHash).toBe('ab'.repeat(32));
    expect(res.doc.sourceLength).toBe(5);
  });
  it('אטומי החדרה של חיבור שורות — origin מפורש', () => {
    const res = parse('כותרת 1 - ח\nשורה א\nשורה ב\n');
    const body = blocksOf(res.doc).find((b) => b.role === 'body') as ContentBlock;
    const joins = body.inline.flatMap((i) => (i.kind === 'text' ? [...i.atoms] : [])).filter((a) => a.origin === 'parser:paragraph-join');
    expect(joins).toHaveLength(1);
    expect(joins[0]?.text).toBe(' ');
    expect(textOf(body)).toBe('שורה א שורה ב');
  });
});
