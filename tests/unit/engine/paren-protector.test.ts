import { describe, it, expect } from 'vitest';
import {
  protectParens,
  hasOpenBracket,
  findMatchingCloseBracket,
  countBracketPairs,
} from '../../../src/worker/engine/paren-protector';
import type { FinalPage, Settings } from '../../../src/types';
import { defaultSettings } from '../../../src/lib/default-settings';

const settings: Settings = defaultSettings;

function makePage(rightBlocks: { content: string; height: number }[], leftBlocks: { content: string; height: number }[] = []): FinalPage {
  return {
    pageNumber: 1,
    pageType: 'regular',
    columns: [
      {
        index: 0,
        blocks: rightBlocks.map(b => ({ type: 'paragraph' as const, content: b.content, textType: 'body' as const, height: b.height, width: 100 })),
        height: rightBlocks.reduce((s, b) => s + b.height, 0),
        width: 100,
      },
      {
        index: 1,
        blocks: leftBlocks.map(b => ({ type: 'paragraph' as const, content: b.content, textType: 'body' as const, height: b.height, width: 100 })),
        height: leftBlocks.reduce((s, b) => s + b.height, 0),
        width: 100,
      },
    ],
  };
}

describe('paren-protector', () => {
  it('hasOpenBracket — מאוזן false, פתוח true', () => {
    expect(hasOpenBracket('טקסט רגיל')).toBe(false);
    expect(hasOpenBracket('טקסט [עם סוגריים]')).toBe(false);
    expect(hasOpenBracket('טקסט [פתוח')).toBe(true);
    expect(hasOpenBracket('text [outer [inner] more]')).toBe(false);
    expect(hasOpenBracket('text [outer [inner] more')).toBe(true);
  });

  it('findMatchingCloseBracket', () => {
    expect(findMatchingCloseBracket('abc[def]ghi', 3)).toBe(7);
    expect(findMatchingCloseBracket('a[b[c]d]e', 1)).toBe(7);
    expect(findMatchingCloseBracket('abc[def', 3)).toBe(-1);
  });

  it('countBracketPairs', () => {
    expect(countBracketPairs('a[b]c[d]e')).toBe(2);
    expect(countBracketPairs('a[b[c]d]e')).toBe(2);
    expect(countBracketPairs('abc')).toBe(0);
  });

  it('protectParens — לא מעביר כשאין פתוח', () => {
    const page = makePage(
      [{ content: 'פסקה ראשונה', height: 50 }, { content: 'פסקה שנייה', height: 50 }],
      [{ content: 'המשך', height: 50 }]
    );
    const result = protectParens([page], settings)[0]!;
    expect(result.columns[0]!.blocks.length).toBe(2);
    expect(result.columns[1]!.blocks.length).toBe(1);
  });

  it('protectParens — מעביר בלוק עם סוגר פתוח', () => {
    const page = makePage(
      [{ content: 'פסקה ראשונה', height: 50 }, { content: 'עם [סוגר פתוח', height: 50 }],
      [{ content: 'המשך', height: 50 }]
    );
    const result = protectParens([page], settings)[0]!;
    expect(result.columns[0]!.blocks.length).toBe(1);
    expect(result.columns[1]!.blocks.length).toBe(2);
  });

  it('protectParens — שומר על סך הבלוקים', () => {
    const page = makePage(
      [{ content: 'ראשונה', height: 50 }, { content: 'עם [פתוח', height: 50 }],
      [{ content: 'המשך', height: 50 }]
    );
    const totalBefore = page.columns[0]!.blocks.length + page.columns[1]!.blocks.length;
    const result = protectParens([page], settings)[0]!;
    const totalAfter = result.columns[0]!.blocks.length + result.columns[1]!.blocks.length;
    expect(totalAfter).toBe(totalBefore);
  });

  it('protectParens — לא קורס עם רשימה ריקה', () => {
    expect(protectParens([], settings)).toEqual([]);
  });

  it('protectParens — לא קורס עם טור יחיד', () => {
    const page: FinalPage = {
      pageNumber: 1, pageType: 'regular',
      columns: [{ index: 0, blocks: [], height: 0, width: 100 }],
    };
    expect(protectParens([page], settings).length).toBe(1);
  });
});
