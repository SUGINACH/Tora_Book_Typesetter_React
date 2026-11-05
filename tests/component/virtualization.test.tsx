// @vitest-environment jsdom
/**
 * virtualization.test.tsx — בדיקות שלב 83: virtualization בטוח, progress
 * וביטול (M9; אפיון §13.2, §17.2#5, §17.3#9–10; תכנית שלב 83).
 *
 * מה מוכח כאן:
 *   1. החישוב טהור ודטרמיניסטי — pageOffsets/totalHeightPx/visiblePageRange/
 *      spacerHeights על מספרים בלבד; אותם קלטים ⇐ אותו טווח; גהה
 *      לא־חיובית ⇐ הצגה מלאה (נפילה לאחור מתועדת, לא רשימה ריקה).
 *   2. מסמך ארוך נשאר שמיש: רק הטווח הגלוי מוצג; פסי ריווח משלימים את
 *      הגלילה לגובה האמת; גלילה וזום אינם מוציאים דף מה-DOM בטעות.
 *   3. zoom/DPR אינם משנים תוצאה: הם משנים רק *כמה* עמודים מוצגים;
 *      ה־IR, ה־layoutHash וה־runStore אינם נפגעים (§17.2#5) — ואין
 *      מדידת DOM במסלוב (getBoundingClientRect אף פעם לא נקרא).
 *   4. progress דטרמיניסטי לתצוגה בלבד: ‎`breaking 3/7 — 42%`‎; בלי סך
 *      יחידות אין אחוז (אין המצאת מכנה); אותו דיווח ⇐ אותה שורה.
 *   5. ניווט שלב 81 על מסמך ארוך — הגלילה אל עמוד המוקד מחושבת
 *      מהגאומטריה של ה־IR (offsets × זוז + ריפוד), לא מדידת DOM.
 *   6. הדפסה ⇐ הצגה מלאה (beforeprint/afterprint); ניקוי המאזינים
 *      בהסרה — אין זליגה (§17.3#10 ברוח זו).
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { createElement } from 'react';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import { parseSourceText } from '@tora/content-model';
import { typeset as engineTypeset } from '@tora/layout-engine';
import {
  DEFAULT_SEARCH_BUDGET,
  layoutHash,
  type EffectiveSettings,
  type LayoutDocument,
  type RunManifest,
  type TypesetRequest,
} from '@tora/layout-api';
import { LayoutPreview } from '../../src/renderers/LayoutPreview.js';
import { projectLayout } from '../../src/renderers/preview-model.js';
import { PreviewArea } from '../../src/components/layout/PreviewArea.js';
import {
  CONTENT_INSET_PX,
  DEFAULT_OVERSCAN_PAGES,
  pageOffsets,
  spacerHeights,
  totalHeightPx,
  visiblePageRange,
} from '../../src/renderers/virtualization.js';
import { formatProgress, progressPercent } from '../../src/renderers/progress-display.js';
import { useEditorStore } from '../../src/stores/editor-store.js';
import { useResultStore } from '../../src/stores/result-store.js';
import { useRunStore } from '../../src/stores/run-store.js';
import { useViewStore } from '../../src/stores/view-store.js';

// ─────────────────────────── IR אמיתי מהמנוע; מסמך ארוך משוכפל ───────────────────────────

const SOURCE = `שם הספר - ספר בדיקת וירטואליזציה
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

function makeRequest(): TypesetRequest {
  const r = parseSourceText(SOURCE, { documentId: 'virtualization-test' });
  return {
    document: { ...r.doc, transforms: r.transforms } as TypesetRequest['document'],
    settings: makeSettings(),
    assets: {
      schemaVersion: 1,
      fonts: [{ usage: 'body', font: Object.freeze({ fontId: 'guttman-rashi-normal', contentSha256: 'a'.repeat(64), family: 'Guttman Rashi', weight: 400, style: 'normal' as const }) }],
      fontsManifestSha256: 'f'.repeat(64),
      assetsManifestSha256: '0'.repeat(64),
    },
    trace: 'off',
    budget: DEFAULT_SEARCH_BUDGET,
    sourceSha256: '5'.repeat(64),
    parserVersion: 'test-1',
  } as TypesetRequest;
}

const BASE: LayoutDocument = engineTypeset(makeRequest(), createTestMeasurementProvider(), { policyId: 'torah-v1' }).layout;
const TEMPLATE = BASE.pages[0] as LayoutDocument['pages'][number];

/** מסמך ארוך: אותו עמוד אמיתי מהמנוע, משוכפל עם מזהים ייחודיים. */
function longIr(n: number): LayoutDocument {
  const pages = Array.from({ length: n }, (_, i) => ({
    ...TEMPLATE,
    id: `vp-${i}`,
    physicalIndex: i + 1,
  })) as LayoutDocument['pages'];
  return { ...BASE, pages } as LayoutDocument;
}

const LONG = longIr(120);
const LONG_HASH = layoutHash(LONG);

function makeManifest(): RunManifest {
  return {
    layoutHash: LONG_HASH,
    inputHash: 'i'.repeat(64),
    engine: 'next',
  } as unknown as RunManifest;
}

const resetStores = (): void => {
  useResultStore.getState().reset();
  useRunStore.getState().reset();
  useEditorStore.getState().reset();
  useViewStore.getState().reset();
};

/** קביעת גהת הגלילה בגהה jsdom — clientHeight/scrollTop כמאפיינים עצמאיים. */
function setViewport(el: HTMLElement, scrollTop: number, clientHeight: number): void {
  Object.defineProperty(el, 'clientHeight', { value: clientHeight, configurable: true });
  Object.defineProperty(el, 'scrollTop', { value: scrollTop, writable: true, configurable: true });
}

beforeEach(() => {
  resetStores();
});
afterEach(() => {
  cleanup();
  resetStores();
});

// ─────────────────────────── 1. החישוב הטהור ───────────────────────────

describe('שלב 83: virtualization.ts — טהור ודטרמיניסטי', () => {
  test('pageOffsets/totalHeightPx/spacerHeights — מספרים מדויקים; אין פער אחרי האחרון', () => {
    const heights = [800, 800, 400, 800];
    const offsets = pageOffsets(heights);
    expect(offsets).toEqual([0, 816, 1632, 2048]);
    // גובה כולל: פערים *בין* העמודים בלבד — אחרי האחרון אין פער
    expect(totalHeightPx(heights)).toBe(2048 + 800);
    expect(totalHeightPx([])).toBe(0);
    const sp = spacerHeights({ first: 1, last: 2 }, heights);
    expect(sp).toEqual({ topPx: 816, bottomPx: 2848 - (1632 + 400) });
  });

  test('visiblePageRange — דטרמיניזם וקלמפים; גהה לא־חיובית/ריק ⇐ null (הצגה מלאה)', () => {
    const heights = Array.from({ length: 50 }, () => 800);
    const at = (scrollTop: number, zoom = 1) =>
      visiblePageRange(heights, { scrollTopPx: scrollTop, viewportHeightPx: 600 }, { zoom, overscanPages: 2 });
    // אותם קלטים ⇐ אותו טווח, פעמיים (דטרמיניזם)
    expect(at(0)).toEqual(at(0));
    expect(at(0)).toEqual({ first: 0, last: 2 }); // 600px גהה: עמוד 0 נראה; overscan 2
    // קלמפ אוברסקן בקצוות
    expect(at(0)!.first).toBe(0);
    const last = at(40000);
    expect(last!.last).toBe(49);
    // גלילה שלילית (overscroll) ⇐ נחשבת כ־0 — לא טווח שלילי
    expect(at(-50)!.first).toBe(0);
    // גהה לא־חיובית/אפס ⇐ null — נפילה לאחור מתועדת (jsdom/הדפסה), לא רשימה ריקה
    expect(visiblePageRange(heights, { scrollTopPx: 0, viewportHeightPx: 0 })).toBeNull();
    expect(visiblePageRange(heights, { scrollTopPx: 0, viewportHeightPx: -5 })).toBeNull();
    expect(visiblePageRange([], { scrollTopPx: 0, viewportHeightPx: 600 })).toBeNull();
    // זום מכפיל את מרחב הגלילה: אותו scrollTop בזום 2 מכסה חצי עמודים
    const zoom1 = at(2000)!;
    const zoom2 = at(2000, 2)!;
    expect(zoom2.last - zoom2.first).toBeLessThan(zoom1.last - zoom1.first);
    // החלון במרחב הלא־מוגדל: (scrollTop − inset)/zoom וגהה מחולקת בזום —
    // זום 2 עם גהה 600 ≡ זום 1 עם גהה 300 באותו ראש חלון
    const inset = CONTENT_INSET_PX;
    expect(at(2000, 2)).toEqual(
      visiblePageRange(heights, { scrollTopPx: (2000 - inset) / 2 + inset, viewportHeightPx: 300 }, { zoom: 1 }),
    );
    expect(DEFAULT_OVERSCAN_PAGES).toBe(2);
  });

  test('progress-display — אחוזים בתצוגה בלבד; אין המצאת מכנה', () => {
    expect(progressPercent({ stage: 'breaking', completedUnits: 3, totalUnits: 7 })).toBe(42);
    expect(progressPercent({ stage: 'x', completedUnits: 0, totalUnits: 7 })).toBe(0);
    expect(progressPercent({ stage: 'x', completedUnits: 7, totalUnits: 7 })).toBe(100);
    expect(progressPercent({ stage: 'x', completedUnits: 9, totalUnits: 7 })).toBe(100); // קלמפ
    expect(progressPercent({ stage: 'x', completedUnits: 4, totalUnits: null })).toBeNull();
    expect(progressPercent({ stage: 'x', completedUnits: 4, totalUnits: 0 })).toBeNull();
    expect(formatProgress({ stage: 'breaking', completedUnits: 3, totalUnits: 7 })).toBe('breaking 3/7 — 42%');
    expect(formatProgress({ stage: 'parse', completedUnits: 4, totalUnits: null })).toBe('parse 4');
    expect(formatProgress(null)).toBe('');
    // דטרמיניסטי — אותו דיווח ⇐ אותה שורה
    expect(formatProgress({ stage: 'breaking', completedUnits: 3, totalUnits: 7 })).toBe('breaking 3/7 — 42%');
  });
});

// ─────────────────────────── 2. LayoutPreview וירטואלי ───────────────────────────

describe('שלב 83: LayoutPreview — הצגה וירטואלית של עמודי ה-preview בלבד', () => {
  test('מסמך ארוך (120 עמודים) בלי viewport ⇐ הצגה מלאה; אין פסי ריווח', () => {
    const { container } = render(createElement(LayoutPreview, { layout: LONG, status: 'done' }));
    expect(container.querySelectorAll('.tora-preview-page').length).toBe(120);
    expect(container.querySelector('.tora-preview-root')!.getAttribute('data-virtual-range')).toBe('full');
    expect(container.querySelector('[data-testid="preview-spacer-top"]')).toBeNull();
    expect(container.querySelector('[data-testid="preview-spacer-bottom"]')).toBeNull();
  });

  test('viewport 600 בראש המסמך ⇐ רק הטווח הגלוי + overscan; פסי ריווח מדויקים', () => {
    const heights = projectLayout(LONG).map((p) => p.blockSizePx);
    const { container } = render(createElement(LayoutPreview, {
      layout: LONG,
      status: 'done',
      viewport: { scrollTopPx: 0, viewportHeightPx: 600 },
    }));
    const range = visiblePageRange(heights, { scrollTopPx: 0, viewportHeightPx: 600 });
    expect(range).not.toBeNull();
    const shown = container.querySelectorAll('.tora-preview-page');
    expect(shown.length).toBe(range!.last - range!.first + 1);
    // עמודים מחוץ לטווח אינם בכלל ב-DOM
    expect(container.querySelector('[data-page-id="vp-100"]')).toBeNull();
    // הפס העליון בראש המסמך הוא 0 — אינו מוצג; התחתון משלים לגובה האמת
    expect(container.querySelector('[data-testid="preview-spacer-top"]')).toBeNull();
    const spacers = spacerHeights(range!, heights);
    const bottom = container.querySelector('[data-testid="preview-spacer-bottom"]') as HTMLElement;
    expect(bottom.getAttribute('style')).toContain(`block-size: ${spacers.bottomPx}px`);
    // גובה התוכן כולו נשמר: הגלילה אמת גם כשרוב העמודים אינם מוצגים
    expect(spacers.bottomPx).toBe(totalHeightPx(heights) - (pageOffsets(heights)[range!.last] + heights[range!.last]));
  });

  test('גלילה לאמצע ⇐ הטווח זז; ה-DOM מכיל רק עמודים בטווח; הראש אינו מוצג', () => {
    const heights = projectLayout(LONG).map((p) => p.blockSizePx);
    const scrollTop = Math.floor(totalHeightPx(heights) / 2);
    const { container } = render(createElement(LayoutPreview, {
      layout: LONG,
      status: 'done',
      viewport: { scrollTopPx: scrollTop, viewportHeightPx: 600 },
    }));
    const range = visiblePageRange(heights, { scrollTopPx: scrollTop, viewportHeightPx: 600 });
    expect(range!.first).toBeGreaterThan(3);
    const shownIds = Array.from(container.querySelectorAll('.tora-preview-page')).map((e) => e.getAttribute('data-page-id'));
    expect(shownIds.length).toBe(range!.last - range!.first + 1);
    expect(shownIds[0]).toBe(`vp-${range!.first}`);
    expect(shownIds[shownIds.length - 1]).toBe(`vp-${range!.last}`);
    // ראש המסמך וסופו אינם ב-DOM
    expect(container.querySelector('[data-page-id="vp-0"]')).toBeNull();
    expect(container.querySelector('[data-page-id="vp-119"]')).toBeNull();
    const top = container.querySelector('[data-testid="preview-spacer-top"]') as HTMLElement;
    expect(top.getAttribute('style')).toContain(`block-size: ${pageOffsets(heights)[range!.first]}px`);
  });

  test('zoom מכפיל את החלון הגלוי במרחב הלא־מוגדל — ואינו מודד מחדש (§17.2#5)', () => {
    const heights = projectLayout(LONG).map((p) => p.blockSizePx);
    const scrollTop = 3000;
    const a = render(createElement(LayoutPreview, {
      layout: LONG, status: 'done', viewport: { scrollTopPx: scrollTop, viewportHeightPx: 600 }, zoom: 1,
    }));
    const b = render(createElement(LayoutPreview, {
      layout: LONG, status: 'done', viewport: { scrollTopPx: scrollTop, viewportHeightPx: 600 }, zoom: 2,
    }));
    const rangeA = visiblePageRange(heights, { scrollTopPx: scrollTop, viewportHeightPx: 600 });
    const rangeB = visiblePageRange(heights, { scrollTopPx: scrollTop, viewportHeightPx: 600 }, { zoom: 2 });
    expect(rangeB!.last - rangeB!.first).toBeLessThan(rangeA!.last - rangeA!.first);
    expect(a.container.querySelectorAll('.tora-preview-page').length).toBe(rangeA!.last - rangeA!.first + 1);
    expect(b.container.querySelectorAll('.tora-preview-page').length).toBe(rangeB!.last - rangeB!.first + 1);
    // הטרנספורם בלבד — הפיקסלים הפנימיים של העמוד זהים בין הזומים (אין מדידה מחדש)
    const aPage = a.container.querySelector('.tora-preview-page') as HTMLElement;
    const bPage = b.container.querySelector('.tora-preview-page') as HTMLElement;
    expect(bPage.getAttribute('style')).toBe(aPage.getAttribute('style'));
    expect(b.container.querySelector('.tora-preview-root')!.getAttribute('style')).toContain('scale(2)');
    expect(layoutHash(LONG)).toBe(LONG_HASH);
  });

  test('אפס מדידות DOM לאורך מחזור גלילה+זום — getBoundingClientRect לא נקרא', () => {
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    spy.mockImplementation(() => ({}) as DOMRect);
    const { container } = render(createElement(LayoutPreview, {
      layout: LONG, status: 'done', viewport: { scrollTopPx: 5000, viewportHeightPx: 600 },
    }));
    expect(spy).toHaveBeenCalledTimes(0);
    spy.mockRestore();
  });
});

// ─────────────────────────── 3. PreviewArea מחוברת ───────────────────────────

describe('שלב 83: PreviewArea — מחוברת, עם הגהה בגהה jsdom', () => {
  test('מסמך ארוך + resultStore אמיתי: הצגה מלאה כשאין גהה (clientHeight=0 ב-jsdom)', () => {
    useResultStore.getState().setResult({ ir: LONG, manifest: makeManifest(), sourceRevision: 0 }, LONG_HASH);
    const { container } = render(createElement(PreviewArea));
    expect(container.querySelector('[data-testid="preview-scroll"]')).not.toBeNull();
    expect(container.querySelectorAll('.tora-preview-page').length).toBe(120);
    expect(container.querySelector('.tora-preview-root')!.getAttribute('data-virtual-range')).toBe('full');
  });

  test('ניווט שלב 81 על מסמך ארוך: הגלילה אל עמוד המוקד מחושבת מהגאומטריה — והעמוד מוצג', () => {
    useResultStore.getState().setResult({ ir: LONG, manifest: makeManifest(), sourceRevision: 0 }, LONG_HASH);
    const { container } = render(createElement(PreviewArea));
    const el = container.querySelector('[data-testid="preview-scroll"]') as HTMLElement;
    setViewport(el, 0, 600);
    act(() => {
      useViewStore.getState().setFocus({ pane: 'layout', pageId: 'vp-80' });
    });
    // הגלילה המבוקשת: מרכז עמוד 80 במרחב הגלילה, פחות חצי גהה
    const heights = projectLayout(LONG).map((p) => p.blockSizePx);
    const offsets = pageOffsets(heights);
    const desired = Math.max(0, (offsets[80] + heights[80] / 2) * 1 + CONTENT_INSET_PX - 300);
    expect(el.scrollTop).toBe(desired);
    // העמוד נכנס לטווח ומוצג — ניווט לא נשבר עם וירטואליזציה
    expect(container.querySelector('[data-page-id="vp-80"]')).not.toBeNull();
    expect(container.querySelector('.tora-preview-root')!.getAttribute('data-virtual-range')).not.toBe('full');
  });

  test('beforeprint ⇐ הצגה מלאה; afterprint ⇐ חזרה לטווח הגלוי', () => {
    useResultStore.getState().setResult({ ir: LONG, manifest: makeManifest(), sourceRevision: 0 }, LONG_HASH);
    const { container } = render(createElement(PreviewArea));
    const el = container.querySelector('[data-testid="preview-scroll"]') as HTMLElement;
    setViewport(el, 5000, 600);
    fireEvent.scroll(el);
    expect(container.querySelector('.tora-preview-root')!.getAttribute('data-virtual-range')).not.toBe('full');
    act(() => {
      window.dispatchEvent(new Event('beforeprint'));
    });
    expect(container.querySelector('.tora-preview-root')!.getAttribute('data-virtual-range')).toBe('full');
    act(() => {
      window.dispatchEvent(new Event('afterprint'));
    });
    expect(container.querySelector('.tora-preview-root')!.getAttribute('data-virtual-range')).not.toBe('full');
  });

  test('zoom/DPR אינם משנים תוצאה — אותו IR קפוא, אותו hash, אף job חדש לא נפתח', () => {
    useResultStore.getState().setResult({ ir: LONG, manifest: makeManifest(), sourceRevision: 0 }, LONG_HASH);
    const { container } = render(createElement(PreviewArea));
    const el = container.querySelector('[data-testid="preview-scroll"]') as HTMLElement;
    setViewport(el, 0, 600);
    const irBefore = useResultStore.getState().ir;
    const hashBefore = useResultStore.getState().layoutHash;
    const runBefore = useRunStore.getState();
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    act(() => {
      useViewStore.getState().setZoom(2.5);
    });
    fireEvent.scroll(el);
    act(() => {
      useViewStore.getState().setZoom(1);
    });
    fireEvent.scroll(el);
    // התוצאה לא זזה: אותו אובייקט קפוא, אותו hash; לא נפתח job חדש
    expect(useResultStore.getState().ir).toBe(irBefore);
    expect(useResultStore.getState().layoutHash).toBe(hashBefore);
    expect(layoutHash(LONG)).toBe(LONG_HASH);
    const runAfter = useRunStore.getState();
    expect(runAfter.phase).toBe(runBefore.phase);
    expect(runAfter.jobId).toBe(runBefore.jobId);
    expect(Object.isFrozen(useResultStore.getState().ir)).toBe(true);
  });

  test('גלילה במחזור מלא לא משנה את התוצאה — אין שינוי עקב viewport (§17.3)', () => {
    useResultStore.getState().setResult({ ir: LONG, manifest: makeManifest(), sourceRevision: 0 }, LONG_HASH);
    const { container } = render(createElement(PreviewArea));
    const el = container.querySelector('[data-testid="preview-scroll"]') as HTMLElement;
    setViewport(el, 0, 600);
    const irBefore = useResultStore.getState().ir;
    const findingsBefore = useResultStore.getState().findings;
    for (const scrollTop of [0, 4000, 20000, 60000, 0]) {
      Object.defineProperty(el, 'scrollTop', { value: scrollTop, writable: true, configurable: true });
      fireEvent.scroll(el);
    }
    expect(useResultStore.getState().ir).toBe(irBefore);
    expect(useResultStore.getState().findings).toBe(findingsBefore);
    expect(container.querySelectorAll('.tora-preview-page').length).toBeLessThan(120);
  });

  test('progress בתצוגה: ‎3/7 — 42%‎; בלי סך ⇐ אין אחוז; אותו דיווח ⇐ אותה שורה', () => {
    useResultStore.getState().setResult({ ir: LONG, manifest: makeManifest(), sourceRevision: 0 }, LONG_HASH);
    const { container } = render(createElement(PreviewArea));
    const run = useRunStore.getState();
    act(() => {
      run.begin('job-v', 'hash-v');
      run.markRunning('job-v');
      run.setProgress('job-v', 'breaking', 3, 7);
    });
    const loading = container.querySelector('[role="status"]') as HTMLElement;
    expect(loading.getAttribute('data-progress-percent')).toBe('42');
    expect(loading.getAttribute('data-progress-units')).toBe('3/7');
    expect(loading.textContent).toContain('breaking 3/7 — 42%');
    act(() => {
      useRunStore.getState().setProgress('job-v', 'parse', 4);
    });
    const loading2 = container.querySelector('[role="status"]') as HTMLElement;
    expect(loading2.getAttribute('data-progress-percent')).toBeNull();
    expect(loading2.textContent).toContain('parse 4');
    expect(loading2.textContent).not.toContain('%');
  });

  test('ניקוי המאזינים בהסרה — אין זליגה; scroll על אלמנט מנותק אינו מקפיץ', () => {
    useResultStore.getState().setResult({ ir: LONG, manifest: makeManifest(), sourceRevision: 0 }, LONG_HASH);
    const { container, unmount } = render(createElement(PreviewArea));
    const el = container.querySelector('[data-testid="preview-scroll"]') as HTMLElement;
    const spy = vi.spyOn(el, 'removeEventListener');
    unmount();
    expect(spy).toHaveBeenCalledWith('scroll', expect.any(Function));
    expect(() => el.dispatchEvent(new Event('scroll'))).not.toThrow();
    spy.mockRestore();
  });
});
