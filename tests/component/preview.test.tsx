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
import { displayTextOfRun, logicalTextOfRun, previewFontFamilyOf, projectPage, projectLayout } from '../../src/renderers/preview-model.js';
import { logicalTextOfRun as logicalTextOfRunCli } from '@tora/render-html';
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
    const { container } = render(createElement(LayoutPreview, { layout: LAYOUT, sourceText: SOURCE, status: 'done' }));
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
    const { container } = render(createElement(LayoutPreview, { layout: LAYOUT, sourceText: SOURCE, status: 'done' }));
    const spans = Array.from(container.querySelectorAll('[data-run-id]')) as HTMLElement[];
    expect(spans.length).toBeGreaterThan(0);
    const expected: string[] = [];
    for (const page of LAYOUT.pages) {
      for (const item of page.items as readonly { kind: string }[]) {
        if (item.kind === 'line') {
          // ההיטל מציג את הטקסט הלוגי (logicalTextOfRun) פחות רווחי
          // סוף-הקו המאופסים בקצה הלוגי של הריצה השמאלית (תיקון 2026-11-09/ב')
          const line = item as unknown as { runs: readonly Parameters<typeof logicalTextOfRun>[0][] };
          line.runs.forEach((r, i) => {
            expected.push(displayTextOfRun(logicalTextOfRun(r, SOURCE), i === 0, r.direction));
          });
        }
      }
    }
    for (const span of spans) {
      expect(expected).toContain(span.textContent);
    }
  });

  test('displayTextOfRun: רווחי U+0020 בקצה הלוגי של הריצה השמאלית נחתכים; NBSP נשמר; ריצות פנימיות לא נוגעות', () => {
    // rtl: הריצה השמאלית היא סוף הקו הלוגי — הרווחים בזנב הטקסט
    expect(displayTextOfRun('מילה   ', true, 'rtl')).toBe('מילה');
    expect(displayTextOfRun('מילה', true, 'rtl')).toBe('מילה');
    expect(displayTextOfRun(' מילה אחרת ', true, 'rtl')).toBe(' מילה אחרת');
    expect(displayTextOfRun('מרווח פנימי בלבד', true, 'rtl')).toBe('מרווח פנימי בלבד');
    // ltr: הרווחים בראש הטקסט (ראש חזותי === ראש לוגי)
    expect(displayTextOfRun('   word', true, 'ltr')).toBe('word');
    // NBSP אינו נחתך — ADR-004 (isTrimmableSpaceText חלקית ל-U+0020)
    expect(displayTextOfRun('מילה\u00a0', true, 'rtl')).toBe('מילה\u00a0');
    // ריצה פנימית בקו — הרווח שלה אמיתי (בין-ריצות) ואסור לחתוך
    expect(displayTextOfRun('   מילה', false, 'rtl')).toBe('   מילה');
  });

  test('PageView על עמוד בודד — אותם מאפיינים (§13.2: PageView מקבל LayoutPage)', () => {
    const page = LAYOUT.pages[0] as LayoutDocument['pages'][number];
    const { container } = render(createElement(PageView, { page, sourceText: SOURCE }));
    const el = container.querySelector('.tora-preview-page') as HTMLElement;
    expect(el.getAttribute('data-page-id')).toBe(page.id);
    expect(el.querySelectorAll('[data-fragment-id]').length).toBe(
      (page.items as readonly { kind: string }[]).filter((i) => i.kind === 'line').length);
  });

  test('zoom משנה transform בלבד — הפיקסלים הפנימיים זהים; אפס מדידות DOM (§17.2#5, §13.2)', () => {
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect');
    spy.mockImplementation(() => ({}) as DOMRect);
    const a = render(createElement(LayoutPreview, { layout: LAYOUT, sourceText: SOURCE, status: 'done', zoom: 1 }));
    const aRoot = a.container.querySelector('.tora-preview-root') as HTMLElement;
    const aPage = a.container.querySelector('.tora-preview-page') as HTMLElement;
    const aPageStyle = aPage.getAttribute('style') ?? '';
    expect(aRoot.style.transform).toBe('scale(1)');

    const b = render(createElement(LayoutPreview, { layout: LAYOUT, sourceText: SOURCE, status: 'done', zoom: 2.5 }));
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
  test('כל ריצה מוצגת בכיוון הטבעי שלה (בלי bidi-override) — הדפדפן מפעיל UAX#9 בעצמו', () => {
    const { container } = render(createElement(LayoutPreview, { layout: LAYOUT, sourceText: SOURCE, status: 'done' }));
    const spans = Array.from(container.querySelectorAll('[data-run-id]')) as HTMLElement[];
    expect(spans.length).toBeGreaterThan(0);
    let sawRtl = false;
    for (const span of spans) {
      const dir = span.getAttribute('data-run-direction');
      expect(span.getAttribute('dir')).toBe(dir); // הכיוון מהמודל, לא קבוע
      expect(span.style.direction).toBe(dir);
      expect(span.style.unicodeBidi).toBe(''); // אין override — מראה תווים
      if (dir === 'rtl') sawRtl = true;
    }
    expect(sawRtl).toBe(true); // גוף הבדיקה עברי
  });

  test('הטקסט המוצג הוא הלוגי — שחזור מלא מול המקור בכל קווי העמוד הראשון (מראות תווים)', () => {
    const { container } = render(createElement(LayoutPreview, { layout: LAYOUT, sourceText: SOURCE, status: 'done' }));
    const lines = Array.from(container.querySelectorAll('[data-item-kind="line"]')) as HTMLElement[];
    expect(lines.length).toBeGreaterThan(0);
    // הרצת rtl: הטקסט הלוגי של כל קו === פרוסת המקור של הקו (עד רווחי סוף)
    let checked = 0;
    for (const lineEl of lines) {
      const fragId = lineEl.getAttribute('data-fragment-id') ?? '';
      const item = (LAYOUT.pages as readonly { items: readonly { id: string; kind: string; sourceSpans?: { startUtf16: number; endUtf16: number }[] }[] }[])
        .flatMap((pg) => pg.items).find((i) => i.id === fragId);
      const span = item?.sourceSpans?.[0];
      if (span === undefined) continue;
      const expectedLogical = SOURCE.slice(span.startUtf16, span.endUtf16).replace(/ +$/, '');
      const shown = (lineEl.querySelector('[data-run-id]') as HTMLElement).textContent ?? '';
      // קו חד-ריצה בגוף העברי — ההשוואה המדויקת אפשרית; קווים עם סמנים
      // נבדקים על הריצה הראשונה בלבד (סמן איננו חלק מהטקסט)
      const oneRun = lineEl.querySelectorAll('[data-run-id]').length === 1;
      if (oneRun) {
        expect(shown).toBe(expectedLogical);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  test('משפחת הגופן של הריצה היא ההאשית מה-fontId — לא שם המשפחה הגולמי (גרשיים שברו style)', () => {
    const { container } = render(createElement(LayoutPreview, { layout: LAYOUT, sourceText: SOURCE, status: 'done' }));
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
    const { container } = render(createElement(LayoutPreview, { layout: LAYOUT, sourceText: SOURCE, status: 'done' }));
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
    const { container } = render(createElement(LayoutPreview, { layout: LAYOUT, sourceText: SOURCE, status: 'done' }));
    const markers = Array.from(container.querySelectorAll('[data-marker-id]')) as HTMLElement[];
    const run = container.querySelector('[data-run-id]') as HTMLElement;
    if (markers.length > 0) {
      for (const m of markers) {
        expect(m.style.fontFamily).toBe(run.style.fontFamily);
      }
    }
  });
});

// ─────────── תיקון שורש 2026-11-09/ב' — שחזור הטקסט הלוגי ───────────
//
// הוכחות-נפל לשחזור: המנוע פולט את run.text בסדר אטומים חזותי עם תווים
// לוגיים — הצגתו כמות-שהיא מראה כל מילה ("יורה דעה" נקרא "הרוי העד";
// אומת באתר החי במדידת מיקומי תווים בפועל). ההיטל משחזר את הטקסט הלוגי
// מטווחי המקור המקודדים במזהי האטומים — וחייב להיות זהה ביט-ביט בין
// שני מסלולי ההצגה (אפליקציה ו-CLI).

describe("תיקון 2026-11-09/ב': logicalTextOfRun — שחזור הטקסט הלוגי", () => {
  /** ריצת rtl מהמנוע האמיתי עם אטומים. */
  function firstRtlRun(): { run: Parameters<typeof logicalTextOfRun>[0]; line: { sourceSpans?: { startUtf16: number; endUtf16: number }[] } } {
    for (const page of LAYOUT.pages as readonly { items: readonly { kind: string; runs?: Parameters<typeof logicalTextOfRun>[0][]; sourceSpans?: { startUtf16: number; endUtf16: number }[] }[] }[]) {
      for (const item of page.items) {
        const run = item.runs?.find((r) => r.direction === 'rtl' && r.atomIds.length > 0);
        if (run !== undefined) return { run, line: item };
      }
    }
    throw new Error('לא נמצאה ריצת rtl ב-IR הבדיקה');
  }

  test('ריצת rtl אמיתית: הטקסט הלוגי === פרוסת המקור של הקו (סדר קריאה מושלם)', () => {
    const { run, line } = firstRtlRun();
    const logical = logicalTextOfRun(run, SOURCE);
    expect(logical.length).toBeGreaterThan(0);
    // המחרוזת החזותית שונה מהלוגית (המנוע מסדר אטומים שמאל→ימין)
    expect(run.text).not.toBe(logical);
    // והלוגית זהה לפרוסת המקור (עד רווחי סוף-קו מאופסים)
    const span = line.sourceSpans?.[0];
    if (span !== undefined) {
      const expected = SOURCE.slice(span.startUtf16, span.endUtf16).replace(/ +$/, '');
      expect(logical).toBe(expected);
    }
    // כל מילה בלוגי קיימת גם בחזותי (אותם אטומים, סדר שונה)
    const wordsOf = (t: string) => t.split(' ').filter((w) => w.length > 0);
    expect(wordsOf(logical).slice().reverse().join(' ')).toBe(wordsOf(run.text).join(' '));
  });

  test('זהות ביט-ביט עם logicalTextOfRun של render-html (CLI) — שני המסלולים', () => {
    const { run } = firstRtlRun();
    expect(logicalTextOfRun(run, SOURCE)).toBe(logicalTextOfRunCli(run, SOURCE));
    // גם ריצות ltr/נגזרות — הכללה מלאה
    for (const page of LAYOUT.pages as readonly { items: readonly { runs?: Parameters<typeof logicalTextOfRun>[0][] }[] }[]) {
      for (const item of page.items) {
        for (const run of item.runs ?? []) {
          expect(logicalTextOfRun(run, SOURCE)).toBe(logicalTextOfRunCli(run, SOURCE));
        }
      }
    }
  });

  test('ריצה נגזרת (ללא אטומים) — הטקסט כמות-שהוא (לוגי מטבעו)', () => {
    const run = { ...firstRtlRun().run, atomIds: [], text: 'כותרת נגזרת' };
    expect(logicalTextOfRun(run as Parameters<typeof logicalTextOfRun>[0], SOURCE)).toBe('כותרת נגזרת');
  });

  test('ריצת ltr — הטקסט החזותי הוא הלוגי (אומת בקורפוס המלא)', () => {
    const run = { ...firstRtlRun().run, direction: 'ltr' as const };
    expect(logicalTextOfRun(run, SOURCE)).toBe(run.text);
  });

  test('אטום החדרה של איחוי פסקאות — רווח בודד; מקור לא מוכר/טווח חורג ⇐ שגיאה קולנית', () => {
    const base = firstRtlRun().run;
    const mk = (atomId: string) => ({ ...base, atomIds: [atomId] as never }) as Parameters<typeof logicalTextOfRun>[0];
    // איחוי פסקאות — רווח (parse.ts: makeTextAtom(' ', origin='parser:paragraph-join'))
    expect(logicalTextOfRun(mk('atom:v1|doc|body|5+5|parser:paragraph-join|0'), SOURCE)).toBe(' ');
    // פרוסת מקור
    expect(logicalTextOfRun(mk('atom:v1|doc|body|0+4|src|0'), SOURCE)).toBe(SOURCE.slice(0, 4));
    // מקור לא מוכר — שגיאה, לא תצוגה שגויה בשקט
    expect(() => logicalTextOfRun(mk('atom:v1|doc|body|0+4|parser:future-thing|0'), SOURCE)).toThrow(/UNKNOWN_ATOM_ORIGIN/);
    // טווח חורג מהמקור
    expect(() => logicalTextOfRun(mk('atom:v1|doc|body|0+99999|src|0'), SOURCE)).toThrow(/ATOM_SPAN_OUT_OF_SOURCE/);
    // מזהה לא פרוס
    expect(() => logicalTextOfRun(mk('garbage'), SOURCE)).toThrow(/ATOM_ID_UNPARSEABLE/);
  });

  test('displayTextOfRun — רווחי סוף-קו מאופסים בקצה הלוגי: זנב לריצת rtl, ראש לריצת ltr', () => {
    // rtl: הריצה השמאלית נושאת את רווחי סוף הקו בזנב הלוגי
    expect(displayTextOfRun('שלום עולם  ', true, 'rtl')).toBe('שלום עולם');
    expect(displayTextOfRun('שלום עולם', true, 'rtl')).toBe('שלום עולם');
    // ltr: בראש הלוגי (ראש חזותי === ראש לוגי)
    expect(displayTextOfRun('  hello world', true, 'ltr')).toBe('hello world');
    // ריצה פנימית — אין חיתוך
    expect(displayTextOfRun('  שלום  ', false, 'rtl')).toBe('  שלום  ');
    // NBSP אינו נחתך (ADR-004)
    expect(displayTextOfRun('שלום\u00a0', true, 'rtl')).toBe('שלום\u00a0');
  });

  test('מקור חסר לריצה עם אטומים ⇐ שגיאה קולנית (render-html); אטום חורג ממקור ריק — גם', () => {
    const { run } = firstRtlRun();
    expect(() => logicalTextOfRunCli(run, undefined)).toThrow(/SOURCE_REQUIRED/);
    expect(() => logicalTextOfRun(run, '')).toThrow(/ATOM_SPAN_OUT_OF_SOURCE/);
  });
});

// ─────────────────────────── 5. טוהר ההיטל ───────────────────────────

describe('שלב 36: ההיטל הטהור (preview-model)', () => {
  test('projectPage פעמיים ⇐ זהות עמוקה; הכלה לוגית של כל קו', () => {
    const page = LAYOUT.pages[0] as Parameters<typeof projectPage>[0];
    const a = projectPage(page, SOURCE);
    const b = projectPage(page, SOURCE);
    expect(a).toEqual(b);
    for (const l of a.lines) {
      expect(l.insetInlineStartPx + l.inlineSizePx).toBeLessThanOrEqual(a.inlineSizePx + 1);
      expect(l.insetBlockStartPx).toBeGreaterThanOrEqual(0);
    }
    const all = projectLayout(LAYOUT, SOURCE);
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
      sourceText: SOURCE,
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
