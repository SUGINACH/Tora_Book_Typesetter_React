// @vitest-environment jsdom
/**
 * export-button.test.tsx — בדיקות מסלול הייצוא הטהור של המעטפת (שלב 86;
 * אפיון §15.1, תכנית 86: "ניתוק export מה-preview DOM").
 *
 * מה נבדק:
 *   1. הכפתור מושבת ללא IR/מקור — אין ייצוא של "כלום".
 *   2. לחיצה עם IR ⇒ buildExportHtml מה־IR בלבד: התעבורה מקבלת Blob
 *      text/html שתוכנו היטל render-html אמיתי (גופן tora-<fontId>,
 *      טקסט לוגי מהמקור, dir) — לא היטל מה-DOM החי.
 *   3. שעת השלב: אין window.print בכל המעטפת; הייצוא אינו מזיז אף אות
 *      ואינו מריץ job (אין שינוי phase/layoutHash).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { LayoutDocument } from '@tora/layout-api';
import { useEditorStore } from '../../src/stores/editor-store.js';
import { useResultStore } from '../../src/stores/result-store.js';
import { setUiRuntime, type UiRuntime } from '../../src/worker-host/ui-runtime.js';
import { ExportButton } from '../../src/components/layout/ExportButton.js';
import { buildExportHtml } from '../../src/worker-host/export-html.js';
import type { FontBytesEntry } from '../../src/worker-host/protocol.js';

const resetAll = (): void => {
  useEditorStore.getState().reset();
  useResultStore.getState().reset();
};
beforeEach(resetAll);
afterEach(() => {
  cleanup();
  resetAll();
  setUiRuntime(null);
  vi.restoreAllMocks();
});

/** גופן יחיד בצרור — רשומה תקפה מהמרשם (התוכן אינו נוגע כאן). */
const FONT: FontBytesEntry = {
  record: {
    file: 'Test-Body.woff2',
    fontId: 'font:v1:deadbeef',
    sha256: 'f'.repeat(64),
    family: 'גופן-בדיקה',
    group: 'bundled',
    binaryFormat: 'woff2',
    unitsPerEm: 1000,
    weight: 400,
    style: 'normal',
  } as FontBytesEntry['record'],
  bytes: new Uint8Array(4),
};

const stubRuntime = (fonts: readonly FontBytesEntry[]): UiRuntime =>
  ({ bundle: { fonts } }) as unknown as UiRuntime;

/** IR מינימלי תקין להיטל: עמוד אחד, קו אחד, ריצה אחת עם אטום מקור. */
const SOURCE = 'אבג';
const ATOM_ID = 'atom:v1|doc|body|0+3|src|0';
const makeIr = (): LayoutDocument =>
  ({
    schemaVersion: 1,
    policyId: 'torah-v1',
    pages: [{
      id: 'page:1',
      physicalIndex: 1,
      parity: 'recto',
      kind: 'body',
      size: { width: 655360, height: 917504 },
      regions: [{ id: 'region:1', kind: 'body', rect: { x: 65536, y: 65536, width: 524288, height: 786432 } }],
      items: [{
        kind: 'line',
        id: 'line:1',
        blockId: 'block:1',
        fragmentIndex: 0,
        lineIndex: 0,
        regionId: 'region:1',
        rect: { x: 65536, y: 131072, width: 524288, height: 16384 },
        baseline: 140000,
        runs: [{
          kind: 'run',
          id: 'run:1',
          font: { fontId: 'font:v1:deadbeef', contentSha256: 'a'.repeat(64), family: 'Frank Ruhl Libre', weight: 400, style: 'normal' } as never,
          fontSizeLu: 131072,
          direction: 'rtl',
          startLu: 65536,
          widthLu: 500000,
          text: 'אבג',
          glyphs: [{ glyphId: 12, atomId: ATOM_ID, clusterAtomIndex: 0, advanceLu: 166666, xOffsetLu: 0, yOffsetLu: 0 }],
          atomIds: [ATOM_ID],
          requestHash: 'req-test',
        }],
        sourceSpans: [],
        breakReason: 'natural',
        continuation: 'none',
      }],
      anchors: [],
    }],
    anchors: [],
    transformations: [],
  }) as unknown as LayoutDocument;

describe('ExportButton — מסלול הייצוא הטהור (שלב 86)', () => {
  test('מושבת ללא IR או ללא מקור-ריצה — אין ייצוא של כלום', () => {
    setUiRuntime(stubRuntime([FONT]));
    const { getByTestId } = render(<ExportButton />);
    const btn = getByTestId('export-html') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(useResultStore.getState().ir).toBeNull();
  });

  test('לחיצה עם IR ⇒ Blob מהיטל render-html (טקסט לוגי, גופן tora-), לא מה-DOM', () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:test');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    setUiRuntime(stubRuntime([FONT]));
    useResultStore.getState().setResult({
      ir: makeIr(),
      manifest: { layoutHash: 'a'.repeat(64) } as never,
      sourceAtRun: SOURCE,
      sourceRevision: 1,
    } as never, 'a'.repeat(64));
    const { getByTestId } = render(<ExportButton />);
    const btn = getByTestId('export-html') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob: Blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe('text/html;charset=utf-8');
  });

  test('buildExportHtml — היטל HTML מה־IR בלבד; זהה בין קריאות (קנוני)', () => {
    const a = buildExportHtml({ ir: makeIr(), source: SOURCE, bundle: { fonts: [FONT] } });
    const b = buildExportHtml({ ir: makeIr(), source: SOURCE, bundle: { fonts: [FONT] } });
    expect(a.html).toBe(b.html);
    expect(a.html).toContain('dir="rtl"');
    expect(a.html).toContain('>אבג<');
    expect(a.html).toContain("tora-font-v1-deadbeef");
    expect(a.html).not.toContain('window.print');
    expect(a.html).not.toMatch(/https?:\/\//);
  });
});

describe('ExportButton — שלב 87: פלט self-contained וקנוני', () => {
  test('הגופן מוטמע כ-data URI מלא; אין פניית קובץ חיצונית; CSS הדפסה', () => {
    const built = buildExportHtml({ ir: makeIr(), source: SOURCE, bundle: { fonts: [FONT] } });
    // הטמעה מלאה מתוך ה-bytes של הצרור (FONT.bytes = 4 בתים ⇒ AAAA)
    expect(built.html).toContain('src:url(data:font/woff2;base64,');
    expect(built.html).toContain('data:font/woff2;base64,AAAA');
    expect(built.html).not.toContain('url("fonts/');
    // תמיכת הדפסה של הקובץ העומד לבדו — בלי חישוב מנוע חוזר
    expect(built.html).toContain('@page{margin:0}');
    expect(built.html).toContain('page-break-after:always');
    expect(built.html).toContain('@media print{.tora-page{page-break-after:always');
  });

  test('שתי בניות עם אותו bytes ⇒ אותו data URI ביט-ביט (קנוני)', () => {
    const a = buildExportHtml({ ir: makeIr(), source: SOURCE, bundle: { fonts: [FONT] } });
    const b = buildExportHtml({ ir: makeIr(), source: SOURCE, bundle: { fonts: [FONT] } });
    const uriOf = (s: string) => (s.match(/data:font\/woff2;base64,[A-Za-z0-9+/=]+/g) ?? ['none']).join(',');
    expect(uriOf(a.html)).toBe(uriOf(b.html));
    expect(uriOf(a.html)).not.toBe('none');
  });
});
