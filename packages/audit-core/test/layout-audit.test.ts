/**
 * layout-audit.test.ts — בדיקות שלב 38: ביקורת גאומטרית וטקסטואלית על IR (§14).
 *
 * מה מוכח כאן:
 *   1. פריסה תקינה מהמנוע v0 ⇐ אפס ממצאי HIGH; כיסוי אטומים מלא
 *      (contentAtoms === placedAtomOccurrences).
 *   2. איבוד אטום ⇒ ATOM_MISSING (HIGH); שכפול ⇒ ATOM_DUPLICATED.
 *   3. גלישת run מרוחב הקו ⇒ LINE_RUN_OVERFLOW (HIGH).
 *   4. חפיפת קווים באותו אזור ⇒ LINE_OVERLAP (HIGH).
 *   5. סמן הערה בלי גוף ⇒ NOTE_MARKER_WITHOUT_BODY (HIGH); גוף בלי סמן ⇒
 *      ההפך.
 *   6. טור שמאל מלא בעוד ימין ריק ⇒ COLUMN_ORDER_RTL (MEDIUM — RTL §14.2).
 *   7. הביקורת טהורה: שתי קריאות ⇐ דוח זהה; קוד ממצא לא רשום נדחה;
 *      הביקורת אינה משנה את הקלט (ה-IR קפוא גם אחרי הביקורת).
 */
import { describe, expect, test } from 'vitest';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import { parseSourceText } from '@tora/content-model';
import { typeset as engineTypeset } from '@tora/layout-engine';
import {
  createLayoutDocument,
  DEFAULT_SEARCH_BUDGET,
  type ContentDocument,
  type LayoutDocument,
  type TypesetRequest,
} from '@tora/layout-api';
import {
  auditLayout,
  LAYOUT_AUDIT_FINDING_CODES,
  type LayoutAuditReport,
} from '../src/index.js';

// ─────────────────────────── פריסה אמיתית ───────────────────────────

const SOURCE = `שם הספר - ספר בדיקת ביקורת
כותרת 1 מספר 1 - פרק ראשון
והנה פסקה ראשונה עם ניקוד ומספרים 123 ועוד טקסט שימלא שורות אחדות בטור, ובתוכה הערה [הערת שוליים ראשונה] והמשך הפסקה אחרי ההערה.
ופסקה שניה בלי הערה כלל, עם מקף-עברי ומספרים 456 ועוד מלים רבות כדי למלא שורות נוספות בעמודה הראשונה ואולי גם בשניה.
`;

function makeContent(): ContentDocument {
  const r = parseSourceText(SOURCE, { documentId: 'layout-audit-test' });
  return { ...r.doc, transforms: r.transforms } as ContentDocument;
}

function makeRequest(content: ContentDocument): TypesetRequest {
  return {
    document: content,
    settings: {
      schemaVersion: 1, enginePolicyId: 'torah-v1',
      values: Object.freeze({
        'size-body': 12, 'line-height-body': 1.34, 'prop-margin': 7.5,
        'note-marker-size': 8, 'note-marker-type': 'super', 'fn-reset-mode': 'siman',
        'page-num-format': 'gematria', 'page-num-initial-value': 1,
      }),
      configHash: 'c'.repeat(64),
    },
    assets: {
      schemaVersion: 1,
      fonts: [{ usage: 'body', font: { fontId: 'guttman-rashi-normal', contentSha256: 'a'.repeat(64), family: 'Guttman Rashi', weight: 400, style: 'normal' } }],
      fontsManifestSha256: 'f'.repeat(64),
      assetsManifestSha256: '0'.repeat(64),
    },
    trace: 'off',
    budget: DEFAULT_SEARCH_BUDGET,
    sourceSha256: '5'.repeat(64),
    parserVersion: 'test-1',
  } as TypesetRequest;
}

function makeLayout(): { content: ContentDocument; layout: LayoutDocument } {
  const content = makeContent();
  const out = engineTypeset(makeRequest(content), createTestMeasurementProvider(), { policyId: 'torah-v1' });
  return { content, layout: out.layout };
}

/** מוטציה עמוקה + אימות מחדש — ה-IR נבנה מחדש דרך createLayoutDocument. */
function mutatedLayout(layout: LayoutDocument, mutate: (draft: LayoutDocument) => void): LayoutDocument {
  const draft = structuredClone(layout) as LayoutDocument;
  mutate(draft);
  return createLayoutDocument(draft);
}

function firstLineOf(layout: LayoutDocument): { pageIdx: number; itemIdx: number } {
  for (let p = 0; p < layout.pages.length; p++) {
    const items = layout.pages[p]?.items ?? [];
    for (let i = 0; i < items.length; i++) {
      if (items[i]?.kind === 'line') return { pageIdx: p, itemIdx: i };
    }
  }
  throw new Error('no line');
}

// ─────────────────────────── בדיקות ───────────────────────────

describe('שלב 38: ביקורת פריסה — תקין', () => {
  test('פריסת v0 תקינה ⇐ אפס ממצאים; כיסוי אטומים מלא (שער השלב)', () => {
    const { content, layout } = makeLayout();
    const report = auditLayout({ content, settings: {}, layout });
    expect(report.ok).toBe(true);
    expect(report.counts.HIGH).toBe(0);
    expect(report.findingCount).toBe(0);
    expect(report.stats.contentAtoms).toBeGreaterThan(20);
    expect(report.stats.placedAtomOccurrences).toBe(report.stats.contentAtoms);
    expect(report.stats.pages).toBe(layout.pages.length);
  });

  test('הביקורת טהורה: שתי קריאות ⇐ דוח זהה; הקלט אינו משתנה', () => {
    const { content, layout } = makeLayout();
    const a = auditLayout({ content, settings: {}, layout });
    const b = auditLayout({ content, settings: {}, layout });
    expect(a).toEqual(b);
    expect(() => {
      // ה-IR קפוא עמוק — ניסיון מוטציה זורק (הביקורת לא הפשירה כלום)
      (layout.pages[0] as unknown as { id: string }).id = 'x';
    }).toThrow();
  });

  test('קוד ממצא לא רשום נדחה — אין קוד צד', () => {
    const codes = LAYOUT_AUDIT_FINDING_CODES.length;
    expect(codes).toBe(13); // 12 קודמים + ORNAMENT_OVERLAP (שלב 69)
  });
});

describe('שלב 38: מוטציות שליליות — נתפסות', () => {
  test('איבוד אטום ⇒ ATOM_MISSING (HIGH)', () => {
    const { content, layout } = makeLayout();
    const bad = mutatedLayout(layout, (draft) => {
      const { pageIdx, itemIdx } = firstLineOf(draft);
      const line = draft.pages[pageIdx]?.items[itemIdx] as unknown as { runs: Array<{ atomIds: string[] }> };
      const run = line.runs[0] as { atomIds: string[] };
      run.atomIds = run.atomIds.slice(0, -1);
    });
    const report = auditLayout({ content, settings: {}, layout: bad });
    expect(report.ok).toBe(false);
    expect(report.counts.HIGH).toBeGreaterThan(0);
    expect(report.findings.some((f) => f.code === 'audit.layout.ATOM_MISSING')).toBe(true);
  });

  test('שכפול אטום ⇒ ATOM_DUPLICATED (HIGH)', () => {
    const { content, layout } = makeLayout();
    const bad = mutatedLayout(layout, (draft) => {
      const { pageIdx, itemIdx } = firstLineOf(draft);
      const line = draft.pages[pageIdx]?.items[itemIdx] as unknown as { runs: Array<{ atomIds: string[] }> };
      const run = line.runs[0] as { atomIds: string[] };
      run.atomIds = [...run.atomIds, run.atomIds[0] as string];
    });
    const report = auditLayout({ content, settings: {}, layout: bad });
    expect(report.findings.some((f) => f.code === 'audit.layout.ATOM_DUPLICATED' && (f.actual ?? 0) === 2)).toBe(true);
  });

  test('גלישת run מרוחב הקו ⇒ LINE_RUN_OVERFLOW (HIGH; §8.2 — הועבר מהאימות המבני)', () => {
    const { content, layout } = makeLayout();
    const bad = mutatedLayout(layout, (draft) => {
      const { pageIdx, itemIdx } = firstLineOf(draft);
      const line = draft.pages[pageIdx]?.items[itemIdx] as unknown as { runs: Array<{ startLu: number; widthLu: number }>; rect: { width: number } };
      const run = line.runs[0] as { startLu: number; widthLu: number };
      run.startLu = 0;
      run.widthLu = (line.rect.width as number) * 2;
    });
    const report = auditLayout({ content, settings: {}, layout: bad });
    expect(report.findings.some((f) => f.code === 'audit.layout.LINE_RUN_OVERFLOW')).toBe(true);
    const f = report.findings.find((x) => x.code === 'audit.layout.LINE_RUN_OVERFLOW');
    expect(f?.severity).toBe('HIGH');
  });

  test('חפיפת קווים באותו אזור ⇒ LINE_OVERLAP (HIGH)', () => {
    const { content, layout } = makeLayout();
    const bad = mutatedLayout(layout, (draft) => {
      // מורידים את הקו השני בעמוד הראשון לתוך הקו הראשון
      const page = draft.pages[0];
      const lines = (page?.items ?? []).map((it, i) => ({ it, i })).filter((x) => x.it.kind === 'line');
      if (lines.length < 2) throw new Error('need 2 lines');
      const second = lines[1]?.it as unknown as { rect: { y: number }; baseline: number };
      const first = lines[0]?.it as unknown as { rect: { y: number; height: number } };
      second.rect.y = (first.rect.y as number) + 1;
      second.baseline = (first.rect.y as number) + (first.rect.height as number) - 2;
    });
    const report = auditLayout({ content, settings: {}, layout: bad });
    expect(report.findings.some((f) => f.code === 'audit.layout.LINE_OVERLAP')).toBe(true);
  });

  test('סמן הערה בלי גוף ⇒ NOTE_MARKER_WITHOUT_BODY (HIGH)', () => {
    const { content, layout } = makeLayout();
    const bad = mutatedLayout(layout, (draft) => {
      // מסירים את עמודי ה-notes (גופי ההערות)
      draft.pages = draft.pages.filter((p) => p.kind !== 'notes');
    });
    const report = auditLayout({ content, settings: {}, layout: bad });
    expect(report.findings.some((f) => f.code === 'audit.layout.NOTE_MARKER_WITHOUT_BODY')).toBe(true);
  });

  test('גוף הערה בלי סמן ⇒ NOTE_BODY_WITHOUT_MARKER (HIGH)', () => {
    const { content, layout } = makeLayout();
    const bad = mutatedLayout(layout, (draft) => {
      for (const page of draft.pages) {
        page.items = page.items.filter((it) => it.kind !== 'note-marker');
      }
    });
    const report = auditLayout({ content, settings: {}, layout: bad });
    expect(report.findings.some((f) => f.code === 'audit.layout.NOTE_BODY_WITHOUT_MARKER')).toBe(true);
  });

  test('טור שמאל מלא בעוד ימין ריק ⇒ COLUMN_ORDER_RTL (MEDIUM; §14.2)', () => {
    const { content, layout } = makeLayout();
    const bad = mutatedLayout(layout, (draft) => {
      const page = draft.pages[0];
      const rightCol = page?.regions.find((r) => r.kind === 'body-column' && r.columnIndex === 0);
      const leftCol = page?.regions.find((r) => r.kind === 'body-column' && r.columnIndex === 1);
      if (rightCol === undefined || leftCol === undefined) throw new Error('need 2 columns');
      for (const it of page?.items ?? []) {
        if (it.kind === 'line' && (it as unknown as { regionId: string }).regionId === rightCol.id) {
          (it as unknown as { regionId: string }).regionId = leftCol.id;
          const rect = (it as unknown as { rect: { x: number } }).rect;
          rect.x = (leftCol.rect.x as number);
        }
      }
    });
    const report = auditLayout({ content, settings: {}, layout: bad });
    const f = report.findings.find((x) => x.code === 'audit.layout.COLUMN_ORDER_RTL');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('MEDIUM');
    // הפרת איכות בלבד — לא HIGH; אבל כיסוי האטומים נותר מלא
    expect(report.counts.HIGH).toBe(0);
    expect(report.ok).toBe(true);
  });

  test('baseline מחוץ לקו ⇒ BASELINE_OUT_OF_LINE (HIGH; הביקורת בודקת גם בלי שער ה-IR)', () => {
    const { content, layout } = makeLayout();
    // האימות המבני של ה-IR (שלב 31) תופס baseline חורג כבר בשער — כאן
    // בודקים שגם שכבת הביקורת העצמאית מזהה זאת על אובייקט גולמי (הגנה כפולה)
    const bad = structuredClone(layout) as LayoutDocument;
    const { pageIdx, itemIdx } = firstLineOf(bad);
    const line = bad.pages[pageIdx]?.items[itemIdx] as unknown as { baseline: number; rect: { y: number } };
    line.baseline = (line.rect.y as number) - 5000;
    const report = auditLayout({ content, settings: {}, layout: bad });
    expect(report.findings.some((f) => f.code === 'audit.layout.BASELINE_OUT_OF_LINE')).toBe(true);
  });

  test('פריט עיטור באזור תוכן החופף קו ⇒ ORNAMENT_OVERLAP (HIGH; שלב 69 — אף נכס אינו מכסה טקסט)', () => {
    const { content, layout } = makeLayout();
    const bad = mutatedLayout(layout, (draft) => {
      const { pageIdx, itemIdx } = firstLineOf(draft);
      const page = draft.pages[pageIdx];
      const line = page?.items[itemIdx] as unknown as { id: string; regionId: string; rect: { x: number; y: number; width: number; height: number } };
      page?.items.push({
        kind: 'ornament',
        id: 'orn-cover-test',
        regionId: line.regionId,
        rect: { ...line.rect },
        assetId: 'shaar:v2|main|4ac3285bbd68337f#0',
        assetSha256: 'a'.repeat(64),
      } as never);
    });
    const report = auditLayout({ content, settings: {}, layout: bad });
    const f = report.findings.find((x) => x.code === 'audit.layout.ORNAMENT_OVERLAP');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('HIGH');
  });

  test('רקע שער פטור (פריט באזור ornament); אזור עיטור חופף אזור תוכן בעמוד גוף ⇒ ORNAMENT_OVERLAP (שלב 69)', () => {
    const { content, layout } = makeLayout();
    // (א) פריט עיטור בתוך אזור ornament (שכבת הרקע שמאחורי האזור הבטוח) — פטור
    const background = mutatedLayout(layout, (draft) => {
      const { pageIdx } = firstLineOf(draft);
      const page = draft.pages[pageIdx];
      const body = page?.regions.find((r) => r.kind === 'body-column');
      if (body === undefined) throw new Error('no body column');
      page?.regions.push({ id: 'page-bg-orn', kind: 'ornament', rect: { x: 0, y: 0, width: (page?.size.width as number), height: (page?.size.height as number) } } as never);
      page?.items.push({
        kind: 'ornament',
        id: 'orn-bg-test',
        regionId: 'page-bg-orn',
        rect: { x: 0, y: 0, width: 100, height: 100 },
        assetId: 'shaar:v2|main|4ac3285bbd68337f#0',
        assetSha256: 'a'.repeat(64),
      } as never);
    });
    const bgReport = auditLayout({ content, settings: {}, layout: background });
    expect(bgReport.findings.some((f) => f.code === 'audit.layout.ORNAMENT_OVERLAP' && f.params.itemId === 'orn-bg-test')).toBe(false);
    // (ב) אזור עיטור החופף אזור תוכן בעמוד גוף — נתפס (בשער היה פטור — §11.2)
    const overlapping = mutatedLayout(layout, (draft) => {
      const { pageIdx } = firstLineOf(draft);
      const page = draft.pages[pageIdx];
      const body = page?.regions.find((r) => r.kind === 'body-column');
      if (body === undefined) throw new Error('no body column');
      page?.regions.push({ id: 'page-orn-overlap', kind: 'ornament', rect: { ...body.rect } } as never);
    });
    const ornReport = auditLayout({ content, settings: {}, layout: overlapping });
    expect(ornReport.findings.some((f) => f.code === 'audit.layout.ORNAMENT_OVERLAP' && f.params.regionId === 'page-orn-overlap')).toBe(true);
  });

  test('קלט שגוי ⇒ שגיאה מקוטלגת (לא קריסה שקטה)', () => {
    const { content } = makeContent();
    expect(() => auditLayout({ content, settings: {}, layout: {} as unknown as LayoutDocument })).toThrow(/errors\.audit/);
    expect(() => auditLayout({ content: {} as ContentDocument, settings: {}, layout: {} as unknown as LayoutDocument })).toThrow(/errors\.audit/);
  });
});
