// @vitest-environment jsdom
/**
 * rtl-ltr.test.tsx — בדיקות שלב 94: RTL/LTR של הממשק והפרדת כיוון הנוסח (§16, §21).
 *
 * מה שמוכח כאן (מול דלתות השלב בתכנית):
 *   1. הכיוון ברמת המסמך וה-shell מתעדכן עם הלוקייל: he ⇒ rtl/he-IL,
 *      en ⇒ ltr/en-US (documentElement + השלד; §16).
 *   2. **כיוון נוסח הספר אינו מתהפך עם שפת הממשק**: העמודים בהיטל
 *      (LayoutPreview — ברירת המחדל שלו) תמיד rtl, גם כשהממשק כולו ltr —
 *      הכיוון נגזר מהתוכן, לא מה-locale (§21).
 *   3. הלוקייל הוא מצב UI בלבד (viewStore) — אינו חלק מהמרשם/ההגדרות
 *      ואינו משנה configHash: החלפת שפה אינה נוגעת ל-draft/effective של
 *      הגדרות הספר ואינה יכולה להזיז אף אות (בדיקת ה-hash הקצה-לקצה
 *      המלאה — ב-E2E 02, אורקל ה-CLI).
 *   4. המעטפת נקייה מכיוון פיזי קשיח: לוח ההגדרות נגרר אחרי ה-shell
 *      (אין dir="rtl" משלו), והעריכה ב-pre של ErrorBoundary נשארת ltr
 *      (מסלול מחסנית — תוכן אנגלית).
 */
import { beforeEach, afterEach, describe, expect, test } from 'vitest';
import { act, render, screen, cleanup } from '@testing-library/react';
import { createElement } from 'react';
import { createTestMeasurementProvider } from '@tora/measurement-api/test';
import { parseSourceText } from '@tora/content-model';
import { typeset as engineTypeset } from '@tora/layout-engine';
import {
  DEFAULT_SEARCH_BUDGET,
  type EffectiveSettings,
  type LayoutDocument,
  type TypesetRequest,
} from '@tora/layout-api';
import { AppShell } from '../../src/components/layout/AppShell.js';
import { LayoutPreview } from '../../src/renderers/LayoutPreview.js';
import { useViewStore } from '../../src/stores/view-store.js';
import { settingsRegistry, useSettingsStore } from '../../src/stores/settings-store.js';
import { createMemoryKVStorage, setKVStorage } from '../../src/stores/storage.js';

// ─────────────────── IR אמיתי מהמנוע (כמו preview.test.tsx) ───────────────────

const SOURCE = `שם הספר - ספר בדיקת כיוון
כותרת 1 מספר 1 - פרק ראשון
והנה פסקה ראשונה עם ניקוד ומספרים 123 ועוד טקסט שימלא שורות בטור, ובתוכה הערה [הערת שוליים] והמשך הפסקה.
ופסקה שניה עם מלים נוספות כדי למלא שורות נוספות בעמודה הראשונה ואולי גם בשניה ועוד ועוד.
`;

const BODY_FONT = Object.freeze({
  fontId: 'guttman-rashi-normal', contentSha256: 'a'.repeat(64),
  family: 'Guttman Rashi', weight: 400, style: 'normal' as const,
});

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
  const r = parseSourceText(SOURCE, { documentId: 'rtl-ltr-test' });
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

const LAYOUT: LayoutDocument = engineTypeset(
  makeRequest(),
  createTestMeasurementProvider(),
  { policyId: 'torah-v1' },
).layout;

// ─────────────────── סביבה ───────────────────

beforeEach(() => {
  setKVStorage(createMemoryKVStorage());
  useViewStore.getState().reset();
});

afterEach(() => {
  cleanup();
  // documentElement הוא מצב גלובלי של ה-jsdom — החזרה לברירת המחדל בין הבדיקות
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'he-IL';
});

// ─────────────────── 1+4. כיוון הממשק עוקב אחרי הלוקייל ───────────────────

describe('שלב 94 — הכיוון ברמת המסמך מתעדכן עם הלוקייל', () => {
  test('he (ברירת המחדל): documentElement וה-shell ב-rtl/he-IL', () => {
    render(createElement(AppShell));
    expect(useViewStore.getState().locale).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('he-IL');
    const shell = document.querySelector('[data-locale="he"]');
    expect(shell).not.toBeNull();
    expect(shell?.getAttribute('dir')).toBe('rtl');
  });

  test('החלפה ל-en: documentElement וה-shell עוברים ל-ltr/en-US (מתג ה-header)', () => {
    render(createElement(AppShell));
    act(() => {
      screen.getByTestId('toggle-locale').click();
    });
    expect(useViewStore.getState().locale).toBe('en');
    expect(document.documentElement.dir).toBe('ltr');
    expect(document.documentElement.lang).toBe('en-US');
    const shell = document.querySelector('[data-locale="en"]');
    expect(shell).not.toBeNull();
    expect(shell?.getAttribute('dir')).toBe('ltr');
  });

  test('הלוך ושוב he→en→he — הכיוון חוזר (אין הידבקות מצב)', () => {
    render(createElement(AppShell));
    act(() => {
      screen.getByTestId('toggle-locale').click();
    });
    act(() => {
      screen.getByTestId('toggle-locale').click();
    });
    expect(useViewStore.getState().locale).toBe('he');
    expect(document.documentElement.dir).toBe('rtl');
  });

  test('לוח ההגדרות נגרר אחרי ה-shell — אין לו dir קשיח משלו (תלויות לוגיות בלבד)', () => {
    render(createElement(AppShell));
    act(() => {
      screen.getByTestId('toggle-settings').click();
    });
    const panel = screen.getByTestId('settings-panel');
    expect(panel.getAttribute('dir')).toBeNull(); // יורש מה-shell — לא קשיח
    // הפאה הפונה לתצוגה היא לוגית (border-s), לא פיזית (border-r)
    expect(panel.className).toContain('border-s');
    expect(panel.className).not.toContain('border-r');
  });

  test('שלב 96 — הפאנלים העמוקים עוקבים אחרי הלוקייל: כותרת הלוח וסרגל התצוגה מתורגמים ב-en', () => {
    render(createElement(AppShell));
    act(() => {
      screen.getByTestId('toggle-locale').click();
    });
    // לוח ההגדרות פתוח — כותרתו באנגלית (הקטלוג; לא מחרוזת קשיחה)
    act(() => {
      screen.getByTestId('toggle-settings').click();
    });
    const panel = screen.getByTestId('settings-panel');
    expect(panel.textContent).toContain('Book settings');
    expect(panel.textContent).not.toContain('הגדרות הספר');
    // סרגל התצוגה — "No result" במקום "אין תוצאה" (ללא IR אין מספר עמודים)
    const toolbar = document.querySelector('[data-testid="preview-scroll"]')?.previousElementSibling;
    expect(toolbar?.textContent ?? '').toContain('No result');
    // וכפתור ההרצה — התווית האנגלית מהקטלוג
    expect(screen.getByTestId('run-typeset').textContent ?? '').toContain('Update and typeset');
  });

  test('שלב 96 — דוגמאות הייבוא מתורגמות: שמות הקבצים ברשימה מהקטלוג (en)', () => {
    render(createElement(AppShell));
    act(() => {
      screen.getByTestId('toggle-locale').click();
    });
    const select = screen.getByTestId('import-sample') as HTMLSelectElement;
    const options = [...select.querySelectorAll('option')].map((o) => o.textContent ?? '');
    expect(options.some((o) => o.includes('Long text'))).toBe(true);
    expect(options.some((o) => o.includes('טקסט ארוך'))).toBe(false);
  });
});

// ─────────────────── 2. הפרדת כיוון הנוסח ───────────────────

describe('שלב 94 — כיוון נוסח הספר אינו מתהפך עם שפת הממשק', () => {
  test('העמודים בהיטל תמיד rtl (ברירת המחדל — לפי התוכן), גם כשהממשק כולו ltr', () => {
    // הממשק באנגלית — דרך המתג האמיתי (ה-effect ב-AppShell מסנכרן את המסמך)
    render(createElement(AppShell));
    act(() => {
      screen.getByTestId('toggle-locale').click();
    });
    expect(document.documentElement.dir).toBe('ltr');
    // ההיטל לא מקבל dir מהלוקייל — ברירת המחדל של LayoutPreview היא rtl
    const { container } = render(
      createElement(LayoutPreview, { layout: LAYOUT, sourceText: SOURCE, status: 'done' }),
    );
    const pages = container.querySelectorAll('.tora-preview-page');
    expect(pages.length).toBe(LAYOUT.pages.length);
    for (const p of pages) {
      expect(p.getAttribute('dir')).toBe('rtl'); // הספר תורני — תמיד
    }
    // גם הריצות בכיוון הטבעי **של התוכן** (מה-IR): עברית ⇒ rtl תמיד;
    // ריצה לטינית/ספרות רשאית להיות ltr — הכיוון נגזר מהנוסח, לא מה-locale
    const runs = container.querySelectorAll('[data-run-direction]');
    expect(runs.length).toBeGreaterThan(0);
    const hebrewRuns = [...runs].filter((r) => /[\u0590-\u05FF]/.test(r.textContent ?? ''));
    expect(hebrewRuns.length).toBeGreaterThan(0);
    for (const r of hebrewRuns) {
      expect(r.getAttribute('data-run-direction')).toBe('rtl');
    }
  });
});

// ─────────────────── 3. הלוקייל אינו חלק מהמודל ───────────────────

describe('שלב 94 — הלוקייל מצב UI בלבד; אינו יכול להזיז אף אות', () => {
  test('אין מפתח locale במרשם ההגדרות — הוא חי רק ב-viewStore', () => {
    // מפתח שאינו במרשם אינו יכול להיכנס ל-draft ואינו נכנס ל-configHash
    expect(settingsRegistry.byKey.has('locale')).toBe(false);
    expect(useViewStore.getState().locale).toBe('he'); // הוא כן קיים ב-viewStore
  });

  test('החלפת לוקייל אינה נוגעת להגדרות הספר — אותה חנות בבת אחת (draft/effective לא זזו)', () => {
    const before = useSettingsStore.getState();
    act(() => {
      useViewStore.getState().setLocale('en');
    });
    const after = useSettingsStore.getState();
    // אותו איבר בזיכרון — החנות לא הוחלפה ולו בשדה אחד
    expect(after).toBe(before);
    expect(after.draft).toBe(before.draft);
    expect(after.effective).toBe(before.effective);
  });
});
