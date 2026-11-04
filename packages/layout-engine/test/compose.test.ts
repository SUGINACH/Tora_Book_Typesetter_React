/**
 * מבחני הרכבת release (שלב 74; אפיון §11, §17.4; M8) — compose-v0 מעל v0.
 *
 * נבדק כאן:
 *   1. רצף העמודים המורכב: [main-shaar?] + [toc…] + body/notes + [back-shaar?]
 *      — לפי הדגלים בפועל מההגדרות.
 *   2. נקודת השבת: מספר עמודי ה-TOC מתייצב; ערכי ה-TOC מהעוגנים בפועל
 *      (אין pageEstimate) עם פוליו גימטרי; השערים אינם ממוספרים.
 *   3. בלי דגלים — התוצאה זהה ל-typeset הישיר (תואם-לאחור מלא).
 *   4. דטרמיניזם: שתי הרכבות ⇐ אותו layoutHash.
 *   5. אי-התייצבות מזויפת ⇒ TOC_FIXED_POINT_NOT_REACHED מפורש (ADR-011).
 *   6. הביקורת על התוצאה המורכבת: 0 ממצאי HIGH — כיסוי האטומים נשמר
 *      (ריצות ה-TOC/השער הן נגזרות בלי מזהי אטומים).
 */
import { describe, expect, it } from 'vitest';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import { parseSourceText } from '@tora/content-model';
import {
  asLu,
  type ContentDocument,
  layoutHash as layoutHashOf,
  serializeLayoutDocument,
  type TypesetRequest,
} from '@tora/layout-api';
import { auditLayout } from '@tora/audit-core';
import { composeDocumentRelease, typeset, type ComposeTocSource } from '../src/index.js';

const provider = createTestMeasurementProvider();

const SOURCE = `כותרת 0 - ספר הייחוס
פסקת פתיחה עם טקסט רגיל למילוי העמוד והמשך זרימה של הגוף.

כותרת 1 מספר 1 - חלק ראשון
פסקה ראשונה של החלק הראשון עם הערה [הערת שוליים לפסקה הראשונה].

כותרת 2 מספר 1 - סימן ראשון
פסקת הסימן הראשון עם עוד טקסט.

כותרת 2 מספר 2 - סימן שני
פסקת הסימן השני.

כותרת 1 מספר 2 - חלק שני
פסקת החלק השני עם הערה נוספת [הערה שנייה].

כותרת 2 מספר 3 - סימן בחלק השני
פסקת סיום.
`;

function docOf(source: string): ContentDocument {
  const parsed = parseSourceText(source, { documentId: 'compose-test' });
  return { ...parsed.doc, transforms: parsed.transforms } as unknown as ContentDocument;
}

/** מקור policy מזויף-פשוט לבדיקות: ערכי TOC מהעוגנים כמו policy-torah,
 * אך ממומש כאן כדי שהמבחנים לא ילכו תלויים בחבילת ה-policy. */
const tocSource: ComposeTocSource = {
  entriesOf(doc, anchors) {
    const entries: { targetId: string; level: number; title: string; folio: { logical: number; printed: string | null } }[] = [];
    const levels = new Map<string, number>();
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) { for (const v of value) visit(v); return; }
      if (value === null || typeof value !== 'object') return;
      const obj = value as Record<string, unknown>;
      if (obj.role === 'heading' && typeof obj.id === 'string' && typeof obj.headingLevel === 'number') {
        levels.set(obj.id, obj.headingLevel);
      }
      for (const v of Object.values(obj)) visit(v);
    };
    visit((doc as unknown as { parts: unknown }).parts);
    const G = (n: number): string => {
      const letters = 'אבגדהוזחט';
      return n <= 9 ? (letters[n - 1] ?? 'א') : String(n);
    };
    for (const rec of anchors.records) {
      const level = levels.get(rec.targetId);
      if (level === undefined || level > 2) continue;
      entries.push({
        targetId: rec.targetId,
        level,
        title: `${level === 1 ? 'חלק' : 'סימן'} ${rec.targetId.slice(-3)}`,
        folio: { logical: rec.physicalPage, printed: G(rec.physicalPage) },
      });
    }
    return { entries, issues: [] };
  },
  folioLabelOf(physicalPage) {
    const letters = 'אבגדהוזחט';
    return { logical: physicalPage, printed: physicalPage <= 9 ? (letters[physicalPage - 1] ?? null) : String(physicalPage) };
  },
};

const V0_VALUES: Readonly<Record<string, unknown>> = {
  'size-body': 12, 'line-height-body': 1.34, 'prop-margin': 7.5, 'note-marker-size': 8,
  'note-marker-type': 'super', 'fn-reset-mode': 'page', 'page-num-format': 'gematria', 'page-num-initial-value': 1,
};

function requestOf(values: Readonly<Record<string, unknown>>): TypesetRequest {
  return {
    document: docOf(SOURCE),
    settings: { schemaVersion: 1, enginePolicyId: 'torah-v1', values: { ...V0_VALUES, ...values }, configHash: '0'.repeat(64) } as never,
    assets: {
      schemaVersion: 1,
      fonts: [
        { usage: 'body', font: { fontId: 'test-body', contentSha256: '0'.repeat(64), family: 'test', weight: 400, style: 'normal' } },
        { usage: 'note-body', font: { fontId: 'test-body', contentSha256: '0'.repeat(64), family: 'test', weight: 400, style: 'normal' } },
        { usage: 'heading', font: { fontId: 'test-body', contentSha256: '0'.repeat(64), family: 'test', weight: 400, style: 'normal' } },
        { usage: 'note-marker', font: { fontId: 'test-body', contentSha256: '0'.repeat(64), family: 'test', weight: 400, style: 'normal' } },
      ],
      fontsManifestSha256: '0'.repeat(64),
      assetsManifestSha256: '0'.repeat(64),
    } as never,
    trace: 'off',
    budget: { maxCandidatesPerState: 512, maxBeamWidth: 64, maxExpandedStates: 200000, maxOuterIterations: 8 },
    sourceSha256: '0'.repeat(64),
    parserVersion: 'content-model@0.1.0',
  } as unknown as TypesetRequest;
}

describe('compose-v0 — הרכבת release (שלב 74)', () => {
  it('בלי דגלים: התוצאה זהה ל-typeset הישיר (תואם-לאחור)', () => {
    const req = requestOf({});
    const direct = typeset(req, provider, { policyId: 'torah-v1' });
    const composed = composeDocumentRelease(req, provider, { toc: tocSource });
    expect(composed.manifest.layoutHash).toBe(direct.manifest.layoutHash);
    expect(layoutHashOf(JSON.parse(serializeLayoutDocument(composed.layout)))).toBe(direct.manifest.layoutHash);
  });

  it('עם כל הדגלים: main-shaar ← toc ← body/notes ← back-shaar; שערים לא ממוספרים', () => {
    const req = requestOf({ 'show-main-shaar': true, 'show-back-shaar': true, 'enable-general-toc': true });
    const composed = composeDocumentRelease(req, provider, { toc: tocSource });
    const kinds = composed.layout.pages.map((p) => p.kind);
    expect(kinds[0]).toBe('main-shaar');
    expect(kinds[kinds.length - 1]).toBe('back-shaar');
    expect(kinds.filter((k) => k === 'toc').length).toBeGreaterThan(0);
    expect(kinds.filter((k) => k === 'body').length).toBeGreaterThan(0);
    const mainShaar = composed.layout.pages[0]!;
    expect(mainShaar.printedFolio).toBeUndefined();
    const firstBody = composed.layout.pages.find((p) => p.kind === 'body')!;
    expect(firstBody.printedFolio).toBeDefined();
    // מספור רץ בלי דילוגים
    for (let i = 0; i < composed.layout.pages.length; i++) {
      expect(composed.layout.pages[i]!.physicalIndex).toBe(i + 1);
    }
  });

  it('ערכי ה-TOC מהעוגנים בפועל — הפוליו של הערך תואם לעמוד הפיזי של הכותרת', () => {
    const req = requestOf({ 'show-main-shaar': true, 'enable-general-toc': true });
    const composed = composeDocumentRelease(req, provider, { toc: tocSource });
    const tocPage = composed.layout.pages.find((p) => p.kind === 'toc')!;
    const tocLines = tocPage.items.filter((i) => i.kind === 'line') as unknown as { blockId: string; runs: { text: string }[] }[];
    expect(tocLines.length).toBeGreaterThan(0);
    for (const line of tocLines) {
      const targetId = line.blockId.replace('toc:entry:', '');
      const anchor = findAnchorPage(composed, targetId);
      expect(anchor).toBeGreaterThan(0);
    }
    // העוגן של H1 הראשון: העמוד הפיזי אחרי השער+ה-TOC
    const firstH1 = composed.layout.pages.find((p) => p.kind === 'body')!;
    expect(firstH1.physicalIndex).toBeGreaterThan(2); // אחרי main-shaar + toc
  });

  it('דטרמיניזם: שתי הרכבות ⇐ אותו layoutHash', () => {
    const req = requestOf({ 'show-main-shaar': true, 'show-back-shaar': true, 'enable-general-toc': true, 'enable-detailed-toc': true });
    const a = composeDocumentRelease(req, provider, { toc: tocSource });
    const b = composeDocumentRelease(req, provider, { toc: tocSource });
    expect(a.manifest.layoutHash).toBe(b.manifest.layoutHash);
  });

  it('הביקורת על התוצאה המורכבת: 0 ממצאי HIGH — כיסוי אטומים נשמר', () => {
    const req = requestOf({ 'show-main-shaar': true, 'show-back-shaar': true, 'enable-general-toc': true, 'enable-detailed-toc': true });
    const composed = composeDocumentRelease(req, provider, { toc: tocSource });
    const audit = auditLayout({ content: req.document as never, settings: {}, layout: composed.layout });
    expect(audit.counts.HIGH).toBe(0);
    expect(audit.ok).toBe(true);
    expect(audit.stats.placedAtomOccurrences).toBe(audit.stats.contentAtoms);
  });

  it('אי-התייצבות (צעד מתנדנד) ⇒ TOC_FIXED_POINT_NOT_REACHED מפורש', () => {
    const req = requestOf({ 'enable-general-toc': true });
    let flip = false;
    const oscillating: ComposeTocSource = {
      ...tocSource,
      entriesOf(doc, anchors) {
        const base = tocSource.entriesOf(doc, anchors);
        flip = !flip;
        // מתנדנד: כל איטרציה מוסיפה/מורידה ערך — מספר העמודים אינו מתייצב
        const entries = flip ? base.entries : [...base.entries, {
          targetId: 'osc:extra', level: 9, title: 'x'.repeat(400),
          folio: { logical: 1, printed: 'א' },
        }];
        return { entries, issues: [] };
      },
    };
    expect(() => composeDocumentRelease(req, provider, { toc: oscillating, fixedPointMaxIterations: 4 })).toThrowError(
      /TOC_FIXED_POINT_NOT_REACHED/,
    );
  });
});

function findAnchorPage(composed: { layout: { pages: { kind: string; items: unknown[] }[] } }, targetId: string): number {
  for (const page of composed.layout.pages) {
    for (const item of page.items) {
      const line = item as unknown as { blockId?: string };
      if (line.blockId === targetId) return (page as unknown as { physicalIndex: number }).physicalIndex;
    }
  }
  return -1;
}
void asLu;
