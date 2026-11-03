/**
 * anchor-toc.test.ts — בדיקות שלב 70: AnchorTable ותוכן עניינים מדוד
 * (אפיו�ן §11.1; פרק ט/M8).
 *
 * מה מוכח כאן:
 *   1. AnchorTable ממסלול אמיתי: כל כותרת שהוצבה ⇐ עוגן ייחודי עם העמוד
 *      הפיזי האמיתי (כולל סוג העמוד — שער/גוף); הערות מ-anchorReport מתמזגות.
 *   2. anchorMappingHash — דטרמיניסטי ורגיש לשינוי עמוד/סוג/סדר (אות המשוב
 *      לנקודת השבת, שלב 71).
 *   3. זרימת ה-TOC: טור ימין מתמלא לפני שמאל (RTL; §14.2), קו אטום,
 *      ריבוי עמודים, mappingHash דטרמיניסטי ורגיש.
 *   4. שליליים: כפילות/שליליים ⇒ issues; שורת TOC שגויה ⇒ זריקה.
 */
import { describe, expect, test } from 'vitest';
import { asLu, DecisionLedgerBuilder } from '@tora/layout-api';
import { initialPaginationState, type PaginationState } from '../src/pagination/state.js';
import { buildPageTemplateSet, initialRemainingByRegion, type TemplateSetInput } from '../src/pagination/templates.js';
import { searchPages, type PageSearchResult } from '../src/pagination/search.js';
import {
  createPageCandidateSource,
  legacyHeadingBehaviorOf,
  type CandidateGeneratorInput,
  type PaginatedBlock,
  type PaginatedLine,
} from '../src/pagination/candidates.js';
import { anchorTableOfPath } from '../src/pagination/anchors.js';
import { layoutTocFlow, tocLineIssues, tocTotalHeightLu, type TocLine } from '../src/pagination/toc.js';
import { anchorMappingHash, buildAnchorTable } from '@tora/layout-api';

let lineSeq = 0;
const LINE = (heightLu: number): PaginatedLine => Object.freeze({
  id: `line-${lineSeq++}`,
  heightLu: asLu(heightLu),
  footnoteRefs: [],
  sidenoteRefs: [],
});
const block = (blockId: string, lines: readonly PaginatedLine[], extra: Partial<PaginatedBlock> = {}): PaginatedBlock =>
  Object.freeze({ blockId, role: 'body', lines: Object.freeze([...lines]), ...extra });
const h = (blockId: string, heightLu: number, level: number): PaginatedBlock =>
  block(blockId, [LINE(heightLu)], { role: 'heading', headingLevel: level });

const templates = buildPageTemplateSet({
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
} satisfies TemplateSetInput);

function runFlow(blocks: readonly PaginatedBlock[]): { initial: PaginationState; res: PageSearchResult } {
  const initial = initialPaginationState({
    firstBlockId: blocks[0]!.blockId,
    remainingByRegion: initialRemainingByRegion(templates.for('body', 1), 1),
    pageKind: 'body',
  });
  const res = searchPages(initial, createPageCandidateSource({
    blocks, templates, pageKind: 'body', headingBehaviorOf: legacyHeadingBehaviorOf,
  } satisfies CandidateGeneratorInput), new DecisionLedgerBuilder('off'), {});
  return { initial, res };
}

describe('שלב 70: AnchorTable — עוגנים אמיתיים מהמסלול (§11.1)', () => {
  const blocks: readonly PaginatedBlock[] = [
    block('p0', [LINE(150000), LINE(150000)]),
    h('h1|1', 300000, 1),
    block('p1', [LINE(150000), LINE(150000)]),
    h('h2|1', 200000, 2),
    block('p2', [LINE(150000), LINE(150000)]),
  ];

  test('כל כותרת שהוצבה ⇐ עוגן ייחודי עם העמוד הפיזי האמיתי וסוג העמוד', () => {
    const { initial, res } = runFlow(blocks);
    expect(res.status).toBe('complete');
    const table = anchorTableOfPath(initial, res.path, blocks);
    expect(table.issues).toEqual([]);
    const h1 = table.byId.get('h1|1');
    const h2 = table.byId.get('h2|1');
    expect(h1).toBeDefined();
    expect(h2).toBeDefined();
    // H1 פותחת עמוד שער (sub-shaar; §10.1) — סוג העמוד נרשם לפוליו
    expect(h1!.pageKind).toBe('sub-shaar');
    expect(h1!.kind).toBe('heading');
    expect(h1!.physicalPage).toBeGreaterThanOrEqual(2);
    // H2 בגוף, אחרי השער
    expect(h2!.pageKind).toBe('body');
    expect(h2!.physicalPage).toBeGreaterThan(h1!.physicalPage);
    // ייחודיות: מספר הרשומות = מספר הכותרות שהוצבו
    expect(table.records.length).toBe(2);
  });

  test('הערות מ-anchorReport מתמזגות לטבלה (קישורים הדדיים; §10.3)', () => {
    const { initial, res } = runFlow(blocks);
    const table = anchorTableOfPath(initial, res.path, blocks, { 'fn-1': 7, 'en-2': 9 });
    expect(table.issues).toEqual([]);
    expect(table.byId.get('fn-1')).toMatchObject({ kind: 'note', pageKind: 'notes', physicalPage: 7 });
    expect(table.byId.get('en-2')).toMatchObject({ kind: 'note', physicalPage: 9 });
    expect(table.records.length).toBe(4);
  });

  test('anchorMappingHash — דטרמיניסטי ורגיש לעמוד/סוג (אות המשוב לנקודת השבת)', () => {
    const { initial, res } = runFlow(blocks);
    const t1 = anchorTableOfPath(initial, res.path, blocks);
    const t2 = anchorTableOfPath(initial, res.path, blocks);
    expect(anchorMappingHash(t1)).toBe(anchorMappingHash(t2));
    const moved = buildAnchorTable(t1.records.map((r) => (r.targetId === 'h2|1' ? { ...r, physicalPage: r.physicalPage + 1 } : r)));
    expect(anchorMappingHash(moved)).not.toBe(anchorMappingHash(t1));
    const kindChanged = buildAnchorTable(t1.records.map((r) => (r.targetId === 'h1|1' ? { ...r, pageKind: 'body' as const } : r)));
    expect(anchorMappingHash(kindChanged)).not.toBe(anchorMappingHash(t1));
  });

  test('שליליים: כפילות targetId או עמוד שלילי ⇒ issues (לא זריקה שקטה)', () => {
    const bad = buildAnchorTable([
      { targetId: 'x', kind: 'heading', pageKind: 'body', physicalPage: 2 },
      { targetId: 'x', kind: 'heading', pageKind: 'body', physicalPage: 3 },
      { targetId: 'y', kind: 'note', pageKind: 'notes', physicalPage: -1 },
    ]);
    expect(bad.issues.some((i) => i.startsWith('duplicate:'))).toBe(true);
    expect(bad.issues.some((i) => i.startsWith('physicalPage:'))).toBe(true);
    expect(anchorMappingHash(bad)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('שלב 70: זרימת ה-TOC — תוכן מעומד ומדוד (§11.1)', () => {
  const LINE_H = 120000;
  const lines = (n: number): readonly TocLine[] => Array.from({ length: n }, (_, i) => ({ entryId: `e-${i}`, heightLu: asLu(LINE_H) }));

  test('טור ימין (0) מתמלא לפני שמאל (1) — RTL; קו אטום; עמוד חדש בגלישה', () => {
    // טור בגובה 10 קווים, שני טורים ⇒ 20 קווים בעמוד הראשון
    const colH = asLu(LINE_H * 10);
    const r = layoutTocFlow(lines(25), { startPhysicalPage: 2, columnHeightLu: colH, columns: 2 });
    expect(r.pages).toBe(2);
    expect(r.firstPhysicalPage).toBe(2);
    const first = r.placements.filter((p) => p.physicalPage === 2);
    const second = r.placements.filter((p) => p.physicalPage === 3);
    expect(first.length).toBe(20);
    expect(second.length).toBe(5);
    // הקווים הראשונים בטור הימני (0), אחר כך שמאל (1)
    expect(first.filter((p) => p.columnIndex === 0).length).toBe(10);
    expect(first.filter((p) => p.columnIndex === 1).length).toBe(10);
    expect(first[0]!.columnIndex).toBe(0);
    expect(first[10]!.columnIndex).toBe(1);
    // העמוד השני מתחיל שוב בימין
    expect(second[0]!.columnIndex).toBe(0);
    // סדר הקווים נשמר
    for (let i = 0; i < r.placements.length; i++) expect(r.placements[i]!.lineIndex).toBe(i);
  });

  test('קו גבוה מהטור בעמוד ריק — נכנס לבדו (אין לולאה); עמוד אחד כשהכל נכנס', () => {
    const colH = asLu(LINE_H * 5);
    const tall = [{ entryId: 'tall', heightLu: asLu(LINE_H * 20) }];
    const r = layoutTocFlow(tall, { startPhysicalPage: 1, columnHeightLu: colH, columns: 1 });
    expect(r.pages).toBe(1);
    expect(r.placements[0]).toMatchObject({ entryId: 'tall', physicalPage: 1, columnIndex: 0 });
    const small = layoutTocFlow(lines(5), { startPhysicalPage: 1, columnHeightLu: colH, columns: 1 });
    expect(small.pages).toBe(1);
  });

  test('mappingHash דטרמיניסטי ורגיש לעמוד של ערך אחד; tocTotalHeightLu', () => {
    const opts = { startPhysicalPage: 2, columnHeightLu: asLu(LINE_H * 10), columns: 2 } as const;
    const a = layoutTocFlow(lines(15), opts);
    const b = layoutTocFlow(lines(15), opts);
    expect(a.mappingHash).toBe(b.mappingHash);
    const shifted = layoutTocFlow(lines(15), { ...opts, startPhysicalPage: 3 });
    expect(shifted.mappingHash).not.toBe(a.mappingHash);
    expect(tocTotalHeightLu(lines(5))).toBe(asLu(LINE_H * 5));
  });

  test('שליליים: שורה שגויה (entryId ריק/גובה שלילי) או אפשרויות שגויות ⇒ זריקה מפורשת', () => {
    expect(tocLineIssues({ entryId: '', heightLu: asLu(100) })).toContain('entryId');
    expect(tocLineIssues({ entryId: 'x', heightLu: asLu(-5) })).toContain('heightLu');
    expect(() => layoutTocFlow([{ entryId: 'x', heightLu: asLu(-5) }], { startPhysicalPage: 1, columnHeightLu: asLu(1000), columns: 1 })).toThrowError(/TOC/);
    expect(() => layoutTocFlow(lines(2), { startPhysicalPage: 0, columnHeightLu: asLu(1000), columns: 1 })).toThrowError();
    expect(() => layoutTocFlow(lines(2), { startPhysicalPage: 1, columnHeightLu: asLu(0), columns: 1 })).toThrowError();
    expect(() => layoutTocFlow(lines(2), { startPhysicalPage: 1, columnHeightLu: asLu(1000), columns: 3 as 1 })).toThrowError();
  });
});
