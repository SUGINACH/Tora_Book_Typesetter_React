/**
 * ir.test.ts — בדיקות שלב 31: ה־Layout IR המלא (§6.5).
 *
 * מה מוכח כאן:
 *   1. parse/serialize משמר layoutHash (סבב מלא + ביט-ביט).
 *   2. אימות references: regionId/anchorId/itemId בלתי-מזוהים נתפסים;
 *      כפילויות מזהים; parity/physicalIndex לא-עוקבת; קו מחוץ לאזור.
 *   3. immutability: הקפאה עמוקה — מוטציה נזרקת (strict mode).
 *   4. היטל LU→CSS px רציונלי (בדיוק 4/3 px לפוינט).
 */
import { describe, expect, test } from 'vitest';
import {
  A4,
  createLayoutDocument,
  isLayoutDocument,
  layoutDocumentIssues,
  layoutHash,
  luToCssPx,
  mmToLu,
  parseLayoutDocument,
  ptToLu,
  serializeLayoutDocument,
  type LayoutDocument,
  type PositionedRun,
} from '@tora/layout-api';
import { makeTextAtom, makeTorahDocument } from '@tora/content-model';
import type { Rect } from '@tora/measurement-api';

const FONT = Object.freeze({
  fontId: 'guttman-rashi-normal',
  contentSha256: 'a'.repeat(64),
  family: 'Guttman Rashi',
  weight: 400,
  style: 'normal' as const,
});

function rect(x: number, y: number, w: number, h: number): Rect {
  return { x: x as never, y: y as never, width: w as never, height: h as never };
}

function makeRun(id: string, startLu: number, widthLu: number, atomIds: readonly string[], text = 'אבג'): PositionedRun {
  return {
    kind: 'run',
    id,
    font: FONT,
    fontSizeLu: ptToLu(12),
    direction: 'rtl',
    startLu: startLu as never,
    widthLu: widthLu as never,
    text,
    glyphs: atomIds.map((atomId, i) => ({
      glyphId: 10 + i,
      atomId,
      clusterAtomIndex: i,
      advanceLu: Math.floor(widthLu / atomIds.length) as never,
      xOffsetLu: 0 as never,
      yOffsetLu: 0 as never,
    })),
    atomIds,
    requestHash: 'b'.repeat(64),
  };
}

interface DocParts {
  pages?: number;
  runsPerLine?: number;
  badRegionId?: boolean;
  duplicatePageId?: boolean;
  breakParity?: boolean;
  skipPhysical?: boolean;
  lineOutsideRegion?: boolean;
  anchorUnresolved?: boolean;
  duplicateItemId?: boolean;
}

function buildDoc(parts: DocParts = {}): LayoutDocument {
  const {
    pages = 1,
    runsPerLine = 1,
    badRegionId = false,
    duplicatePageId = false,
    breakParity = false,
    skipPhysical = false,
    lineOutsideRegion = false,
    anchorUnresolved = false,
    duplicateItemId = false,
  } = parts;
  const allPages = [];
  for (let pi = 1; pi <= pages; pi++) {
    const id = duplicatePageId && pi === 2 ? 'page:1' : `page:${pi}`;
    const physical = skipPhysical && pi === 2 ? 3 : pi;
    const parity = breakParity && pi === 1 ? 'verso' : (physical % 2 === 1 ? 'recto' : 'verso');
    const items = [] as Record<string, unknown>[];
    const lineId = duplicateItemId && pi === 2 ? 'item:page:1:line:0:1' : `item:page:${pi}:line:0:1`;
    const regionId = badRegionId && pi === 1 ? 'region:missing' : `region:page:${pi}:col:0`;
    const runWidth = 200000;
    const lineRect = lineOutsideRegion && pi === 1
      ? rect(0, 0, 100000000, 300000) // בחוץ מהאזור (האזור נמצא במלבן העמוד הפנימי)
      : rect(200000, 300000, 7000000, 300000);
    const runs: PositionedRun[] = [];
    for (let ri = 0; ri < runsPerLine; ri++) {
      runs.push(makeRun(`run:${pi}:${ri}`, ri === 0 ? 0 : 1000000 * ri, runWidth, [`atom:a:${pi}`], 'אבג'));
    }
    items.push({
      kind: 'line',
      id: lineId,
      blockId: 'node:v1|doc|body|0+10|src|0',
      fragmentIndex: 0,
      lineIndex: 0,
      regionId,
      rect: lineRect,
      baseline: (lineRect.y + Math.floor(lineRect.height / 2)) as never,
      runs,
      sourceSpans: [],
      breakReason: 'fit',
      continuation: 'whole',
    });
    allPages.push({
      id,
      physicalIndex: physical,
      parity,
      kind: 'body',
      size: { width: A4.width, height: A4.height },
      regions: badRegionId && pi === 1 ? [] : [{
        id: `region:page:${pi}:col:0`, kind: 'body-column', rect: rect(200000, 300000, 7000000, 9000000), columnIndex: 0,
      }],
      items,
    });
  }
  return {
    schemaVersion: 1,
    policyId: 'torah-v1',
    pages: allPages,
    anchors: [
      {
        anchorId: anchorUnresolved ? 'anchor:ghost' : 'anchor:1',
        pageId: 'page:1',
        regionId: anchorUnresolved ? 'region:ghost' : 'region:page:1:col:0',
      },
    ],
    transformations: [],
  } as unknown as LayoutDocument;
}

describe('שלב 31: Layout IR — סריאליזציה קנונית', () => {
  test('parse/serialize משמר layoutHash (סבב מלא, ביט-ביט)', () => {
    const doc = createLayoutDocument(buildDoc({ pages: 3, runsPerLine: 2 }));
    const s1 = serializeLayoutDocument(doc);
    const parsed = parseLayoutDocument(s1);
    const s2 = serializeLayoutDocument(parsed);
    expect(s2).toBe(s1);
    expect(layoutHash(doc)).toBe(layoutHash(parsed));
  });

  test('סדר המפתחות בבנייה שונה — אותם bytes קנוניים ואותו hash', () => {
    const a = createLayoutDocument(buildDoc({ pages: 2 }));
    const raw = JSON.parse(JSON.stringify(a)) as Record<string, unknown>;
    // היפוך סדר המפתחות בכל הרמות (מה ש-JSON.parse של אובייקט שנבנה אחרת עלול לתת)
    const rev = JSON.parse(JSON.stringify(a), (k, v) => (typeof v === 'object' && v !== null && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v as Record<string, unknown>).reverse())
      : v)) as unknown;
    const b = createLayoutDocument(rev);
    expect(serializeLayoutDocument(b)).toBe(serializeLayoutDocument(a));
    expect(layoutHash(b)).toBe(layoutHash(a));
    expect(raw).toBeTruthy();
  });

  test('bytes קנוניים — אין רווחים מבניים (בדיקה על מסמך ללא רווחים בתוכן)', () => {
    const doc = createLayoutDocument(buildDoc()); // תוכן: 'אבג', משפחה בפונט — בדיקת המבנה בלבד
    const s = serializeLayoutDocument(doc);
    expect(s.startsWith('{"')).toBe(true);
    expect(s.endsWith('}')).toBe(true);
    // מפתחות וערכים נפרדים בפסיק/נקודתיים ללא רווחים (canonicalJson)
    const noFont = s.replace(/"family":"[^"]*"/g, '"family":"F"').replace(/"text":"[^"]*"/g, '"text":"T"');
    expect(noFont).not.toContain(': ');
    expect(noFont).not.toContain(', ');
  });
});

describe('שלב 31: אימות references ומבנה', () => {
  test('מסמך תקין עובר', () => {
    const doc = buildDoc({ pages: 2 });
    expect(layoutDocumentIssues(doc)).toEqual([]);
    expect(isLayoutDocument(doc)).toBe(true);
  });

  test('regionId בלתי-מזוהה נתפס', () => {
    const issues = layoutDocumentIssues(buildDoc({ badRegionId: true }));
    expect(issues.some((s) => s.includes('regionId:unresolved'))).toBe(true);
  });

  test('כפילות מזהה עמוד נתפסת', () => {
    expect(layoutDocumentIssues(buildDoc({ pages: 2, duplicatePageId: true })).some((s) => s.includes('id:duplicate'))).toBe(true);
  });

  test('physicalIndex לא-עוקב נתפס', () => {
    expect(layoutDocumentIssues(buildDoc({ pages: 2, skipPhysical: true })).some((s) => s.includes('not-sequential'))).toBe(true);
  });

  test('parity שגוי נתפס', () => {
    expect(layoutDocumentIssues(buildDoc({ breakParity: true })).some((s) => s.includes('.parity'))).toBe(true);
  });

  test('קו מחוץ לאזורו נתפס', () => {
    expect(layoutDocumentIssues(buildDoc({ lineOutsideRegion: true })).some((s) => s.includes('outside-region'))).toBe(true);
  });

  test('עוגן לאזור רפא נתפס', () => {
    expect(layoutDocumentIssues(buildDoc({ anchorUnresolved: true })).some((s) => s.includes('anchors[0].regionId:unresolved'))).toBe(true);
  });

  test('כפילות מזהה פריט נתפסת', () => {
    expect(layoutDocumentIssues(buildDoc({ pages: 2, duplicateItemId: true })).some((s) => s.includes('id:duplicate'))).toBe(true);
  });

  test('עמודים ריקים נדחים', () => {
    expect(layoutDocumentIssues({ schemaVersion: 1, policyId: 'torah-v1', pages: [], anchors: [], transformations: [] }))
      .toContain('pages:empty');
  });

  test('run חורג מרוחב הקו — ה-IR תקין מבנית (הגלישה נבדקת על ידי הביקורת הגאומטרית)', () => {
    const doc = buildDoc() as unknown as Record<string, unknown>;
    const line = (doc.pages as Record<string, unknown>[])[0]!.items![0]! as Record<string, unknown>;
    (line.runs as Record<string, unknown>[])[0]!.startLu = 6900000;
    expect(layoutDocumentIssues(doc)).toEqual([]);
  });

  test('ריצות חופפות נתפסות', () => {
    const doc = buildDoc({ runsPerLine: 3 }) as unknown as Record<string, unknown>;
    const line = (doc.pages as Record<string, unknown>[])[0]!.items![0]! as Record<string, unknown>;
    const runs = line.runs as Record<string, unknown>[];
    runs[1]!.startLu = 0; // חופף לריצה 0
    expect(layoutDocumentIssues(doc)).toEqual(expect.arrayContaining([expect.stringContaining('startLu:overlap')]));
  });

  test('createLayoutDocument זורק עם קוד מקוטלג', () => {
    try {
      createLayoutDocument(buildDoc({ badRegionId: true }));
      expect.unreachable();
    } catch (e) {
      expect((e as { catalogKey?: string }).catalogKey).toBe('errors.layoutir.INVALID_DOCUMENT');
    }
  });
});

describe('שלב 31: immutability', () => {
  test('הקפאה עמוקה — מוטציה נזרקת', () => {
    const doc = createLayoutDocument(buildDoc({ pages: 2 }));
    expect(() => {
      (doc as unknown as Record<string, unknown>)['policyId'] = 'changed';
    }).toThrow();
    const page = doc.pages[0]!;
    expect(() => {
      (page as unknown as Record<string, unknown>)['id'] = 'x';
    }).toThrow();
    const run = (doc.pages[0]!.items[0] as { runs: readonly PositionedRun[] }).runs[0]!;
    expect(() => {
      (run as unknown as Record<string, unknown>)['text'] = 'x';
    }).toThrow();
    expect(Object.isFrozen(page)).toBe(true);
    expect(Object.isFrozen(run)).toBe(true);
  });

  test('parse מקפיא אף הוא', () => {
    const doc = parseLayoutDocument(serializeLayoutDocument(createLayoutDocument(buildDoc())));
    expect(Object.isFrozen(doc.pages[0])).toBe(true);
  });
});

describe('שלב 31: היטל LU→CSS px', () => {
  test('רציונלי בדיוק: 1pt = 4/3px', () => {
    expect(luToCssPx(ptToLu(12))).toBe(16);
    expect(luToCssPx(ptToLu(3))).toBe(4);
  });

  test('A4 = 210mm ⇐ 793.7px… מעוגל ב-roundDiv', () => {
    // 210mm = 595.275…pt ⇒ px = roundDiv(lu, 49152)
    const w = luToCssPx(mmToLu(210));
    expect(w).toBeGreaterThan(790);
    expect(w).toBeLessThan(795);
  });
});
