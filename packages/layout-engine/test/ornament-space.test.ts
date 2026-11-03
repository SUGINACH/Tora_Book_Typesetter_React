/**
 * ornament-space.test.ts — בדיקות שלב 69: השפעת עיטורים על המקום הזמין
 * (אפיון §11.2, §14; פרק ט/M8).
 *
 * מה מוכח כאן:
 *   1. **אזור בטוח מהעיצוב ⇒ custom-box**: תבנית שער עם safeArea בונה את
 *      תיבת הטקסט מהשברים — דרך הפרימיטיבים של units (quantizeSetting×גאומטריה,
 *      roundDiv יחיד; ADR-001) — ולא מהשוליים הקבועים.
 *   2. **נפילה מתועדת**: אין safeArea (חסר/תיבה מנוונת שחיתוכה ריק) ⇒ תיבת
 *      השוליים הקבועה — בדיוק כמו לפני שלב 69 (וכמו הרנדרר הישן).
 *   3. **אימות**: safeArea שוברי [0,1] עם ממדים חיוביים — אחרת התבנית נדחית.
 *   4. **זרימה**: H1 על תבנית שער עם אזור בטוח צר — הכותרת בתוך התיבה;
 *      כותרת גבוהה מהתיבה ⇒ כשל מפורש (אין גלישה שקטה על הרקע).
 *   5. **מפריד סוף-פרק נמדד** (chapterEndDividerLuOf): none ⇒ 0; 28px ⇒
 *      מ"מ פיזיים ← LU; ערך פסול ⇒ ברירת המחדל הנעולה. הצריכה בתוך המועמד
 *      נבדקה בשלב 66 — כאן המדידה.
 *   6. **Metamorphic on/off**: עיטורי H2 והמפריד דלוקים מול כבויים — אותם
 *      בלוקים בדיוק מוצבים בשני המסלולים (אין אובדן תוכן); ההבדל מותר
 *      בפריסה בלבד (§11.2 — "ההבדל מותר רק באזורים ובפריסה הצפויה").
 */
import { describe, expect, test } from 'vitest';
import { asLu, DecisionLedgerBuilder, mmToLu } from '@tora/layout-api';
import { initialPaginationState, type PaginationState } from '../src/pagination/state.js';
import { buildPageTemplateSet, initialRemainingByRegion, type TemplateSetInput, type TemplateAssetRef } from '../src/pagination/templates.js';
import { searchPages, type PageSearchResult } from '../src/pagination/search.js';
import {
  createPageCandidateSource,
  type CandidateGeneratorInput,
  type PaginatedBlock,
  type PaginatedLine,
} from '../src/pagination/candidates.js';
import { legacyHeadingBehaviorOf } from '../src/pagination/heading-defaults.js';
import { chapterEndDividerLuOf, CSS_PX_MM, DEFAULT_SECDIV_H_PX, safeAreaOf } from '@tora/policy-torah';
import type { EffectiveSettings } from '@tora/layout-api';

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

const GEOMETRY = {
  pageWidth: asLu(4000000), pageHeight: asLu(5600000), margin: asLu(160000),
  mainX: asLu(400000), mainWidth: asLu(3200000), columnWidth: asLu(1520000),
  columnGap: asLu(160000), contentTop: asLu(160000), contentBottom: asLu(5440000),
};
const BASE_INPUT: TemplateSetInput = {
  geometry: GEOMETRY,
  headerHeightLu: asLu(0),
  footerHeightLu: asLu(0),
  columns: 2,
  footnoteColumns: 1,
  folioPosition: 'bottom_center',
  showFolio: false,
  sidenoteWidthLu: null,
};
const SHA1 = '4ac3285bbd68337f25a9cdcc157a36efaac1448e0d6ce9ede963f2b0c3acda5b';
const asset = (safeArea: TemplateAssetRef['safeArea']): TemplateAssetRef => ({
  assetId: 'shaar:v2|main|4ac3285bbd68337f#0',
  sha256: SHA1,
  viewBox: { width: 2000, height: 2880 },
  safeArea,
});

const mkSettings = (values: Record<string, unknown> = {}): EffectiveSettings =>
  ({ schemaVersion: 1, enginePolicyId: 'torah-v1', values, configHash: 'test' });

function runFlow(
  blocks: readonly PaginatedBlock[],
  templates: ReturnType<typeof buildPageTemplateSet>,
  extra: Partial<CandidateGeneratorInput> = {},
): PageSearchResult {
  const initial: PaginationState = initialPaginationState({
    firstBlockId: blocks[0]!.blockId,
    remainingByRegion: initialRemainingByRegion(templates.for('body', 1), 1),
    pageKind: 'body',
  });
  return searchPages(initial, createPageCandidateSource({
    blocks, templates, pageKind: 'body',
    headingBehaviorOf: legacyHeadingBehaviorOf,
    ...extra,
  } satisfies CandidateGeneratorInput), new DecisionLedgerBuilder('off'), {});
}

/** כיסוי מלא — הסמן בסוף המסלול כיסה את כל קווי הבלוק האחרון (אין אובדן תוכן). */
const coversAll = (res: PageSearchResult, blocks: readonly PaginatedBlock[]): boolean => {
  const last = blocks[blocks.length - 1]!;
  return res.status === 'complete' && res.finalState.contentCursor.includes(`${last.blockId}|f${last.lines.length}`);
};

describe('שלב 69: השפעת עיטורים על המקום הזמין — תבניות, מדידה ו-on/off', () => {
  test('safeArea של העיצוב ⇒ custom-box מהשברים (דרך units; ADR-001) ולא מהשוליים', () => {
    const set = buildPageTemplateSet({
      ...BASE_INPUT,
      shaarAssets: { 'main-shaar': asset({ left: 0.25, top: 0.2, width: 0.5, height: 0.6 }) },
    });
    const box = set.for('main-shaar', 1).regions.find((r) => r.role === 'custom-box')!.rect;
    // חישוב מקביל בפרימיטיבים בלבד — לא עיגול מקומי
    const SCALE = 1000000;
    const lu = (frac: number, page: number) => Math.round((Math.round(frac * SCALE) * page) / SCALE);
    expect(box.x).toBe(asLu(lu(0.25, 4000000)));
    expect(box.y).toBe(asLu(lu(0.2, 5600000)));
    expect(box.width).toBe(asLu(lu(0.5, 4000000)));
    expect(box.height).toBe(asLu(lu(0.6, 5600000)));
    // לא תיבת השוליים הקבועה
    expect(box.x).not.toBe(GEOMETRY.margin);
  });

  test('אין safeArea (null/חסר) ⇒ תיבת השוליים הקבועה — הנפילה המתועדת, זהה להתנהגות שלפני שלב 69', () => {
    const fallback = buildPageTemplateSet(BASE_INPUT).for('sub-shaar', 1)
      .regions.find((r) => r.role === 'custom-box')!.rect;
    for (const sa of [null, undefined] as const) {
      const set = buildPageTemplateSet({ ...BASE_INPUT, shaarAssets: { 'sub-shaar': asset(sa) } });
      const box = set.for('sub-shaar', 1).regions.find((r) => r.role === 'custom-box')!.rect;
      expect(box).toEqual(fallback);
    }
    // תיבה מנוונת (חיתוך ריק) — safeAreaOf מחזיר null ⇒ אותה נפילה
    expect(safeAreaOf({ left: 1.235, top: 0.206, right: 0.29, bottom: 0.206 })).toBeNull();
    const set = buildPageTemplateSet({
      ...BASE_INPUT,
      shaarAssets: { 'sub-shaar': asset(safeAreaOf({ left: 1.235, top: 0.206, right: 0.29, bottom: 0.206 })) },
    });
    expect(set.for('sub-shaar', 1).regions.find((r) => r.role === 'custom-box')!.rect).toEqual(fallback);
  });

  test('safeArea שגוי (מחוץ ל-[0,1] / ממד לא-חיובי) ⇒ התבנית נדחית במפורש', () => {
    expect(() => buildPageTemplateSet({
      ...BASE_INPUT,
      shaarAssets: { 'main-shaar': asset({ left: -0.1, top: 0, width: 0.5, height: 0.5 }) },
    })).toThrowError(/asset\.safeArea|תבנית/);
    expect(() => buildPageTemplateSet({
      ...BASE_INPUT,
      shaarAssets: { 'main-shaar': asset({ left: 0.1, top: 0.1, width: 0, height: 0.5 }) },
    })).toThrowError(/asset\.safeArea|תבנית/);
    expect(() => buildPageTemplateSet({
      ...BASE_INPUT,
      shaarAssets: { 'main-shaar': asset({ left: 0.6, top: 0.1, width: 0.6, height: 0.5 }) },
    })).toThrowError(/asset\.safeArea|תבנית/);
  });

  test('זרימה: H1 על שער עם אזור בטוח צר — הכותרת בתוך התיבה; גבוהה ממנה ⇒ כשל מפורש', () => {
    const templates = buildPageTemplateSet({
      ...BASE_INPUT,
      shaarAssets: { 'sub-shaar': asset({ left: 0.2, top: 0.3, width: 0.6, height: 0.2 }) },
    });
    const boxH = templates.for('sub-shaar', 1).regions.find((r) => r.role === 'custom-box')!.rect.height;
    // כותרת נמוכה מהתיבה — מוצבת והמסלול מלא
    const ok = runFlow([h('h1', Math.round(boxH * 0.5), 1), block('b1', [LINE(200000)])], templates);
    expect(ok.status).toBe('complete');
    // כותרת גבוהה מהתיבה — אין מועמד חוקי; כשל מפורש (לא גלישה על הרקע)
    expect(() => runFlow([h('h1', boxH * 2, 1), block('b1', [LINE(200000)])], templates)).toThrowError();
  });

  test('מפריד סוף-פרק נמדד מההגדרות: none ⇒ 0; 28px ⇒ מ"מ פיזיים ← LU; פסול ⇒ ברירת מחדל נעולה', () => {
    expect(chapterEndDividerLuOf(mkSettings({ 'section-divider-style': 'none' }))).toBe(0);
    const lu = chapterEndDividerLuOf(mkSettings({ 'section-divider-style': 'spear', 'dim-secdiv-h': '28px' }));
    expect(lu).toBe(mmToLu(28 * CSS_PX_MM));
    expect(lu).toBeGreaterThan(0);
    // המרה דרך px גדול — פרופורציונליות
    expect(chapterEndDividerLuOf(mkSettings({ 'section-divider-style': 'spear', 'dim-secdiv-h': '56px' })))
      .toBe(mmToLu(56 * CSS_PX_MM));
    // ערך פסול ⇒ ברירת המחדל הנעולה (28px; settings-matrix)
    expect(chapterEndDividerLuOf(mkSettings({ 'section-divider-style': 'spear', 'dim-secdiv-h': 'junk' })))
      .toBe(mmToLu(DEFAULT_SECDIV_H_PX * CSS_PX_MM));
  });

  test('metamorphic on/off — עיטורי פתיחת H2 והמפריד: אותם קווים בדיוק מוצבים בשני המסלולים (אין אובדן תוכן)', () => {
    const blocks: readonly PaginatedBlock[] = [
      h('h2a', 300000, 2),
      block('p1', [LINE(150000), LINE(150000), LINE(150000)]),
      block('p2', [LINE(150000), LINE(150000)]),
      h('h2b', 300000, 2),
      block('p3', [LINE(150000), LINE(150000), LINE(150000), LINE(150000)]),
    ];
    const templates = buildPageTemplateSet(BASE_INPUT);
    // עיטורים דלוקים: ריווח + עיטורי פתיחה + מפריד נמדד
    const on = runFlow(blocks, templates, {
      headingBehaviorOf: (level: number) => level === 2
        ? { flowRole: 'page-opener', forcePageBreak: true, escortLines: 2, openerSpacing: { spaceBeforePct: 0.22, ornamentTopEm: 1.25, ornamentBottomEm: 1.25 } }
        : legacyHeadingBehaviorOf(level),
      chapterEndDividerLu: chapterEndDividerLuOf(mkSettings({ 'section-divider-style': 'spear' })),
    });
    // עיטורים כבויים: אין ריווח/עיטור/מפריד
    const off = runFlow(blocks, templates, {
      headingBehaviorOf: (level: number) => level === 2
        ? { flowRole: 'page-opener', forcePageBreak: true, escortLines: 2, openerSpacing: { spaceBeforePct: 0, ornamentTopEm: 0, ornamentBottomEm: 0 } }
        : legacyHeadingBehaviorOf(level),
      chapterEndDividerLu: 0,
    });
    expect(on.status).toBe('complete');
    expect(off.status).toBe('complete');
    // אותם קווים בדיוק — אין אובדן תוכן בשני המצבים (הסמן בסוף שניהם מכסה הכל)
    expect(coversAll(on, blocks)).toBe(true);
    expect(coversAll(off, blocks)).toBe(true);
  });

  test('metamorphic on/off — מספר העמודים עשוי להשתנות (הפריסה מותרת להיפגע), אך לעולם לא השלמות', () => {
    const tall: readonly PaginatedBlock[] = [
      h('h2a', 300000, 2),
      block('p1', Array.from({ length: 30 }, () => LINE(150000))),
      h('h2b', 300000, 2),
      block('p2', Array.from({ length: 30 }, () => LINE(150000))),
    ];
    const templates = buildPageTemplateSet(BASE_INPUT);
    for (const ornaments of [true, false]) {
      const r = runFlow(tall, templates, {
        headingBehaviorOf: (level: number) => level === 2
          ? { flowRole: 'page-opener', forcePageBreak: true, escortLines: 2, openerSpacing: ornaments ? { spaceBeforePct: 0.22, ornamentTopEm: 1.25, ornamentBottomEm: 1.25 } : { spaceBeforePct: 0, ornamentTopEm: 0, ornamentBottomEm: 0 } }
          : legacyHeadingBehaviorOf(level),
        chapterEndDividerLu: ornaments ? chapterEndDividerLuOf(mkSettings({})) : 0,
      });
      expect(coversAll(r, tall)).toBe(true);
    }
  });

  test('שער עם אזור בטוח — המסמך כולו עובר גם כשהתיבה צרה (הכותרת הקצרה נכנסת)', () => {
    const templates = buildPageTemplateSet({
      ...BASE_INPUT,
      shaarAssets: {
        'main-shaar': asset({ left: 0.25, top: 0.2, width: 0.5, height: 0.6 }),
        'sub-shaar': asset(safeAreaOf({ left: 0.3, top: 0.25, right: 0.3, bottom: 0.25 })),
      },
    });
    const blocks: readonly PaginatedBlock[] = [
      h('h0', 400000, 0),
      block('p1', [LINE(150000), LINE(150000)]),
      h('h1', 300000, 1),
      block('p2', [LINE(150000), LINE(150000), LINE(150000)]),
    ];
    const r = runFlow(blocks, templates);
    expect(coversAll(r, blocks)).toBe(true);
  });
});
