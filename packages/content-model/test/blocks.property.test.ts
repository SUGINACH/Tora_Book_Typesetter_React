/**
 * blocks.property.test.ts — מבחן property ל־round-trip של מסמכים (שלב 16).
 *
 * אסמכתא: תכנית שלב 16: "round-trip serialization; blocks מקוננים" ·
 * אפיון §6.2 ("IDs דטרמיניסטיים ויציבים לאותו מבנה").
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeTorahDocument, parseDocument, serializeDocument } from '../src/document.js';
import { makeContentBlock } from '../src/blocks.js';
import { makeTextItem, makeNoteReference } from '../src/inline.js';
import { makeTextAtom } from '../src/atoms.js';
import { makeNodeId, makeSourceSpan } from '../src/spans.js';
import type { TorahDocument } from '../src/document.js';

const DOC = 'prop-doc';
const SAFE = 'אבגדהוזחטיכלמנסעפצקרשתabcXYZ 019';

const arbText = fc
  .string({ unit: 'grapheme', minLength: 1, maxLength: 6 })
  .map((s) => {
    let out = '';
    for (const ch of s) out += SAFE.includes(ch) ? ch : 'א';
    return out || 'א';
  });

/** בונה מסמך קטן מפרמטרים שרירותיים — פרוסות נגזרות מאורכי הטקסט. */
function buildDoc(texts: readonly string[], nest: boolean, noteRef: boolean): TorahDocument {
  let pos = 0;
  const atoms = texts.map((t) => {
    const atom = makeTextAtom(t, makeSourceSpan(DOC, 'body', pos, pos + t.length));
    pos += t.length;
    return atom;
  });
  const inline = [makeTextItem(atoms)];
  if (noteRef) {
    inline.push(makeNoteReference('fn-1', makeSourceSpan(DOC, 'body', pos, pos + 2)));
  }
  const paragraph = makeContentBlock({
    role: 'body',
    source: makeSourceSpan(DOC, 'body', 0, pos),
    inline,
  });
  const heading = makeContentBlock({
    role: 'heading',
    headingLevel: 2,
    source: makeSourceSpan(DOC, 'body', pos, pos + 4),
    inline: [makeTextItem([makeTextAtom('סימן', makeSourceSpan(DOC, 'body', pos, pos + 'סימן'.length))])],
    ...(nest ? { children: [paragraph] } : {}),
  });
  const footnoteBody = makeContentBlock({
    role: 'note-body',
    source: makeSourceSpan(DOC, 'footnote', 0, 6),
    inline: [makeTextItem([makeTextAtom('הערה', makeSourceSpan(DOC, 'footnote', 0, 'הערה'.length))])],
  });
  return makeTorahDocument({
    schemaVersion: 1,
    documentId: DOC,
    metadata: [{ key: 'שם הספר', value: 'דוגמה', source: makeSourceSpan(DOC, 'metadata', 0, 5) }],
    parts: [
      {
        id: makeNodeId('part-1'),
        simanim: [
          {
            id: makeNodeId('siman-1'),
            simanNumber: 1,
            blocks: nest ? [heading] : [heading, paragraph],
          },
        ],
      },
    ],
    notes: noteRef
      ? { footnotes: [{ noteId: 'fn-1', kind: 'footnote', block: footnoteBody }], endnotes: [], sidenotes: [], editorial: [] }
      : { footnotes: [], endnotes: [], sidenotes: [], editorial: [] },
    customStyleIds: [],
    sourceHash: '',
    sourceLength: pos + 10,
  });
}

describe('property — round-trip של מסמכים', () => {
  it('serialize → parse ← זהה עמוק, לכל מסמך שנבנה פעמיים מאותם מקורות', () => {
    fc.assert(
      fc.property(
        fc.array(arbText, { minLength: 1, maxLength: 6 }),
        fc.boolean(),
        fc.boolean(),
        (texts, nest, noteRef) => {
          const doc1 = buildDoc(texts, nest, noteRef);
          const doc2 = buildDoc(texts, nest, noteRef);
          const json1 = serializeDocument(doc1);
          expect(serializeDocument(doc2)).toBe(json1); // דטרמיניזם בנייה
          const restored = parseDocument(json1);
          expect(restored).toEqual(doc1); // round-trip מלא
          expect(serializeDocument(restored)).toBe(json1); // סדר שדות יציב
        },
      ),
      { numRuns: 100 },
    );
  });
});
