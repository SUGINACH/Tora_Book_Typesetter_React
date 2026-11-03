/**
 * toc.test.ts — בדיקות שלב 70: ערכי תוכן העניינים מהעוגנים בלבד (§11.1; M8).
 *
 * מה מוכח כאן:
 *   1. המדיניות מההגדרות (enable-general/detailed, מספור) — כולל ערכי
 *      ברירת מחדל נעולים.
 *   2. הכללי = חלקים (H1); המפורט = סימנים (H2); מספור גימטרי.
 *   3. הפוליו מהעוגן בלבד: עמוד שער ⇒ printed=null עם logical (ה-TOC
 *      מציג את הלוגי); גוף ⇒ גימטריה/מספרים לפי page-num-format.
 *   4. כותרת בלי עוגן ⇒ בעיה מדווחת + השמטה מפורשת — אין מספר מנוחש.
 *   5. דטרמיניזם.
 */
import { describe, expect, it } from 'vitest';
import { buildAnchorTable, type AnchorTable, type TorahDocument } from '@tora/layout-api';
import { folioPolicyOf } from '../src/folio.js';
import { tocEntriesOf, tocPolicyOf } from '../src/toc.js';

const mk = (values: Record<string, unknown> = {}): { readonly values: Readonly<Record<string, unknown>> } => ({ values });

const DOC: TorahDocument = {
  schemaVersion: 1,
  documentId: 'toc-test',
  metadata: [],
  parts: [
    {
      id: 'part:1', title: 'חלק ראשון',
      simanim: [
        {
          id: 'siman:1', simanNumber: 1,
          blocks: [
            { id: 'h1:1', role: 'heading', headingLevel: 1, inline: [{ kind: 'text', text: 'חלק ראשון' }], styleId: 'x', source: null as never, ordinal: 0 },
            { id: 'h2:1', role: 'heading', headingLevel: 2, inline: [{ kind: 'text', text: 'פתיחת החלק' }], styleId: 'x', source: null as never, ordinal: 1 },
          ],
        },
        {
          id: 'siman:2', simanNumber: 2,
          blocks: [
            { id: 'h2:2', role: 'heading', headingLevel: 2, inline: [{ kind: 'text', text: 'המשך העניינים' }], styleId: 'x', source: null as never, ordinal: 0 },
          ],
        },
      ],
    },
    {
      id: 'part:2', title: 'חלק שני',
      simanim: [
        {
          id: 'siman:3', simanNumber: 1,
          blocks: [
            { id: 'h1:2', role: 'heading', headingLevel: 1, inline: [{ kind: 'text', text: 'חלק שני' }], styleId: 'x', source: null as never, ordinal: 0 },
            { id: 'h2:3', role: 'heading', headingLevel: 2, inline: [{ kind: 'text', text: 'תחילת החלק' }], styleId: 'x', source: null as never, ordinal: 1 },
          ],
        },
      ],
    },
  ],
  notes: { footnotes: [], endnotes: [], sidenotes: [], editorial: [] },
  customStyleIds: [],
  sourceHash: 'a'.repeat(64),
  sourceLength: 100,
} as unknown as TorahDocument;

const ANCHORS: AnchorTable = buildAnchorTable([
  { targetId: 'h1:1', kind: 'heading', pageKind: 'sub-shaar', physicalPage: 3 },
  { targetId: 'h2:1', kind: 'heading', pageKind: 'body', physicalPage: 4 },
  { targetId: 'h2:2', kind: 'heading', pageKind: 'body', physicalPage: 9 },
  { targetId: 'h1:2', kind: 'heading', pageKind: 'sub-shaar', physicalPage: 12 },
  { targetId: 'h2:3', kind: 'heading', pageKind: 'body', physicalPage: 13 },
]);

describe('שלב 70: toc — ערכי TOC מהעוגנים בלבד', () => {
  it('tocPolicyOf: ברירות המחדל הנעולות (שני התוכנים דלוקים, מספור דלוק) וניתוח ערכים', () => {
    const p = tocPolicyOf(mk());
    expect(p).toEqual({ general: true, detailed: true, generalNumbering: true, detailedNumbering: true });
    const off = tocPolicyOf(mk({ 'enable-general-toc': 'false', 'enable-detailed-toc': false, 'general-toc-count-numbering': 'false', 'detailed-toc-count-numbering': false }));
    expect(off).toEqual({ general: false, detailed: false, generalNumbering: false, detailedNumbering: false });
  });

  it('הכללי = חלקים (H1) עם מספור גימטרי; המפורט = סימנים (H2) — שניהם מהעוגנים', () => {
    const r = tocEntriesOf(DOC, tocPolicyOf(mk()), ANCHORS, folioPolicyOf(mk()));
    expect(r.issues).toEqual([]);
    const general = r.entries.filter((e) => e.level === 1);
    const detailed = r.entries.filter((e) => e.level === 2);
    expect(general.length).toBe(2);
    expect(detailed.length).toBe(3);
    expect(general[0]!.title).toBe('א — חלק ראשון');
    expect(general[1]!.title).toBe('ב — חלק שני');
    expect(detailed[0]!.title).toBe('סימן א — פתיחת החלק');
    expect(detailed[1]!.title).toBe('סימן ב — המשך העניינים');
    expect(detailed[2]!.title).toBe('סימן א — תחילת החלק');
  });

  it('פוליו מהעוגן בלבד: עמוד שער ⇒ printed=null + logical (ה-TOC מציג את הלוגי); גוף ⇒ גימטריה', () => {
    const r = tocEntriesOf(DOC, tocPolicyOf(mk()), ANCHORS, folioPolicyOf(mk()));
    const h1 = r.entries.find((e) => e.targetId === 'h1:1')!;
    expect(h1.folio).toEqual({ logical: 3, printed: null }); // sub-shaar — לא מודפס, לוגי קיים
    const h2 = r.entries.find((e) => e.targetId === 'h2:2')!;
    expect(h2.folio).toEqual({ logical: 9, printed: 'ט' }); // גימטריה של 9
    // page-num-format=numbers ⇒ מספרים
    const nums = tocEntriesOf(DOC, tocPolicyOf(mk()), ANCHORS, folioPolicyOf(mk({ 'page-num-format': 'numbers' })));
    expect(nums.entries.find((e) => e.targetId === 'h2:2')!.folio).toEqual({ logical: 9, printed: '9' });
  });

  it('מספור כבוי ⇒ בלי קידומת; תוכנית כבוי ⇒ אין ערכים מאותה רמה', () => {
    const noNum = tocEntriesOf(DOC, tocPolicyOf(mk({ 'general-toc-count-numbering': 'false', 'detailed-toc-count-numbering': 'false' })), ANCHORS, folioPolicyOf(mk()));
    expect(noNum.entries.find((e) => e.targetId === 'h1:1')!.title).toBe('חלק ראשון');
    expect(noNum.entries.find((e) => e.targetId === 'h2:1')!.title).toBe('פתיחת החלק');
    const noGeneral = tocEntriesOf(DOC, tocPolicyOf(mk({ 'enable-general-toc': 'false' })), ANCHORS, folioPolicyOf(mk()));
    expect(noGeneral.entries.every((e) => e.level === 2)).toBe(true);
    const noDetailed = tocEntriesOf(DOC, tocPolicyOf(mk({ 'enable-detailed-toc': 'false' })), ANCHORS, folioPolicyOf(mk()));
    expect(noDetailed.entries.every((e) => e.level === 1)).toBe(true);
  });

  it('כותרת בלי עוגן ⇒ בעיה מדווחת + השמטה מפורשת — לעולם לא מספר מנוחש', () => {
    const partial = buildAnchorTable([
      { targetId: 'h1:1', kind: 'heading', pageKind: 'sub-shaar', physicalPage: 3 },
      { targetId: 'h2:1', kind: 'heading', pageKind: 'body', physicalPage: 4 },
    ]);
    const r = tocEntriesOf(DOC, tocPolicyOf(mk()), partial, folioPolicyOf(mk()));
    expect(r.entries.length).toBe(2);
    expect(r.issues.some((i) => i.includes('h1:2') && i.includes('אין עוגן'))).toBe(true);
    expect(r.issues.some((i) => i.includes('h2:2') && i.includes('אין עוגן'))).toBe(true);
    // חלק בלי בלוק H1 כלל — בעיה ייעודית
    const docNoH1 = { ...DOC, parts: [{ ...DOC.parts[0]!, simanim: [{ ...DOC.parts[0]!.simanim[0]!, blocks: [] }] }] } as TorahDocument;
    const r2 = tocEntriesOf(docNoH1, tocPolicyOf(mk()), ANCHORS, folioPolicyOf(mk()));
    expect(r2.issues.some((i) => i.includes('אין בלוק כותרת H1'))).toBe(true);
  });

  it('דטרמיניזם: אותם קלטים ⇒ אותם ערכים ביט-לביט', () => {
    const a = tocEntriesOf(DOC, tocPolicyOf(mk()), ANCHORS, folioPolicyOf(mk()));
    const b = tocEntriesOf(DOC, tocPolicyOf(mk()), ANCHORS, folioPolicyOf(mk()));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
