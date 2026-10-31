/**
 * document.test.ts — מסגרת המסמך: metadata, חלקים/סימנים, זרמי הערות,
 * round-trip serialization והפניות (שלב 16).
 *
 * אסמכתא: אפיון §3.1/§3.3 · תכנית שלב 16: "round-trip serialization;
 * blocks מקוננים; references לזרמי notes".
 */
import { describe, expect, it } from 'vitest';
import {
  LEGACY_METADATA_KEYS,
  NOTE_KINDS,
  SHAAR_DESIGNS,
  allBlocks,
  findOrphanNotes,
  isTorahDocument,
  makeTorahDocument,
  parseDocument,
  serializeDocument,
} from '../src/document.js';
import { makeContentBlock } from '../src/blocks.js';
import { deriveAnchorId } from '../src/blocks.js';
import { makeAnchorItem, makeExplicitBreak, makeMarker, makeNoteReference, makeTextItem } from '../src/inline.js';
import { makeTextAtom } from '../src/atoms.js';
import { makeNodeId, makeSourceSpan } from '../src/spans.js';
import { ContentModelError, isRegisteredContentModelErrorKey } from '../src/errors.js';
import type { TorahDocument } from '../src/document.js';

const DOC = 'tora-canonical';
const body = (start: number, end: number) => makeSourceSpan(DOC, 'body', start, end);
const fnSpan = (start: number, end: number) => makeSourceSpan(DOC, 'footnote', start, end);
const enSpan = (start: number, end: number) => makeSourceSpan(DOC, 'endnote', start, end);
const snSpan = (start: number, end: number) => makeSourceSpan(DOC, 'sidenote', start, end);
const mdSpan = (start: number, end: number) => makeSourceSpan(DOC, 'metadata', start, end);

/** אטום שהפרוסה שלו נגזרת מאורך הטקסט — כמו שהפרסר יעשה (שלב 17). */
function autoAtom(text: string, span: (start: number, end: number) => ReturnType<typeof makeSourceSpan>, start: number) {
  return makeTextAtom(text, span(start, start + text.length));
}

function expectError(key: string, fn: () => unknown): void {
  try {
    fn();
    expect.unreachable(`היה צפוי ${key}`);
  } catch (e) {
    expect(e).toBeInstanceOf(ContentModelError);
    expect((e as ContentModelError).catalogKey).toBe(key);
    expect(isRegisteredContentModelErrorKey(key)).toBe(true);
  }
}

/** מסמך תורני מלא לדוגמה — ירושה של מבני הישן במודל החדש. */
function buildSampleDocument(): TorahDocument {
  // ── גוף: H2 פותח סימן, פסקה עם הפניית הערה + סמן + עוגן ──
  const heading2 = makeContentBlock({
    role: 'heading',
    headingLevel: 2,
    source: body(0, 6),
    inline: [makeTextItem([autoAtom('סימן א׳', body, 0)])],
  });
  const paragraph = makeContentBlock({
    role: 'body',
    source: body(6, 60),
    inline: [
      makeTextItem([autoAtom('אמר רבא', body, 6), autoAtom(' ', body, 13)]),
      makeNoteReference('fn-1', body(14, 16)),
      makeTextItem([autoAtom('כך הוא', body, 16)]),
      makeMarker('dibbur-hamatchil', body(22, 30)),
      makeAnchorItem(deriveAnchorId(body(30, 40)), body(30, 40)),
      makeTextItem([autoAtom('וכו׳', body, 40)]),
      makeExplicitBreak(body(44, 44)),
      makeTextItem([autoAtom('שורה שנייה', body, 45)]),
    ],
  });
  const bodyWithChildren = makeContentBlock({
    role: 'heading',
    headingLevel: 2,
    source: body(0, 60),
    inline: heading2.inline,
    children: [paragraph],
  });
  // H7 — הערת צד בשוליים, כמו בישן: בלוק כותרת בזרם הגוף
  const h7Sidenote = makeContentBlock({
    role: 'heading',
    headingLevel: 7,
    source: body(90, 99),
    inline: [makeTextItem([autoAtom('הערת צד', body, 90)])],
  });
  // ── הערות: ארבעת הזרמים, כולם מופנים מהגוף ──
  const footnoteBody = makeContentBlock({
    role: 'note-body',
    source: fnSpan(0, 12),
    inline: [makeTextItem([autoAtom('הערת שוליים', fnSpan, 0)])],
  });
  const endnoteBody = makeContentBlock({
    role: 'note-body',
    source: enSpan(0, 10),
    inline: [makeTextItem([autoAtom('הערת סיום', enSpan, 0)])],
  });
  const sidenoteBody = makeContentBlock({
    role: 'note-body',
    source: snSpan(0, 9),
    inline: [makeTextItem([autoAtom('הערת צד', snSpan, 0)])],
  });
  const editorialBody = makeContentBlock({
    role: 'note-body',
    source: body(200, 210),
    inline: [makeTextItem([autoAtom('הערת עורך', body, 200)])],
  });
  const paragraph2 = makeContentBlock({
    role: 'body',
    source: body(60, 90),
    inline: [
      makeTextItem([autoAtom('עוד טקסט', body, 60)]),
      makeNoteReference('en-1', body(67, 69)),
      makeNoteReference('sn-1', body(70, 72)),
      makeNoteReference('ed-1', body(73, 75)),
    ],
  });
  return makeTorahDocument({
    schemaVersion: 1,
    documentId: DOC,
    metadata: [
      { key: 'שם הספר', value: 'ספר הדוגמה', source: mdSpan(0, 20) },
      { key: 'שם המחבר', value: 'מחבר הדוגמה', source: mdSpan(20, 40) },
    ],
    parts: [
      {
        id: makeNodeId('part-1'),
        title: 'חלק ראשון',
        source: body(0, 99),
        simanim: [
          {
            id: makeNodeId('siman-1'),
            simanNumber: 1,
            shaarDesign: 'main',
            source: body(0, 60),
            blocks: [bodyWithChildren, paragraph2, h7Sidenote],
          },
          {
            id: makeNodeId('siman-1-2'),
            simanNumber: 1,
            subNumber: 2,
            source: body(0, 10),
            blocks: [],
          },
        ],
      },
    ],
    notes: {
      footnotes: [{ noteId: 'fn-1', kind: 'footnote', anchor: 'anchor:v1|tora-canonical|body|14+16|0', block: footnoteBody }],
      endnotes: [{ noteId: 'en-1', kind: 'endnote', block: endnoteBody }],
      sidenotes: [{ noteId: 'sn-1', kind: 'sidenote', block: sidenoteBody }],
      editorial: [{ noteId: 'ed-1', kind: 'editorial', block: editorialBody }],
    },
    customStyleIds: [],
    sourceHash: '',
    sourceLength: 300,
  });
}

describe('makeTorahDocument — המסגרת התורנית', () => {
  it('מסמך מלא נבנה: parts←simanim←blocks, ארבעה זרמי הערות, metadata', () => {
    const doc = buildSampleDocument();
    expect(isTorahDocument(doc)).toBe(true);
    expect(doc.parts).toHaveLength(1);
    expect(doc.parts[0]?.simanim).toHaveLength(2);
    expect(doc.parts[0]?.simanim[0]?.shaarDesign).toBe('main');
    expect(doc.parts[0]?.simanim[1]?.subNumber).toBe(2);
    expect(doc.notes.footnotes).toHaveLength(1);
    expect(doc.notes.editorial).toHaveLength(1);
    expect(allBlocks(doc).length).toBeGreaterThan(5); // גוף + קינון + גופי הערות
    expect([...LEGACY_METADATA_KEYS]).toHaveLength(10);
    expect([...SHAAR_DESIGNS]).toEqual(['main', 'back', 'sub']);
    expect([...NOTE_KINDS]).toEqual(['footnote', 'endnote', 'sidenote', 'editorial']);
  });

  it('עשרת מפתחות ה־metadata ההכרחיים מהישן רשומים במלואם', () => {
    const expected = [
      'שם הספר', 'נושא', 'נושא מפורט', 'פרטי מהדורא', 'שם המחבר',
      'מקום ושנת הוצאה', 'שמירת זכויות', 'פרטי הוצאה לאור', 'פרטי קשר', 'פרטים נוספים',
    ];
    expect([...LEGACY_METADATA_KEYS]).toEqual(expected);
  });

  it('הפניות לזרמי הערות נפתרות; הערה יתומה מדווחת ואינה נבלעת', () => {
    const doc = buildSampleDocument();
    expect(findOrphanNotes(doc)).toEqual([]); // כל ההערות מופנות
    // הוספת הערה בלי הפנייה — המסמך חוקי אך היתום מדווח
    const docWithOrphan = makeTorahDocument({
      ...doc,
      notes: {
        ...doc.notes,
        endnotes: [
          ...doc.notes.endnotes,
          {
            noteId: 'en-orphan',
            kind: 'endnote',
            block: makeContentBlock({
              role: 'note-body',
              source: enSpan(50, 62),
              inline: [makeTextItem([autoAtom('הערה יתומה', enSpan, 50)])],
            }),
          },
        ],
      },
    });
    expect(findOrphanNotes(docWithOrphan)).toEqual(['en-orphan']);
  });

  it('דחיות: הפניה בלי יעד, מזהה הערה כפול, סוג בזרם הלא נכון, גוף הערה שאינו note-body', () => {
    const doc = buildSampleDocument();
    expectError('errors.document.UNRESOLVED_NOTE_REFERENCE', () =>
      makeTorahDocument({
        ...doc,
        parts: [
          {
            ...doc.parts[0],
            simanim: [
              {
                ...doc.parts[0]?.simanim[0],
                blocks: [
                  makeContentBlock({
                    role: 'body',
                    source: body(300, 320),
                    inline: [{ kind: 'note-reference', noteId: 'fn-missing', source: body(300, 302) }],
                  }),
                ],
              },
            ],
          },
        ],
      }),
    );
    expectError('errors.document.DUPLICATE_NOTE_ID', () =>
      makeTorahDocument({
        ...doc,
        notes: {
          ...doc.notes,
          endnotes: [
            { noteId: 'fn-1', kind: 'endnote', block: doc.notes.endnotes[0]?.block as never },
          ],
        },
      }),
    );
    expectError('errors.document.INVALID_NOTE', () =>
      makeTorahDocument({
        ...doc,
        notes: { ...doc.notes, footnotes: [{ noteId: 'fn-x', kind: 'endnote', block: doc.notes.footnotes[0]?.block as never }] },
      }),
    );
    expectError('errors.document.INVALID_NOTE_BLOCK_ROLE', () =>
      makeTorahDocument({
        ...doc,
        notes: {
          ...doc.notes,
          footnotes: [
            {
              noteId: 'fn-1',
              kind: 'footnote',
              block: makeContentBlock({ role: 'body', source: body(400, 410) }),
            },
          ],
        },
      }),
    );
  });

  it('דחיות מסגרת: גרסה, מזהה, metadata כפול/בזרם לא נכון, סימן, שער, hash', () => {
    const doc = buildSampleDocument();
    expectError('errors.document.INVALID_SCHEMA_VERSION', () => makeTorahDocument({ ...doc, schemaVersion: 2 as never }));
    expectError('errors.document.INVALID_DOCUMENT_ID', () => makeTorahDocument({ ...doc, documentId: '' }));
    expectError('errors.document.DUPLICATE_METADATA_KEY', () =>
      makeTorahDocument({
        ...doc,
        metadata: [...doc.metadata, { key: 'שם הספר', value: 'כפול', source: mdSpan(50, 55) }],
      }),
    );
    expectError('errors.document.INVALID_METADATA', () =>
      makeTorahDocument({
        ...doc,
        metadata: [...doc.metadata, { key: 'מקור גוף', value: 'ו', source: body(0, 1) }],
      }),
    );
    expectError('errors.document.INVALID_PART', () => makeTorahDocument({ ...doc, parts: [] }));
    expectError('errors.document.INVALID_SIMAN_NUMBER', () =>
      makeTorahDocument({
        ...doc,
        parts: [{ ...doc.parts[0], simanim: [{ ...doc.parts[0]?.simanim[0], simanNumber: 0 }] }],
      }),
    );
    expectError('errors.document.INVALID_SHAAR_DESIGN', () =>
      makeTorahDocument({
        ...doc,
        parts: [{ ...doc.parts[0], simanim: [{ ...doc.parts[0]?.simanim[0], shaarDesign: 'mega' as never }] }],
      }),
    );
    expectError('errors.document.INVALID_SOURCE_HASH', () => makeTorahDocument({ ...doc, sourceHash: 'xyz' }));
    expect(makeTorahDocument({ ...doc, sourceHash: 'a'.repeat(64) }).sourceHash).toBe('a'.repeat(64));
    expectError('errors.document.NOT_A_DOCUMENT', () => makeTorahDocument({ ...doc, sourceLength: -1 }));
  });

  it('דחיית בלוק כפול בעץ המסמך', () => {
    const doc = buildSampleDocument();
    const block = doc.parts[0]?.simanim[0]?.blocks[0];
    expectError('errors.block.DUPLICATE_NODE_ID', () =>
      makeTorahDocument({
        ...doc,
        parts: [
          {
            ...doc.parts[0],
            simanim: [
              { ...doc.parts[0]?.simanim[0], blocks: [block, block] as never },
              { ...doc.parts[0]?.simanim[1], blocks: [] },
            ],
          },
        ],
      }),
    );
  });
});

describe('round-trip serialization — דטרמיניזם ביט-ביט', () => {
  it('serialize → parse → זהה עמוק; פעמיים ← אותה מחרוזת', () => {
    const doc = buildSampleDocument();
    const json = serializeDocument(doc);
    expect(typeof json).toBe('string');
    const restored = parseDocument(json);
    expect(restored).toEqual(doc); // round-trip מלא, כולל קינון והערות
    expect(serializeDocument(restored)).toBe(json); // אותה מחרוזת בדיוק
    const doc2 = buildSampleDocument(); // בנייה מחדש מאותם מקורות
    expect(serializeDocument(doc2)).toBe(json); // דטרמיניזם בנייה
  });

  it('פרסור JSON שבור ומסמך שאינו אובייקט — דחייה ממוקמת', () => {
    expectError('errors.document.NOT_A_DOCUMENT', () => parseDocument('{oops'));
    expectError('errors.document.NOT_A_DOCUMENT', () => parseDocument('42'));
    expectError('errors.document.NOT_A_DOCUMENT', () => parseDocument('null'));
    expect(isTorahDocument({ nope: true })).toBe(false);
  });
});
