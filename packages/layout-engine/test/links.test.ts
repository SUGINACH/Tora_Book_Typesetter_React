/**
 * links.test.ts — בדיקות שלב 72: מערכת הקישורים הסופית (אפיון §11, §14–15; פרק ט/M8).
 *
 * מה מוכח כאן:
 *   1. endnoteLinksOf — כל הערה ⇄ עוגן הגוף בשני הכיוונים, עם העמוד הפיזי
 *      מההצבה בפועל; המשכים מרובי-עמודים — קישור חזרה לכל הצבה מאותו
 *      עוגן; הפניה קדימה אחת לכל הערה.
 *   2. tocLinksOf — ערכי TOC ⇄ כותרות עם העמוד מה-AnchorTable; ערך בלי
 *      עוגן נדלג (הביקורת מדווחת).
 *   3. LinkTable — מזהים דטרמיניסטיים (נגזרים מהתוכן; סדר בנייה אינו משנה —
 *      linkMappingHash זהה); כפילויות/רשומות שגויות ⇒ issues; מדיניות
 *      קישורים חיצוניים (סכמות מותרות בלבד).
 *   4. שליליים — כיווניות שגויה ברשומה ⇒ issue; linkId זר ⇒ issue.
 */
import { describe, expect, test } from 'vitest';
import {
  type AnchorTable,
  type LinkEndpoint,
  type LinkRecord,
  buildLinkTable,
  buildAnchorTable,
  linkMappingHash,
  linkRecordIssues,
  externalLinkIssues,
  makeLinkId,
} from '@tora/layout-api';
import { asLu } from '@tora/layout-api';
import { layoutEndnoteFlow, type EndnoteEntry } from '../src/pagination/endnotes.js';
import { buildPageTemplateSet, type TemplateSetInput } from '../src/pagination/templates.js';
import { endnoteLinksOf, mergeLinkTables, tocLinksOf } from '../src/pagination/links.js';

const templates = buildPageTemplateSet({
  geometry: {
    pageWidth: asLu(4000000), pageHeight: asLu(5600000), margin: asLu(160000),
    mainX: asLu(400000), mainWidth: asLu(3200000), columnWidth: asLu(1520000),
    columnGap: asLu(160000), contentTop: asLu(160000), contentBottom: asLu(5440000),
  },
  headerHeightLu: asLu(0), footerHeightLu: asLu(0), columns: 2, footnoteColumns: 1,
  folioPosition: 'bottom_center', showFolio: false, sidenoteWidthLu: null,
} satisfies TemplateSetInput);

const note = (noteId: string, lines: number, blockId: string): EndnoteEntry => ({
  noteId,
  body: {
    noteId,
    lineHeightLu: Array.from({ length: lines }, () => asLu(150000)),
    heightLu: asLu(150000 * lines),
  },
  anchor: { blockId, lineId: `${blockId}:line-1` },
});

describe('שלב 72: endnoteLinksOf — קישורים הדדיים מזרם ה-endnotes', () => {
  test('כל הערה ⇄ עוגן הגוף בשני הכיוונים, עם העמוד הפיזי מההצבה בפועל', () => {
    const entries = [note('n1', 1, 'p1'), note('n2', 1, 'p2')];
    const flow = layoutEndnoteFlow(entries, templates, { bodyPageCount: 10 });
    const links = endnoteLinksOf(flow, entries);
    expect(links.issues).toEqual([]);
    expect(links.records).toHaveLength(4); // 2 קדימה + 2 חזרה
    const forward = links.records.filter((r) => r.kind === 'note');
    const back = links.records.filter((r) => r.kind === 'note-back');
    expect(forward).toHaveLength(2);
    expect(back).toHaveLength(2);
    for (const f of forward) {
      expect(f.source.kind).toBe('block');
      expect(f.source.id).toMatch(/^p[12]$/);
      expect(f.target.kind).toBe('note');
      expect(f.target.physicalPage).toBe(11); // bodyPageCount+1 — התוצאה בפועל
    }
  });

  test('הערה מפוצלת על פני עמודים — קישור חזרה לכל הצבה מאותו עוגן; הפניה קדימה אחת', () => {
    // הערה ארוכה מעמוד — נפרשת על 3 עמודי notes (ADR-005)
    const entries = [note('long-1', 60, 'p1')];
    const flow = layoutEndnoteFlow(entries, templates, { bodyPageCount: 5, notePolicy: { allowLongNoteSplit: true } });
    expect(flow.splits).toBeGreaterThan(0);
    const links = endnoteLinksOf(flow, entries);
    expect(links.issues).toEqual([]);
    const forward = links.records.filter((r) => r.kind === 'note');
    const back = links.records.filter((r) => r.kind === 'note-back');
    expect(forward).toHaveLength(1); // פעם אחת — ההצבה הראשונה
    expect(back.length).toBe(flow.placements.length); // לכל הצבה (כולל המשכים)
    // כל ההמשכים חוזרים לאותו עוגן גוף; ההמשך רשומה מוצבת של ממש (מזהה משלו)
    for (const b of back) {
      expect(b.target.id).toBe('p1');
      expect(b.source.id).toMatch(/^long-1(#cont)?$/);
    }
    // ההמשכים נושאים עמודים פיזיים שונים — מהתוצאה
    const pages = new Set(back.map((b) => b.source.physicalPage));
    expect(pages.size).toBe(flow.placements.length);
  });

  test('הערה בזרימה שאין לה ערך מקור — נדלגת בבנייה (הביקורת הסמנטית מדווחת)', () => {
    const entries = [note('n1', 1, 'p1')];
    const flow = layoutEndnoteFlow(entries, templates, { bodyPageCount: 3 });
    // מזינים רשימת מקור ריקה — אין עוגן ידוע להערה
    const links = endnoteLinksOf(flow, []);
    expect(links.records).toHaveLength(0);
  });
});

describe('שלב 72: tocLinksOf — TOC ⇄ כותרות מהעוגנים', () => {
  const anchors: AnchorTable = buildAnchorTable([
    { targetId: 'h1|1', kind: 'heading', pageKind: 'shaar', physicalPage: 1 },
    { targetId: 'h2|1', kind: 'heading', pageKind: 'body', physicalPage: 4 },
  ]);

  test('כל ערך ⇄ כותרת בשני הכיוונים עם העמוד מה-AnchorTable', () => {
    const links = tocLinksOf([{ targetId: 'h1|1' }, { targetId: 'h2|1' }], anchors);
    expect(links.issues).toEqual([]);
    expect(links.records).toHaveLength(4);
    const fwd = links.records.filter((r) => r.kind === 'toc');
    const h1fwd = fwd.find((r) => r.target.id === 'h1|1')!;
    expect(h1fwd.target.physicalPage).toBe(1);
    expect(h1fwd.target.pageKind).toBe('shaar');
    const back = links.records.filter((r) => r.kind === 'toc-back');
    expect(back).toHaveLength(2);
  });

  test('ערך בלי עוגן נדלג — הביקורת הסמנטית היא שתדווח', () => {
    const links = tocLinksOf([{ targetId: 'h1|1' }, { targetId: 'ghost-heading' }], anchors);
    expect(links.records).toHaveLength(2); // רק h1|1
    expect(links.records.every((r) => r.target.id === 'h1|1' || r.source.id === 'h1|1')).toBe(true);
  });
});

describe('שלב 72: LinkTable — דטרמיניזם, כפילויות, ולידציה, מדיניות חיצוניים', () => {
  const body: LinkEndpoint = { kind: 'block', id: 'p1' };
  const noteE: LinkEndpoint = { kind: 'note', id: 'n1', physicalPage: 7 };
  const fwd: LinkRecord = { linkId: makeLinkId('note', body, noteE), kind: 'note', source: body, target: noteE };
  const back: LinkRecord = { linkId: makeLinkId('note-back', noteE, body), kind: 'note-back', source: noteE, target: body };

  test('makeLinkId דטרמיניסטי — נגזר מהתוכן, לא מסדר ריצה', () => {
    expect(makeLinkId('note', body, noteE)).toBe(makeLinkId('note', { ...body }, { ...noteE }));
    expect(makeLinkId('note', body, noteE)).not.toBe(makeLinkId('note', noteE, body));
  });

  test('linkMappingHash זהה בכל סדר בנייה — ממוין לפי linkId', () => {
    const t1 = buildLinkTable([fwd, back]);
    const t2 = buildLinkTable([back, fwd]);
    expect(linkMappingHash(t1)).toBe(linkMappingHash(t2));
    // רשומה שונה ⇒ חתימה שונה
    const t3 = buildLinkTable([fwd]);
    expect(linkMappingHash(t3)).not.toBe(linkMappingHash(t1));
  });

  test('כפילות linkId ⇒ issue (לא שקט)', () => {
    const t = buildLinkTable([fwd, { ...fwd }]);
    expect(t.issues.some((i) => i.startsWith('duplicate:'))).toBe(true);
  });

  test('linkId זר — שאינו הנגזרת הקנונית ⇒ issue (אין ids תלויי סדר ריצה)', () => {
    const foreign: LinkRecord = { ...fwd, linkId: 'link:from-run-order:42' };
    expect(linkRecordIssues(foreign)).toContain('linkId:not-derived');
    expect(linkRecordIssues(fwd)).toEqual([]);
  });

  test('כיווניות שגויה לפי סוג ⇒ issue', () => {
    // note שמקורו אינו בלוק גוף
    const badDir: LinkRecord = { linkId: 'x', kind: 'note', source: noteE, target: body };
    expect(linkRecordIssues(badDir).some((i) => i.startsWith('note:'))).toBe(true);
    // external שאינו מכוון ל-url
    const badExt: LinkRecord = { linkId: 'y', kind: 'external', source: body, target: body };
    expect(linkRecordIssues(badExt)).toContain('external:target-not-url');
  });

  test('מדיניות קישורים חיצוניים — http/https בלבד; ריקים/רווחים/סכמות אסורות נדחים', () => {
    expect(externalLinkIssues('https://example.com/torah')).toEqual([]);
    expect(externalLinkIssues('http://example.com')).toEqual([]);
    expect(externalLinkIssues('javascript:alert(1)')).toContain('scheme:javascript');
    expect(externalLinkIssues('data:text/html,x')).toContain('scheme:data');
    expect(externalLinkIssues('file:///etc/passwd')).toContain('scheme:file');
    expect(externalLinkIssues('no-scheme-host')).toContain('url:no-scheme');
    expect(externalLinkIssues('https://exa mple.com')).toContain('url:whitespace');
  });

  test('mergeLinkTables — מיזוג endnotes+TOC; כפילות בין טבלאות מדווחת', () => {
    const entries = [note('n1', 1, 'p1')];
    const flow = layoutEndnoteFlow(entries, templates, { bodyPageCount: 2 });
    const a = endnoteLinksOf(flow, entries);
    const tocAnchors = buildAnchorTable([
      { targetId: 'h2|1', kind: 'heading', pageKind: 'body', physicalPage: 4 },
    ]);
    const b = tocLinksOf([{ targetId: 'h2|1' }], tocAnchors);
    const merged = mergeLinkTables([a, b]);
    expect(merged.issues).toEqual([]);
    expect(merged.records.length).toBe(a.records.length + b.records.length);
    const dup = mergeLinkTables([a, a]);
    expect(dup.issues.some((i) => i.startsWith('duplicate:'))).toBe(true);
  });
});
