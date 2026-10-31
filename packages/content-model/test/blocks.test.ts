/**
 * blocks.test.ts — בדיקות InlineItem, ContentBlock וגזירת NodeId/AnchorId (שלב 16).
 *
 * אסמכתא: אפיון §6.2 · תכנית שלב 16: "round-trip serialization; blocks
 * מקוננים; references לזרמי notes" (חלק המסמך ב־document.test.ts).
 */
import { describe, expect, it } from 'vitest';
import {
  BLOCK_ROLES,
  HEADING_LEVELS,
  MAX_BLOCK_DEPTH,
  blockDepth,
  deriveAnchorId,
  deriveNodeId,
  isContentBlock,
  makeContentBlock,
} from '../src/blocks.js';
import {
  INLINE_ITEM_KINDS,
  isInlineItem,
  makeAnchorItem,
  makeExplicitBreak,
  makeInlineBox,
  makeMarker,
  makeNoteReference,
  makeTextItem,
} from '../src/inline.js';
import { makeTextAtom } from '../src/atoms.js';
import { makeSourceSpan } from '../src/spans.js';
import { ContentModelError, isRegisteredContentModelErrorKey } from '../src/errors.js';

const DOC = 'tora-canonical';

/** פרוסה שמתאימה בדיוק לאורך הטקסט — כמו שהפרסר יעשה (שלב 17). */
const spanOf = (text: string, start: number) => makeSourceSpan(DOC, 'body', start, start + text.length);

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

const bodySpan = (start: number, end: number) => makeSourceSpan(DOC, 'body', start, end);
const noteSpan = (start: number, end: number) => makeSourceSpan(DOC, 'footnote', start, end);

describe('InlineItem — ששת הסוגים והאכיפה', () => {
  it('text: אטומים לא ריקים, כולם באותו זרם; קפוא', () => {
    const atoms = [
      makeTextAtom('וַיְדַבֵּר', spanOf('וַיְדַבֵּר', 0)),
      makeTextAtom(' ', spanOf(' ', 30)),
      makeTextAtom('יהוה', spanOf('יהוה', 31)),
    ];
    const item = makeTextItem(atoms);
    expect(item.kind).toBe('text');
    expect(item.kind === 'text' && item.atoms).toHaveLength(3);
    expect(Object.isFrozen(item)).toBe(true);
    expect(isInlineItem(item)).toBe(true);
  });

  it('text דוחה: ריק, אטום פגום, זרמים מעורבים', () => {
    expectError('errors.inline.EMPTY_TEXT', () => makeTextItem([]));
    expectError('errors.inline.ATOM_NOT_VALID', () => makeTextItem([{ fake: true } as never]));
    expectError('errors.inline.MIXED_STREAMS', () =>
      makeTextItem([makeTextAtom('א', bodySpan(0, 1)), makeTextAtom('ב', noteSpan(0, 1))]),
    );
    expectError('errors.inline.MIXED_STREAMS', () =>
      makeTextItem([
        makeTextAtom('א', makeSourceSpan('other-doc', 'body', 0, 1)),
        makeTextAtom('ב', bodySpan(0, 1)),
      ]),
    );
  });

  it('note-reference/anchor/break/box/marker: מזהים חוקיים ו־span חובה', () => {
    const ref = makeNoteReference('fn-1', bodySpan(20, 24));
    expect(ref.kind).toBe('note-reference');
    expect(isInlineItem(ref)).toBe(true);
    const anchor = makeAnchorItem(deriveAnchorId(bodySpan(30, 40)), bodySpan(30, 40));
    expect(anchor.kind === 'anchor' && anchor.anchorId.startsWith('anchor:v1|')).toBe(true);
    const brk = makeExplicitBreak(bodySpan(50, 50));
    expect(brk.kind).toBe('explicit-break');
    const box = makeInlineBox('custom-box-7', bodySpan(60, 80));
    expect(box.kind).toBe('inline-box');
    const marker = makeMarker('drop-word', bodySpan(90, 96));
    expect(marker.kind).toBe('marker');
    expectError('errors.inline.INVALID_ID', () => makeNoteReference('', bodySpan(0, 1)));
    expectError('errors.inline.INVALID_ID', () => makeNoteReference('bad id\u0007', bodySpan(0, 1)));
    expectError('errors.inline.NOT_AN_ITEM', () => makeNoteReference('fn-1', { bad: 1 } as never));
    expectError('errors.inline.INVALID_ID', () => makeMarker('', bodySpan(0, 1)));
    expectError('errors.inline.INVALID_ID', () => makeInlineBox('', bodySpan(0, 1)));
    expectError('errors.inline.NOT_AN_ITEM', () => makeExplicitBreak({ nope: true } as never));
    expect(isInlineItem({ kind: 'marker' })).toBe(false);
    expect(isInlineItem(null)).toBe(false);
    expect([...INLINE_ITEM_KINDS]).toEqual([
      'text', 'note-reference', 'anchor', 'explicit-break', 'inline-box', 'marker',
    ]);
  });
});

describe('ContentBlock — בנייה, ברירות מחדל וקינון', () => {
  it('פסקה: role body, styleId ברירת מחדל, inline, מזהה נגזר', () => {
    const para = makeContentBlock({
      role: 'body',
      source: bodySpan(0, 20),
      inline: [makeTextItem([makeTextAtom('אבג', bodySpan(0, 3))])],
    });
    expect(para.role).toBe('body');
    expect(para.styleId).toBe('body');
    expect(para.id).toBe(deriveNodeId(bodySpan(0, 20)));
    expect(para.id.startsWith('node:v1|')).toBe(true);
    expect(para.headingLevel).toBeUndefined();
    expect(para.children).toBeUndefined();
    expect(isContentBlock(para)).toBe(true);
  });

  it('כותרת H0–H7: headingLevel חובה, styleId ברירת מחדל heading-N', () => {
    for (const level of HEADING_LEVELS) {
      const heading = makeContentBlock({ role: 'heading', headingLevel: level, source: bodySpan(0, 4) });
      expect(heading.styleId).toBe(`heading-${level}`);
      expect(heading.headingLevel).toBe(level);
    }
    expectError('errors.block.HEADING_LEVEL_REQUIRED', () =>
      makeContentBlock({ role: 'heading', source: bodySpan(0, 4) }),
    );
    expectError('errors.block.INVALID_HEADING_LEVEL', () =>
      makeContentBlock({ role: 'heading', headingLevel: 8 as never, source: bodySpan(0, 4) }),
    );
    expectError('errors.block.HEADING_LEVEL_FORBIDDEN', () =>
      makeContentBlock({ role: 'body', headingLevel: 2, source: bodySpan(0, 4) }),
    );
  });

  it('קינון כמו הישן: כותרת H2 עם ילדים (פסקאות הסימן) ותיבה מותאמת', () => {
    const p1 = makeContentBlock({
      role: 'body',
      source: bodySpan(10, 40),
      inline: [makeTextItem([makeTextAtom('פסקה', spanOf('פסקה', 10))])],
    });
    const boxChild = makeContentBlock({
      role: 'body',
      source: bodySpan(50, 70),
      inline: [makeTextItem([makeTextAtom('בתוך התיבה', spanOf('בתוך התיבה', 50))])],
    });
    const box = makeContentBlock({
      role: 'custom',
      styleId: 'custom-style-3',
      source: bodySpan(48, 72),
      children: [boxChild],
    });
    const heading = makeContentBlock({
      role: 'heading',
      headingLevel: 2,
      source: bodySpan(0, 8),
      inline: [makeTextItem([makeTextAtom('סימן א׳', spanOf('סימן א׳', 0))])],
      children: [p1, box],
    });
    expect(heading.children).toHaveLength(2);
    expect(blockDepth(heading)).toBe(3); // heading ← box ← boxChild
    expect(isContentBlock(heading)).toBe(true);
    // מזהי הילדים שונים משל האב (פרוסות שונות) ונגזרים ממקורם
    expect(new Set([heading.id, p1.id, box.id, boxChild.id]).size).toBe(4);
  });

  it('דחיות בלוק: role, span, styleId, ילד פגום, ordinal, origin', () => {
    expectError('errors.block.INVALID_ROLE', () =>
      makeContentBlock({ role: 'aside' as never, source: bodySpan(0, 4) }),
    );
    expectError('errors.block.NOT_A_BLOCK', () =>
      makeContentBlock({ role: 'body', source: { bad: 1 } as never }),
    );
    expectError('errors.block.INVALID_STYLE_ID', () =>
      makeContentBlock({ role: 'body', styleId: '', source: bodySpan(0, 4) }),
    );
    expectError('errors.block.INVALID_CHILDREN', () =>
      makeContentBlock({ role: 'body', children: [{ fake: true }] as never, source: bodySpan(0, 4) }),
    );
    expectError('errors.block.NOT_A_BLOCK', () =>
      makeContentBlock({ role: 'body', inline: [{ kind: 'nope' }] as never, source: bodySpan(0, 4) }),
    );
    expectError('errors.block.INVALID_ORDINAL', () =>
      makeContentBlock({ role: 'body', ordinal: -1, source: bodySpan(0, 4) }),
    );
    expectError('errors.block.INVALID_ORIGIN', () =>
      makeContentBlock({ role: 'body', origin: '', source: bodySpan(0, 4) }),
    );
  });

  it('אמיתת גזירה: מזהה מזויף נדחה בבדיקה המבנית', () => {
    const block = makeContentBlock({ role: 'body', source: bodySpan(5, 9) });
    expect(isContentBlock(block)).toBe(true);
    const forged = { ...block, id: 'node:v1|other|body|5+9|src|0' };
    expect(isContentBlock(forged)).toBe(false);
    expect(isContentBlock(null)).toBe(false);
  });

  it('גזירת מזהים: דטרמיניזם והבחנה בין סוגי הקידומות', () => {
    const span = bodySpan(10, 20);
    expect(deriveNodeId(span, 0)).toBe(deriveNodeId(span, 0));
    expect(deriveNodeId(span, 1)).not.toBe(deriveNodeId(span, 0));
    expect(deriveNodeId(span, 0, 'insertion:toc')).not.toBe(deriveNodeId(span, 0));
    expect(deriveAnchorId(span, 0).startsWith('anchor:v1|')).toBe(true);
    expect(deriveAnchorId(span, 0)).not.toBe(deriveNodeId(span, 0));
    expect([...BLOCK_ROLES]).toEqual(['body', 'heading', 'custom', 'note-body']);
    expect(MAX_BLOCK_DEPTH).toBeGreaterThan(0);
  });
});
