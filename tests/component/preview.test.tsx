// @vitest-environment jsdom
/**
 * preview.test.tsx — בדיקות שלב 36: תצוגה מקדימה בריאקט צורכת IR (§13.2).
 *
 * מה מוכח כאן:
 *   1. IR קבוע מוצג: עמודים/אזורים/קווים/ריצות עם data-page-id/
 *      data-region-id/data-fragment-id/data-source-id; טקסט הריצות נוכח;
 *      אין HTML מוזרק (הטקסט כערכי React).
 *   2. zoom/DPR אינם משנים את ההיטל: אותם px פנימיים בדיוק; רק transform
 *      המיכל משתנה; layoutHash זהה (§17.2#5).
 *   3. אין מדידת DOM במסלול: getBoundingClientRect לא נקרא אף פעם
 *      במהלך הרינדור (§13.2; התצוגה היא היטל, לא מקור החלטות).
 *   4. מצבי loading/error/empty: שגיאה מוצגת כמפתח קטלוגי (לא message
 *      גולמי); running מציג שלב; ריק מציג נציג.
 *   5. ההיטל טהור: projectPage פעמיים ⇐ זהות עמוקה; הכלה לוגית.
 *   6. החיבור ל-WorkerClient (useTypesetWorker): run ← progress ← done
 *      עם המנוע האמיתי דרך הערוץ; ה-layoutHash זהה לקריאה ישירה.
 */
import { describe, expect, test, vi } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import { parseSourceText } from '@tora/content-model';
import { typeset as engineTypeset } from '@tora/layout-engine';
import {
  DEFAULT_SEARCH_BUDGET,
  layoutHash,
  type EffectiveSettings,
  type LayoutDocument,
  type TypesetRequest,
} from '@tora/layout-api';
import { LayoutPreview } from '../../src/renderers/LayoutPreview.js';
import { PageView } from '../../src/renderers/PageView.js';
import { displayTextOfRun, previewFontFamilyOf, projectPage, projectLayout } from '../../src/renderers/preview-model.js';
import { createEngineHandler, type WorkerPort } from '../../src/worker-host/engine-worker.js';
import { WorkerClient, type WorkerLike } from '../../src/worker-host/worker-client.js';
import { useTypesetWorker } from '../../src/worker-host/use-typeset-worker.js';
import type { PreparePayload, WorkerRequest, WorkerResponse } from '../../src/worker-host/protocol.js';

// ─────────────────────────── IR אמיתי מהמנוע ───────────────────────────

const SOURCE = `שם הספר - ספר בדיקת תצוגה
כותרת 1 מספר 1 - פרק ראשון
והנה פסקה ראשונה עם ניקוד ומספרים 123 ועוד טקסט שימלא שורות בטור, ובתוכה הערה [הערת שוליים] והמשך הפסקה.
ופסקה שניה עם מלים נוספות כדי למלא שורות נוספות בעמודה הראשונה ואולי גם בשניה ועוד ועוד.
`;

function makeSettings(): EffectiveSettings {
  return Object.freeze({
    schemaVersion: 1,
    enginePolicyId: 'torah-v1',
    values: Object.freeze({
      'size-body': 12, 'line-height-body': 1.34, 'prop-margin': 7.5,
      'note-marker-size': 8, 'note-marker-type': 'super', 'fn-reset-mode': 'siman',
      'page-num-format': 'gematria', 'page-num-initial-value': 1,
    }),
    configHash: 'c'.repeat(64),
  });
}

const BODY_FONT = Object.freeze({
  fontId: 'guttman-rashi-normal', contentSha256: 'a'.repeat(64),
  family: 'Guttman Rashi', weight: 400, style: 'normal' as const,
});

function makeRequest(): TypesetRequest {
  const r = parseSourceText(SOURCE, { documentId: 'preview-test' });
  return {
    document: { ...r.doc, transforms: r.transforms } as TypesetRequest['document'],
    settings: makeSettings(),
    assets: {
      schemaVersion: 1,
      fonts: [{ usage: 'body', font: BODY_FONT }],
      fontsManifestSha256: 'f'.repeat(64),
      assetsManifestSha256: '0'.repeat(64),
    },
    trace: 'off',
    budget: DEFAULT_SEARCH_BUDGET,
    sourceSha256: '5'.repeat(64),
    parserVersion: 'test-1',
  } as TypesetRequest;
}

const LAYOUT: LayoutDocument = engineTypeset(makeRequest(), createTestMeasurementProvider(), { policyId: 'torah-v1' }).layout;

const FAKE_FONT_RECORD = Object.freeze({
  file: 'test.woff2', fontId: 'guttman-rashi-normal', sha256: 'a'.repeat(64),
  family: 'Guttman Rashi', group: 'bundled' as const, binaryFormat: 'woff2' as const,
  unitsPerEm: 1000, weight: 400, style: 'normal' as const,
  distributionBlocked: { blocked: false, reason: 'test', decision: null, policy: 'test' },
});

function makePayload(): PreparePayload {
  return {
    request: makeRequest(),
    fonts: [{ record: FAKE_FONT_RECORD, bytes: new Uint8Array([1]) }],
    wasmBytes: new Uint8Array([1]),
    woff2DecoderBytes: new Uint8Array([1]),
  };
}

// ─────────────────────────── 1–3. הצגה, zoom, מצבים ───────────────────────────

describe('שלב 36: PageView/LayoutPreview — היטל של IR בלבד', () => {
  test('IR קבוע מוצג: עמודים, מאפייני זהות, טקסט; בלי HTML מוזרק', () => {
    const { container } = render(createElement(LayoutPreview, { layout: LAYOUT, status: 'done' }));
    const pages = container.querySelectorAll('.tora-preview-page');
    expect(pages.length).toBe(LAYOUT.pages.length);
    const first = pages[0] as HTMLElement;
    expect(first.getAttribute('data-page-id')).toBe(LAYOUT.pages[0]?.id);
    expect(first.getAttribute('dir')).toBe('rtl');
    // אזורים (data-region-kind — רק לאזורים; לקווים יש data-region-id משלהם לפי §13.2)
    expect(first.querySelectorAll('[data-region-kind]').length).toBe(LAYOUT.pages[0]?.regions.length ?? 0);
    const regionIds = new Set(Array.from(first.querySelectorAll('[data-region-id]')).map((e) => e.getAttribute('data-region-id')));
    for (const r of LAYOUT.pages[0]?.regions ?? []) expect(regionIds.has(r.id)).toBe(true);
    const lines = first.querySelectorAll('[data-fragment-id]');
    expect(lines.length).toBeGreaterThan(0);
    expect(first.querySelectorAll('[data-source-id]').length).toBe(lines.length);
    const text = first.textContent ?? '';
    expect(text.length).toBeGreaterThan(50);
    expect(container.innerHTML).not.toContain('<script');
  });

  test('נאמנות היטל: כל span של run נושא את טקסט ההצגה שלו — text פחות רווחי סוף-קו מאופסים (סדר חזותי כמקובל ב-v1; ADR-008 בשלב 88)', () => {
    const { container } = render(createElement(LayoutPreview, { layout: LAYOUT, status: 'done' }));
    const spans = Array.from(container.querySelectorAll('[data-run-id]')) as HTMLElement[];
    expect(spans.length).toBeGreaterThan(0);
    const expected: string[] = [];
    for (const page of LAYOUT.pages) {
      for (const item of page.items as readonly { kind: string }[]) {
        if (item.kind === 'line') {
          const line = item as unknown as { runs: readonly { id: string; text: string }[] };
          line.runs.forEach((r, i) => {
            // הריצה הראשונה של הקו היא השמאלית — רווחי סוף-הקו המאופסים
            // (trailingZero במנוע) בראש המחרוזת שלה מסולקים מההצגה
            expected.push(displayTextOfRun(r.text, i === 0));
          });
        }
      }
    }
    for (const span of spans) {
      expect(expected).toContain(span.textContent);
    }
  });

  test('displayTextOfRun: רווחי U+0020 בראש הריצה השמאלית נחתכים; NBSP ורווחים פנימיים נשמרים; ריצות פנימיות לא נוגעות', () => {
    expect(displayTextOfRun('   מילה', true)).toBe('מילה');
    expect(displayTextOfRun('מילה', true)).toBe('מילה');
    expect(displayTextOfRun(' מילה אחרת ', true)).toBe('מילה אחרת ');
    expect(displayTextOfRun('מרווח פנימי בלבד', true)).toBe('מרווח פנימי בלבד');
    // NBSP אינו נחתך — ADR-004 (isTrimmableSpaceText חלקית ל-U+0020)
    expect(displayTextOfRun('\u00a0מילה', true)).toBe('\u00a0מילה');
    // ריצה פנימית בקו — הרווח שלה אמיתי (בין-ריצות) ואסור לחתוך
    expect(displayTextOfRun('   מילה', false)).toBe('   מילה');
  });

  test('PageView על עמוד בודד — אותם מאפיינים (§13.2: PageView מקבל LayoutPage)', () => {
    const page = LAYOUT.pages[0] as LayoutDocument['pages'][number];
    const { container } = render(createElement(PageView, { page }));
    const el = container.querySelector('.tora-preview-page') as HTMLElement;
    expect(el.getAttribute('data-page-id')).toBe(page.id);
    expect(el.querySelectorAll('[data-fragment-id]').length).toBe(
      (page.items as readonly { kind: string }[]).filter((i) => i.kind === 'line').length);
  });

  test('zoom משנה transform בלבד — הפיקסלים הפנימיים זהים; אפס מדידות DOM (§17.2#5, §13.2)', () => {
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    spy.mockImplementation(() => ({}) as DOMRect);
    const a = render(createElement(LayoutPreview, { layout: LAYOUT, status: 'done', zoom: 1 }));
    const aRoot = a.container.querySelector('.tora-preview-root') as HTMLElement;
    const aPage = a.container.querySelector('.tora-preview-page') as HTMLElement;
    const aPageStyle = aPage.getAttribute('style') ?? '';
    expect(aRoot.style.transform).toBe('scale(1)');

    const b = render(createElement(LayoutPreview, { layout: LAYOUT, status: 'done', zoom: 2.5 }));
    const bRoot = b.container.querySelector('.tora-preview-root') as HTMLElement;
    const bPage = b.container.querySelector('.tora-preview-page') as HTMLElement;
    expect(bRoot.style.transform).toBe('scale(2.5)');
    expect(bPage.getAttribute('style')).toBe(aPageStyle);
    expect(layoutHash(LAYOUT)).toBe(layoutHash(LAYOUT));
    expect(spy).toHaveBeenCalledTimes(0);
    spy.mockRestore();
  });

  test('מצבי error/running/empty — שגיאה כמפתח קטלוגי, לא message גולמי', () => {
    const { container: errC } = render(createElement(LayoutPreview, {
      status: 'error',
      error: { errorCode: 'errors.engine.SETTING_INVALID', params: { key: 'size-body' } },
    }));
    const alert = errC.querySelector('[role="alert"]') as HTMLElement;
    expect(alert.getAttribute('data-error-code')).toBe('errors.engine.SETTING_INVALID');
    expect(alert.textContent).toContain('size-body');
    expect(alert.textContent).not.toContain('raw secret message');

    const { container: runC } = render(createElement(LayoutPreview, { status: 'running', progressStage: 'breaking' }));
    expect((runC.querySelector('[role="status"]') as HTMLElement).getAttribute('data-progress-stage')).toBe('breaking');

    const { container: emptyC } = render(createElement(LayoutPreview, {
      status: 'done',
      layout: { ...LAYOUT, pages: [] } as unknown as LayoutDocument,
    }));
    expect(emptyC.querySelector('.tora-preview-empty')).not.toBeNull();
  });
});

// ─────────── תיקון שורש 2026-11-09 — היפוך קריאה באתר החי ───────────
//
// הוכחות-נפל לחוזה ההצגה שתוקן בעקבות כישלון העמדה באתר החי של Pages:
// הריצות מגיעות מהמנוע בסדר חזותי מפורש (שמאל→ימין) — dir="rtl" גרם
// לדפדפן להפוך כל שורה פעם שנייה והספר כולו נקרא הפוך; שם המשפחה מהמניפסט
// (גוטמן-רש"י) שבר את ה-style המוטבע והגופן נפל לחלופה; קו justify לא
// מולא עד גבול הטור. החוזה המתוקן נבדק כאן DOM-ית.

describe('תיקון 2026-11-09: בי-די, גופן וריווח בתצוגה', () => {
  test('כל ריצה מוצגת ב-bidi-override כיווני ltr — סדר חזותי מפורש בלי היפוך בי-די שני', () => {
    const { container } = render(createElement(LayoutPreview, { layout: LAYOUT, status: 'done' }));
    const spans = Array.from(container.querySelectorAll('[data-run-id]')) as HTMLElement[];
    expect(spans.length).toBeGreaterThan(0);
    for (const span of spans) {
      expect(span.getAttribute('dir')).toBe('ltr');
      expect(span.style.unicodeBidi).toBe('bidi-override');
      expect(span.style.direction).toBe('ltr');
    }
  });

  test('משפחת הגופן של הריצה היא ההאשית מה-fontId — לא שם המשפחה הגולמי (גרשיים שברו style)', () => {
    const { container } = render(createElement(LayoutPreview, { layout: LAYOUT, status: 'done' }));
    const span = container.querySelector('[data-run-id]') as HTMLElement;
    // fontId בבדיקה: guttman-rashi-normal ⇒ tora-guttman-rashi-normal;
    // ה-family הגולמי ('Guttman Rashi' / 'גוטמן-רש"י') אסור בסגנון המוטבע.
    expect(span.style.fontFamily).toBe('"tora-guttman-rashi-normal"');
    expect(span.style.fontFamily).not.toContain('Guttman Rashi');
    const page = LAYOUT.pages[0] as LayoutDocument['pages'][number];
    const firstRun = (page.items as readonly { kind: string; runs?: { font: { fontId: string } }[] }[])
      .find((i) => i.kind === 'line')?.runs?.[0];
    expect(span.style.fontFamily).toBe(`"${previewFontFamilyOf(firstRun?.font.fontId ?? '')}"`);
  });

  test('קו fit (justify) נמתח לרוחב תיבת הריצה; קו טבעי rtl עוגן בימין', () => {
    const { container } = render(createElement(LayoutPreview, { layout: LAYOUT, status: 'done' }));
    const lines = Array.from(container.querySelectorAll('[data-fragment-id]')) as HTMLElement[];
    expect(lines.length).toBeGreaterThan(0);
    let sawJustified = false;
    let sawNatural = false;
    for (const lineEl of lines) {
      const span = lineEl.querySelector('[data-run-id]') as HTMLElement | null;
      if (span === null) continue;
      const reason = lineEl.getAttribute('data-break-reason');
      if (reason === 'fit') {
        expect(span.style.textAlign).toBe('justify');
        expect(span.style.textAlignLast).toBe('justify');
        sawJustified = true;
      } else {
        // כיוון הריצה בבדיקה זו rtl — קו טבעי עוגן בקצה ההתחלתי (ימין)
        expect(span.style.textAlign).toBe('right');
        expect(span.style.textAlignLast).toBe('');
        sawNatural = true;
      }
    }
    expect(sawJustified).toBe(true);
    expect(sawNatural).toBe(true);
  });

  test('סמני הערה עוגנים למשפחת הגופן של ריצות העמוד (v0: גופן הגוף)', () => {
    const { container } = render(createElement(LayoutPreview, { layout: LAYOUT, status: 'done' }));
    const markers = Array.from(container.querySelectorAll('[data-marker-id]')) as HTMLElement[];
    const run = container.querySelector('[data-run-id]') as HTMLElement;
    if (markers.length > 0) {
      for (const m of markers) {
        expect(m.style.fontFamily).toBe(run.style.fontFamily);
      }
    }
  });
});

// ─────────────────────────── 5. טוהר ההיטל ───────────────────────────

describe('שלב 36: ההיטל הטהור (preview-model)', () => {
  test('projectPage פעמיים ⇐ זהות עמוקה; הכלה לוגית של כל קו', () => {
    const page = LAYOUT.pages[0] as Parameters<typeof projectPage>[0];
    const a = projectPage(page);
    const b = projectPage(page);
    expect(a).toEqual(b);
    for (const l of a.lines) {
      expect(l.insetInlineStartPx + l.inlineSizePx).toBeLessThanOrEqual(a.inlineSizePx + 1);
      expect(l.insetBlockStartPx).toBeGreaterThanOrEqual(0);
    }
    const all = projectLayout(LAYOUT);
    expect(all.length).toBe(LAYOUT.pages.length);
    expect(all[0]?.id).toBe(LAYOUT.pages[0]?.id);
  });
});

// ─────────────────────────── 6. החיבור ל-WorkerClient ───────────────────────────

class HookChannel implements WorkerLike {
  private clientHandler: ((msg: WorkerResponse) => void) | undefined;
  private readonly deliver: (msg: unknown) => Promise<void>;

  constructor() {
    const handler = createEngineHandler({
      createProvider: async () => createTestMeasurementProvider(),
      typeset: engineTypeset,
    });
    const port: WorkerPort = { post: (m) => queueMicrotask(() => this.clientHandler?.(m)) };
    this.deliver = (msg) => handler(msg, port);
  }

  postMessage(msg: WorkerRequest): void {
    void this.deliver(msg);
  }

  onMessage(handler: (msg: WorkerResponse) => void): void {
    this.clientHandler = handler;
  }
}

describe('שלב 36: useTypesetWorker — חיבור לעובד ללא typeset בקומפוננטה', () => {
  test('run ← progress ← done; layoutHash זהה לקריאה ישירה למנוע', async () => {
    const client = new WorkerClient(new HookChannel());
    const { result } = renderHook(() => useTypesetWorker(client));
    expect(result.current.state.status).toBe('idle');
    act(() => { result.current.run(makePayload()); });
    expect(result.current.state.status).toBe('running');
    await waitFor(() => {
      expect(result.current.state.status).toBe('done');
    }, { timeout: 5000 });
    const state = result.current.state as { layout: LayoutDocument; layoutHash: string };
    expect(state.layout.pages.length).toBe(LAYOUT.pages.length);
    expect(state.layoutHash).toBe(layoutHash(LAYOUT));
    const { container } = render(createElement(LayoutPreview, {
      layout: state.layout,
      status: result.current.state.status,
    }));
    expect(container.querySelectorAll('.tora-preview-page').length).toBe(state.layout.pages.length);
  });

  test('הרצה חדשה מבטלת את הקודמת — המצב מגיע ל-done של האחרונה בלבד', async () => {
    const client = new WorkerClient(new HookChannel());
    const { result } = renderHook(() => useTypesetWorker(client));
    act(() => { result.current.run(makePayload()); });
    act(() => { result.current.run(makePayload()); });
    await waitFor(() => {
      expect(result.current.state.status).toBe('done');
    }, { timeout: 5000 });
    expect(result.current.state.layoutHash).toBe(layoutHash(LAYOUT));
  });
});
